import { sql } from '@payloadcms/db-postgres'

import {
  CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION,
  type CorvusChunk,
} from '@/lib/ai/chunking'
import {
  EMBEDDING_TIMEOUT_MS,
  embedChunks,
  getEmbeddingModelId,
} from '@/lib/ai/embeddings'
import {
  type CorvusEmbeddingsDb,
  deleteDocumentEmbeddings,
  deleteTrailingChunks,
  hasMetadataDrift,
  isContentUnchanged,
  readStoredChunks,
  updateDocumentMetadata,
  upsertChunk,
} from '@/lib/ai/embeddingsStore'
import {
  type PrivateRepoSummary,
  UnpublishableSummaryError,
  chunkPrivateRepoSummary,
  privateRepoSummaryDocId,
} from '@/lib/ai/privateRepoSummaries'

/** What one summary pass did. */
export interface PrivateSummarySyncTotals {
  /** Entries on the allowlist. */
  listed: number
  /** Summaries embedded and written. */
  written: number
  /** Summaries whose stored text already matched — no provider call. */
  skipped: number
  /** Summaries whose citation alone changed — updated without re-embedding. */
  metadataUpdated: number
  /** Summary documents removed because they left the allowlist. */
  deleted: number
}

/**
 * Every summary document currently in the index, with the title it holds.
 *
 * @remarks The title is read so a `doc_id` can be checked against the entry
 * that now claims it. Two names can hash to the same id (#193 review), so an
 * id alone does not say whose summary a row is.
 *
 * @param db - Payload's drizzle instance.
 * @returns One `{ docId, title }` per distinct stored document.
 */
async function readIndexedSummaries(
  db: CorvusEmbeddingsDb,
): Promise<Array<{ docId: number; title: string }>> {
  const result = await db.execute(sql`
    SELECT DISTINCT "doc_id", "title"
    FROM "corvus_embeddings"
    WHERE "collection" = ${CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION}
    ORDER BY "doc_id"
  `)
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : (((result as { rows?: unknown } | null)?.rows as
        Array<Record<string, unknown>> | undefined) ?? [])
  return rows
    .map((row) => ({ docId: Number(row.doc_id), title: String(row.title) }))
    .filter((row) => Number.isInteger(row.docId))
}

/**
 * Bring the summary collection in line with the allowlist (#193).
 *
 * @remarks The same statements as every other write path
 * (`embeddingsStore.ts`), in the same order: hashes are compared before the
 * provider is called, so an unchanged allowlist spends nothing.
 *
 * **The sweep always runs, and that is safe here in a way it is not for the
 * public sync.** `github-repos` must refuse to prune after a partial listing,
 * because a repository it failed to read looks exactly like one that was
 * removed. The allowlist is a constant in the code: it cannot be partially
 * read, so every summary row it does not name is one an owner removed, and
 * removing an entry must take its row out of the index on the next run. An
 * empty allowlist therefore empties the collection.
 *
 * The sweep runs FIRST, before any provider call (#193 review): a removal is
 * a revocation, and it must not wait on an embedding that can fail. Removing
 * one repository while adding another whose embed then fails still takes the
 * removed one out of the index.
 *
 * Every entry is validated before anything is written, so one bad entry
 * fails the pass without indexing any entry. That includes two entries that
 * derive the same `doc_id`: they would share one row, and the second would
 * silently overwrite the first. A bad entry does not block the sweep (#193
 * review): rows the allowlist dropped are still removed, and the bad entry
 * keeps the row it already had, from the last version that passed.
 *
 * A dry run reads the stored rows and counts each entry as the apply would
 * (written, skipped or metadata-updated), with no provider call and no
 * write.
 *
 * Two runs at once are not serialized: a run that has embedded an entry can
 * write it back after a second run, with an allowlist that omits it, has
 * swept it. That needs two runs from different allowlists at the same time
 * (the scheduled run and a local apply from another commit), and the next
 * run removes the row. `docs/AI.md` § Private repositories says not to
 * apply locally while a scheduled run is in flight.
 *
 * @param args - Database handle, the allowlist, and `dryRun` to report
 * without writing.
 * @returns What the pass did, or would have done on a dry run.
 * @throws `UnpublishableSummaryError` for an entry that fails validation, or
 * whatever the store or provider throws.
 */
