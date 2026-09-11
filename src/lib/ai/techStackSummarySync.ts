import type { Payload } from 'payload'

import {
  CORVUS_TECH_STACK_SUMMARY_COLLECTION,
  type CorvusChunk,
  TECH_STACK_SUMMARY_DOC_ID,
  type TechStackSummaryRow,
  chunkTechStackSummary,
} from '@/lib/ai/chunking'
import {
  EMBEDDING_TIMEOUT_MS,
  embedChunks,
  getEmbeddingModelId,
} from '@/lib/ai/embeddings'
import { withDeadline } from '@/lib/ai/withDeadline'
import {
  type CorvusEmbeddingsDb,
  type SyncResult,
  deleteDocumentEmbeddings,
  deleteTrailingChunks,
  hasMetadataDrift,
  isContentUnchanged,
  readStoredChunks,
  updateDocumentMetadata,
  upsertChunk,
} from '@/lib/ai/embeddingsStore'

/**
 * The write path for the `tech-stack-summary` pseudo-collection (#165).
 *
 * @remarks Modelled line-for-line on `src/lib/ai/githubReposSync.ts`, and for
 * the same reason that module gives: every SQL statement here comes out of
 * `embeddingsStore.ts` — the same `readStoredChunks`, the same `upsertChunk`
 * against the same `ON CONFLICT (collection, doc_id, chunk_index)` key, the
 * same `deleteTrailingChunks`. Nothing about how a row is written is
 * re-decided, because two different upsert keys is how an index quietly splits
 * in two. Only the ORCHESTRATION is duplicated, and the duplicated part is a
 * sequence anyone can read.
 *
 * `syncDocumentEmbeddings` cannot be reused: its first two steps are an
 * `isEmbeddable` check and a `chunkDocument` call, both of which take a
 * Payload document and a CMS collection slug. The summary is derived from
 * EVERY published `tech-stack` row and is a document of none of them.
 */

/**
 * Read every `tech-stack` row the summary is composed from.
 *
 * @remarks `limit: 0` is the only unlimited form in Payload's `find` — a
 * `limit: N` still caps the result even with `pagination: false`, so a
 * `limit: 1000` meant as "everything" is a silent cap, and a silently capped
 * read here would silently shorten the daily-driver tier. `pagination: false`
 * alongside it says the same thing twice, deliberately, to the next reader.
 *
 * `depth: 0` because the summary names technologies and reads nothing
 * relational; `overrideAccess: true` because this runs inside a hook and a
 * backfill, neither of which has a viewer. `tech-stack` is draft-free
 * (`isEmbeddable` returns `true` for every non-post), so there is no published
 * view to ask for — every row is the published row.
 *
 * @param payload - The Payload instance.
 * @returns The rows, in Payload's default order.
 */
