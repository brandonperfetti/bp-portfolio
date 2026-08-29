import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import {
  CORVUS_EMBEDDED_COLLECTIONS,
  type CorvusCollectionSlug,
} from '../src/lib/ai/chunking'
import {
  type CorvusEmbeddingsDb,
  syncDocumentEmbeddings,
} from '../src/lib/ai/embeddingsStore'
import { getEmbeddingModelId } from '../src/lib/ai/embeddings'
import { canDropOrphans } from './lib/orphan-guard.mjs'

/**
 * Populate and repair `corvus_embeddings` from the live content (#82).
 *
 * @remarks Three jobs, one script:
 *
 * 1. **Initial population** after the migration lands — the hooks only fire on
 *    a save, so an existing corpus is invisible to retrieval until this runs.
 * 2. **Repair.** The refresh hooks never throw (a provider outage must not
 *    fail a content save), which means a failed refresh deliberately leaves a
 *    stale row behind. This is the path that fixes it. `content_hash` skipping
 *    makes a re-run over an already-current index nearly free, so running it
 *    is never the wrong call.
 * 3. **Model changes.** `readStoredHashes` treats a row written by a different
 *    `model` as absent, so a run after changing `AI_EMBEDDING_MODEL` re-embeds
 *    everything instead of leaving two vector spaces mixed in one index.
 *
 * `--drop-orphans` additionally removes rows whose source document no longer
 * exists or is no longer eligible. It is off by default because it is the only
 * destructive mode here, and a partial content read should never be allowed to
 * silently empty the index — a rule {@link canDropOrphans} now enforces rather
 * than this comment merely asserting it. The deletion runs only when the ids
 * walked match the `totalDocs` the final page reported, so pagination drift
 * under concurrent writes and a zero-document read both skip it loudly
 * instead of dropping rows.
 *
 * Every document is passed through the SAME `syncDocumentEmbeddings` the hooks
 * use, so the backfill and the incremental path can never disagree about what
 * a chunk is.
 *
 * Usage:
 *   payload run scripts/backfill-corvus-embeddings.ts
 *   payload run scripts/backfill-corvus-embeddings.ts --drop-orphans
 */
const PAGE_SIZE = 50

const dropOrphans = process.argv.includes('--drop-orphans')

type Totals = {
  written: number
  skipped: number
  deleted: number
  metadataUpdated: number
  failed: number
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const db = payload.db.drizzle as unknown as CorvusEmbeddingsDb
  const totals: Totals = {
    written: 0,
    skipped: 0,
    deleted: 0,
    metadataUpdated: 0,
    failed: 0,
  }

  payload.logger.info(
    `[backfill:corvus] starting with model ${getEmbeddingModelId()} ` +
      `(collections: ${CORVUS_EMBEDDED_COLLECTIONS.join(', ')})`,
  )

  for (const collection of CORVUS_EMBEDDED_COLLECTIONS) {
    const seenIds: number[] = []
    let page = 1
    let hasNextPage = true
    // What the LAST page Payload returned claimed the collection holds. The
    // orphan drop is gated on this agreeing with what we actually walked.
    let reportedTotal: number | null = null

    while (hasNextPage) {
      const result = await payload.find({
        collection,
        depth: 1,
        limit: PAGE_SIZE,
        page,
        pagination: true,
        // Posts are drafts-enabled: ask for the published view explicitly so a
        // doc with an in-flight draft is embedded as READERS see it, never as
        // its unpublished draft reads.
        ...(collection === 'posts' ? { draft: false } : {}),
        overrideAccess: true,
      })

      for (const doc of result.docs as unknown as Array<
        Record<string, unknown>
      >) {
        const docId = Number(doc.id)
        seenIds.push(docId)
        try {
          const outcome = await syncDocumentEmbeddings({
            db,
            collection: collection as CorvusCollectionSlug,
            doc,
          })
          totals.written += outcome.written
          totals.deleted += outcome.deleted
          totals.metadataUpdated += outcome.metadataUpdated
          if (outcome.skipped) totals.skipped += 1
        } catch (error) {
          // Log and continue: one bad document must not abandon the rest of
          // the corpus. The non-zero `failed` count in the summary (and the
          // non-zero exit below) is what makes the failure impossible to miss.
          totals.failed += 1
          payload.logger.error(
            `[backfill:corvus] ${collection}#${docId} failed: ${String(error)}`,
          )
        }
      }

      reportedTotal = Number(result.totalDocs)
      hasNextPage = Boolean(result.hasNextPage)
      page += 1
    }

    if (dropOrphans) {
      // The docblock's promise — "a partial content read should never be
      // allowed to silently empty the index" — enforced rather than merely
      // stated. See `scripts/lib/orphan-guard.mjs` for the three refusals and
      // why an empty read is one of them.
      const { drop, reason } = canDropOrphans(seenIds.length, reportedTotal)

      if (!drop) {
        payload.logger.warn(
          `[backfill:corvus] ${collection}: saw ${seenIds.length} of ` +
            `${reportedTotal ?? 'unknown'} doc(s) (${reason}); SKIPPING ` +
            `orphan deletion — a partial read must never empty the index. ` +
            `Re-run when the collection reads completely.`,
        )
      } else {
        const removed = await deleteOrphans(db, collection, seenIds)
        totals.deleted += removed
        payload.logger.info(
          `[backfill:corvus] ${collection}: dropped ${removed} orphaned row(s)`,
        )
      }
    }
  }

  payload.logger.info(
    `[backfill:corvus] done: written=${totals.written} ` +
      `metadataUpdated=${totals.metadataUpdated} skippedDocs=${totals.skipped} ` +
      `deleted=${totals.deleted} failed=${totals.failed}`,
  )

  if (totals.failed > 0) {
    throw new Error(
      `[backfill:corvus] ${totals.failed} document(s) failed to embed`,
    )
  }
}

/**
 * Remove rows for documents that no longer exist or are no longer eligible.
 *
 * @param db - Payload's drizzle instance.
 * @param collection - Collection slug.
 * @param seenIds - Ids observed in this run.
 * @returns Number of orphaned rows deleted.
 */
async function deleteOrphans(
  db: CorvusEmbeddingsDb,
  collection: string,
  seenIds: number[],
): Promise<number> {
  // Integer-filtered before interpolation: `sql.raw` bypasses parameter
  // binding, so the list must be provably numeric. A `NOT IN` over bound
  // parameters is not expressible in one drizzle fragment for a variable-length
  // list, and the ids come from `Number(doc.id)` on rows Payload just returned.
  const ids = seenIds.filter((id) => Number.isInteger(id))
  const idList = ids.length ? ids.join(',') : '-1'
  const result = await db.execute(sql`
    DELETE FROM "corvus_embeddings"
    WHERE "collection" = ${collection}
      AND "doc_id" NOT IN (${sql.raw(idList)})
  `)
  const count = (result as { rowCount?: unknown } | null)?.rowCount
  return typeof count === 'number' ? count : 0
}

// `payload run` kills floating promises after module evaluation — top-level
// await is required (same lesson as the e2e seed and the article migration).
try {
  await run()
  process.exit(0)
} catch (err) {
  console.error('[backfill:corvus] fatal:', err)
  process.exit(1)
}