export async function syncPrivateRepoSummaries(args: {
  db: CorvusEmbeddingsDb
  summaries: readonly PrivateRepoSummary[]
  dryRun?: boolean
  abortSignal?: AbortSignal
}): Promise<PrivateSummarySyncTotals> {
  const { db, summaries, dryRun = false } = args
  const collection = CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION
  // Validate every entry, but let a bad one block only its own write: the
  // sweep below must still revoke what the allowlist dropped (#193 review).
  // An invalid entry keeps whatever row it already has (the last version
  // that passed), so its id and title are protected from the sweep.
  const chunks: CorvusChunk[] = []
  const refusals: string[] = []
  const protectedRows = new Set<string>()
  const rowKey = (docId: number, title: string | null) =>
    `${docId}\u0000${title}`
  const titleOf = (name: string) => `${name.trim()} (private repository)`
  for (const entry of summaries) {
    try {
      chunks.push(chunkPrivateRepoSummary(entry))
    } catch (error) {
      if (!(error instanceof UnpublishableSummaryError)) throw error
      refusals.push(error.message)
      protectedRows.add(
        rowKey(privateRepoSummaryDocId(entry.name), titleOf(entry.name)),
      )
    }
  }
  const totals: PrivateSummarySyncTotals = {
    listed: summaries.length,
    written: 0,
    skipped: 0,
    metadataUpdated: 0,
    deleted: 0,
  }

  // Two entries that derive one `doc_id` would share a row, and the second
  // would silently overwrite the first: both are refused, and both keep
  // whatever row they already have.
  const claims = new Map<number, CorvusChunk[]>()
  for (const chunk of chunks) {
    claims.set(chunk.docId, [...(claims.get(chunk.docId) ?? []), chunk])
  }
  const valid: CorvusChunk[] = []
  for (const [docId, claimants] of claims) {
    if (claimants.length === 1) {
      valid.push(claimants[0])
      continue
    }
    refusals.push(
      `[corvus:private] refusing the allowlist: ` +
        `${claimants.map((chunk) => `"${chunk.title}"`).join(' and ')} ` +
        `derive doc_id ${docId}. Rename one, or remove the duplicate.`,
    )
    for (const chunk of claimants) protectedRows.add(rowKey(docId, chunk.title))
  }

  // Stale: an id no valid entry claims, or one whose stored title is not the
  // claiming entry's. The second is a removed repository whose name hashed
  // to the same id as a newly added one (#193 review); left in place, it
  // would stay retrievable whenever the new entry's embed failed.
  const titleFor = new Map(valid.map((chunk) => [chunk.docId, chunk.title]))
  const stale = [
    ...new Set(
      (await readIndexedSummaries(db))
        .filter(
          ({ docId, title }) =>
            titleFor.get(docId) !== title &&
            !protectedRows.has(rowKey(docId, title)),
        )
        .map(({ docId }) => docId),
    ),
  ]
  if (dryRun) {
    totals.deleted = stale.length
  } else {
    for (const docId of stale) {
      await deleteDocumentEmbeddings(db, collection, docId)
      totals.deleted += 1
    }
  }

  // A refused entry fails the pass after the sweep and before any write, so
  // no entry is indexed from an allowlist that holds a bad one.
  if (refusals.length > 0) {
    throw new UnpublishableSummaryError(refusals.join('\n'))
  }

  // A dry run classifies every entry the way a real run would, from reads
  // alone, so its counts line names what the apply will write (#193 review).
  for (const chunk of valid) {
    const stored = await readStoredChunks(db, collection, chunk.docId)
    if (isContentUnchanged([chunk], stored)) {
      if (!hasMetadataDrift([chunk], stored)) {
        totals.skipped += 1
        continue
      }
      if (dryRun) {
        totals.metadataUpdated += 1
        continue
      }
      await updateDocumentMetadata(
        db,
        collection,
        chunk.docId,
        chunk.visibility,
        chunk.publishedAt,
        chunk.sourceUrl,
      )
      totals.metadataUpdated += 1
      continue
    }
    if (dryRun) {
      totals.written += 1
      continue
    }
    const [embedding] = await embedChunks([chunk.content], {
      abortSignal:
        args.abortSignal ?? AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    })
    await upsertChunk(db, chunk, embedding, getEmbeddingModelId())
    await deleteTrailingChunks(db, collection, chunk.docId, 1)
    totals.written += 1
  }
  return totals
}
