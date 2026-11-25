import { sql } from '@payloadcms/db-postgres'

import { CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION } from '@/lib/ai/chunking'
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
 * Every summary `doc_id` currently in the index.
 *
 * @param db - Payload's drizzle instance.
 * @returns The distinct `doc_id` values in the summary collection.
 */
async function readIndexedSummaryDocIds(
  db: CorvusEmbeddingsDb,
): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT "doc_id"
    FROM "corvus_embeddings"
    WHERE "collection" = ${CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION}
    ORDER BY "doc_id"
  `)
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : (((result as { rows?: unknown } | null)?.rows as
        Array<Record<string, unknown>> | undefined) ?? [])
  return rows
    .map((row) => Number(row.doc_id))
    .filter((id) => Number.isInteger(id))
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
 * fails the pass without indexing the entries listed before it. That includes
 * two entries that derive the same `doc_id`: they would share one row, and
 * the second would silently overwrite the first.
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
  const chunks = summaries.map((entry) => chunkPrivateRepoSummary(entry))
  const totals: PrivateSummarySyncTotals = {
    listed: chunks.length,
    written: 0,
    skipped: 0,
    metadataUpdated: 0,
    deleted: 0,
  }

  const keep = new Set<number>()
  for (const chunk of chunks) {
    if (keep.has(chunk.docId)) {
      throw new UnpublishableSummaryError(
        `[corvus:private] refusing the allowlist: "${chunk.title}" derives ` +
          `doc_id ${chunk.docId}, which an earlier entry already uses. ` +
          `Rename one, or remove the duplicate.`,
      )
    }
    keep.add(chunk.docId)
  }
  const stale = (await readIndexedSummaryDocIds(db)).filter(
    (id) => !keep.has(id),
  )
  if (dryRun) {
    totals.deleted = stale.length
    return totals
  }

  for (const docId of stale) {
    await deleteDocumentEmbeddings(db, collection, docId)
    totals.deleted += 1
  }

  for (const chunk of chunks) {
    const stored = await readStoredChunks(db, collection, chunk.docId)
    if (isContentUnchanged([chunk], stored)) {
      if (!hasMetadataDrift([chunk], stored)) {
        totals.skipped += 1
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