export async function readTechStackSummaryRows(
  payload: Payload,
): Promise<TechStackSummaryRow[]> {
  const result = await payload.find({
    collection: 'tech-stack',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  // Through `unknown`: the generated `TechStack` type has no index signature,
  // and {@link TechStackSummaryRow} deliberately does — it is the "whatever
  // the database actually holds" view the composer reads defensively.
  return result.docs as unknown as TechStackSummaryRow[]
}

/**
 * Bring the summary row in line with the current daily-driver tier.
 *
 * @remarks Three outcomes, and the middle one is the acceptance criterion
 * about spend:
 *
 * 1. Nothing changed — `skipped`, one indexed SELECT, **zero provider calls**.
 *    This is the common case and it is what makes the hook re-emit close to
 *    free: `isContentUnchanged` compares `content_hash` BEFORE the provider is
 *    called, so editing a technology's `notes` — which does not change the
 *    line of names — re-composes the same text, finds the same hash, and
 *    spends nothing.
 * 2. Only the metadata drifted — a plain UPDATE, still no provider call. The
 *    summary's `visibility` is the constant `'public'` and its `sourceUrl` the
 *    constant `/tech`, so in practice this branch only fires on a row written
 *    before either value existed. It is kept because dropping it would make
 *    the one shape it repairs unrepairable without a full re-embed.
 * 3. The tier changed — embed and upsert.
 *
 * An EMPTY daily tier deletes the row rather than embedding a sentence saying
 * there are none. That is what makes the summary track a tier that shrinks to
 * nothing instead of serving a stale list forever.
 *
 * May throw (a provider outage, a database error). The hook swallows it by
 * design and leaves the stale summary; the backfill fails loudly and is
 * re-run. Keeping that decision at the call site is the same split
 * `syncDocumentEmbeddings` documents.
 *
 * @param args - Database handle, the rows, optional abort signal.
 * @returns A {@link SyncResult} describing what changed.
 */
export async function syncTechStackSummaryEmbeddings(args: {
  db: CorvusEmbeddingsDb
  rows: readonly TechStackSummaryRow[]
  abortSignal?: AbortSignal
}): Promise<SyncResult> {
  const { db, rows } = args
  const collection = CORVUS_TECH_STACK_SUMMARY_COLLECTION
  const docId = TECH_STACK_SUMMARY_DOC_ID

  const chunks: CorvusChunk[] = chunkTechStackSummary(rows).chunks
  if (!chunks.length) {
    await deleteDocumentEmbeddings(db, collection, docId)
    return { written: 0, deleted: 1, metadataUpdated: 0, skipped: false }
  }

  const stored = await readStoredChunks(db, collection, docId)
  if (isContentUnchanged(chunks, stored)) {
    if (!hasMetadataDrift(chunks, stored)) {
      return { written: 0, deleted: 0, metadataUpdated: 0, skipped: true }
    }
    await updateDocumentMetadata(
      db,
      collection,
      docId,
      chunks[0].visibility,
      chunks[0].publishedAt,
      chunks[0].sourceUrl,
    )
    return {
      written: 0,
      deleted: 0,
      metadataUpdated: chunks.length,
      skipped: false,
    }
  }

  const model = getEmbeddingModelId()
  const embeddings = await embedChunks(
    chunks.map((chunk) => chunk.content),
    {
      abortSignal:
        args.abortSignal ?? AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    },
  )

  for (const [index, chunk] of chunks.entries()) {
    await upsertChunk(db, chunk, embeddings[index], model)
  }
  await deleteTrailingChunks(db, collection, docId, chunks.length)

  return {
    written: chunks.length,
    deleted: 0,
    metadataUpdated: 0,
    skipped: false,
  }
}

/**
 * Read, compose, sync, and SAY what was dropped on the way (#165).
 *
 * @remarks The one entry point the hook and the backfill share, so the live
 * path and the repair path cannot disagree about what the summary is.
 *
 * The logging is the load-bearing half, and it exists because of a specific
 * failure this design would otherwise repeat `[wave-7 learning 10]`:
 * production data can be missing the field a shipped feature depends on with
 * no error anywhere — all four `work-history` rows carried `slug: null` and
 * would have re-embedded citing the homepage, silently. The analogue here is a
 * technology Brandon believes is a daily driver whose stored `proficiency` is
 * `''`: it drops out of the line of names, the answer looks short, and the
 * failure reads as a retrieval problem rather than a data one. So every
 * skipped row is named at `warn`, with its stored value, on every refresh.
 *
 * @param args - Payload instance, database handle, optional abort signal.
 * @returns A {@link SyncResult} describing what changed.
 */
export async function refreshTechStackSummary(args: {
  payload: Payload
  db: CorvusEmbeddingsDb
  abortSignal?: AbortSignal
}): Promise<SyncResult> {
  const { payload, db } = args
  // The `find` is under the caller's deadline, not outside it. `payload.find`
  // takes no `AbortSignal`, so on a slow database this read — one statement
  // over the whole collection — is the likeliest stall in the whole refresh,
  // and leaving it unbounded would have made the hook's "one
  // HOOK_EMBEDDING_TIMEOUT_MS" promise true only of the provider call.
  // Unbounded when no signal is passed, which is the backfill: a repair tool
  // should fail loudly and be re-run, not give up on a clock.
  const rows = await withDeadline(
    readTechStackSummaryRows(payload),
    args.abortSignal,
  )
  const composition = chunkTechStackSummary(rows)

  if (composition.skipped.length) {
    payload.logger.warn(
      `[corvus] tech-stack summary skipped ${composition.skipped.length} row(s) ` +
        `with no usable name or proficiency — they are ABSENT from the ` +
        `daily-driver tier Corvus answers from: ` +
        composition.skipped
          .map((row) => `${row.name || '<unnamed>'}=${row.proficiency || "''"}`)
          .join(', '),
    )
  }

  const result = await syncTechStackSummaryEmbeddings({
    db,
    rows,
    abortSignal: args.abortSignal,
  })

  payload.logger.info(
    `[corvus] tech-stack summary: daily=${composition.daily.length} ` +
      `written=${result.written} deleted=${result.deleted} ` +
      `metadataUpdated=${result.metadataUpdated} skippedSync=${result.skipped}`,
  )

  return result
}
