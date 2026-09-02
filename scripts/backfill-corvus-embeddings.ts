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
import { canDropOrphans, orphanDeleteBounds } from './lib/orphan-guard.mjs'

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
 * than this comment merely asserting it.
 *
 * ## How the orphan drop is made safe (#123, CodeRabbit wave 2)
 *
 * Deciding that a row is an orphan means deciding that no document owns it,
 * and that decision is only as good as the read it is made from. Three
 * mechanisms, each closing a different way the read can lie:
 *
 * 1. **One read, not a page walk.** Each collection is fetched in a single
 *    `payload.find({ pagination: false })`. Page-by-page reads use SQL
 *    `OFFSET` — Payload's drizzle adapter computes it as
 *    `offset = (page - 1) * limit` — and each page's offset is applied to the
 *    table as it stands at THAT statement. So a concurrent DELETE early in the
 *    collection shifts every later row up by one, and the document straddling
 *    the page boundary is returned by NO page. It is then absent from
 *    `seenIds` while the totals still agree, and its live rows are deleted as
 *    orphans. One statement is one snapshot, which removes the failure mode
 *    rather than detecting it. The corpus makes this affordable: five
 *    collections of tens to low hundreds of documents.
 * 2. **The completeness guard.** {@link canDropOrphans} still refuses a
 *    zero-document read (an empty id list would match every row) and a
 *    response carrying no usable total. Its count comparison is honest but no
 *    longer load-bearing on this path — Payload derives `totalDocs` from the
 *    returned rows when pagination is off — and the guard's own docblock says
 *    so rather than implying a check it cannot perform.
 * 3. **A timestamp bound on the DELETE.** The one race a single read cannot
 *    close by itself: a document CREATED between the read and the deletion has
 *    hook-written rows and an id the read never saw. Because every write path
 *    stamps `updated_at = now()`, bounding the DELETE on `updated_at <`
 *    a database-clock timestamp taken BEFORE the read excludes exactly those
 *    rows. See {@link orphanDeleteBounds} for the trade this makes.
 *
 * What is deliberately NOT done: a repeatable-read transaction around the walk
 * and the delete. Payload's pooled connection is shared with the rest of the
 * process, a long-lived transaction on it would hold a snapshot open for the
 * duration of an embedding run (network calls to the provider, per document),
 * and the residual it would close is already closed by the timestamp bound.
 *
 * Every document is passed through the SAME `syncDocumentEmbeddings` the hooks
 * use, so the backfill and the incremental path can never disagree about what
 * a chunk is.
 *
 * Usage:
 *   payload run scripts/backfill-corvus-embeddings.ts
 *   payload run scripts/backfill-corvus-embeddings.ts -- --drop-orphans
 *   pnpm corvus:backfill -- --drop-orphans
 *
 * The `--` is load-bearing. `payload run` parses its own argv with minimist and
 * rebuilds the script's `process.argv` from the POSITIONAL arguments only, so a
 * bare `--drop-orphans` is consumed as an option to `payload` and never reaches
 * the `process.argv.includes('--drop-orphans')` check below — the run would
 * quietly skip the destructive sweep the operator asked for. (Through the pnpm
 * script the single `--` is enough: pnpm forwards it verbatim to `payload run`.)
 */
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
    // Read the database clock BEFORE the documents. Anything stamped at or
    // after this instant was written while the run was already looking and is
    // out of bounds for the deletion — see `orphanDeleteBounds`. It must be
    // the DATABASE's clock, because it is compared against `updated_at`
    // values that Postgres wrote with `now()`.
    const snapshotAt = dropOrphans ? await readDatabaseNow(db) : null

    // ONE statement, one snapshot: the id set cannot be split across reads, so
    // no concurrent write can shift a document out of every page of a walk.
    const result = await payload.find({
      collection,
      depth: 1,
      // `pagination: false` with `limit: 0` is Payload's "return everything"
      // form; either alone disables pagination, and both together say so
      // unambiguously to the next reader.
      limit: 0,
      pagination: false,
      // Posts are drafts-enabled: ask for the published view explicitly so a
      // doc with an in-flight draft is embedded as READERS see it, never as
      // its unpublished draft reads.
      ...(collection === 'posts' ? { draft: false } : {}),
      overrideAccess: true,
    })

    const docs = result.docs as unknown as Array<Record<string, unknown>>
    const seenIds: number[] = []

    for (const doc of docs) {
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

    const reportedTotal = Number(result.totalDocs)

    if (dropOrphans) {
      // Two gates, in order: is the READ trustworthy, and is the STATEMENT
      // safely bounded. See `scripts/lib/orphan-guard.mjs` for each refusal
      // and why an empty read is the one that matters most.
      const { drop, reason } = canDropOrphans(seenIds.length, reportedTotal)

      if (!drop) {
        payload.logger.warn(
          `[backfill:corvus] ${collection}: read ${seenIds.length} of ` +
            `${Number.isFinite(reportedTotal) ? reportedTotal : 'unknown'} ` +
            `doc(s) (${reason}); SKIPPING orphan deletion — a partial read ` +
            `must never empty the index. Re-run when the collection reads ` +
            `completely.`,
        )
        continue
      }

      const bounds = orphanDeleteBounds(seenIds, snapshotAt)

      // `ok` already implies both fields are present; naming them is what
      // lets TypeScript see that across the untyped `.mjs` boundary, and it
      // costs a comparison that can never be true.
      if (
        !bounds.ok ||
        bounds.idList === null ||
        bounds.notTouchedSince === null
      ) {
        payload.logger.warn(
          `[backfill:corvus] ${collection}: SKIPPING orphan deletion ` +
            `(${bounds.reason}) — the deletion could not be bounded, and an ` +
            `unbounded one can remove rows for documents that still exist.`,
        )
        continue
      }

      const removed = await deleteOrphans(db, collection, bounds)
      totals.deleted += removed
      payload.logger.info(
        `[backfill:corvus] ${collection}: dropped ${removed} orphaned row(s) ` +
          `(untouched since ${bounds.notTouchedSince})`,
      )
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
 * The database's current time, as an ISO-8601 string.
 *
 * @remarks Read from Postgres rather than the process, because the value is
 * compared against `updated_at` columns Postgres itself stamped with `now()`.
 * An application clock running even slightly fast would place the boundary in
 * the database's future and exempt rows the run means to collect; running slow
 * would do the opposite and expose the rows the bound exists to protect.
 *
 * @param db - Payload's drizzle instance.
 * @returns The timestamp, or `null` when the response carries no usable value
 * — which {@link orphanDeleteBounds} turns into a refusal to delete.
 */
async function readDatabaseNow(db: CorvusEmbeddingsDb): Promise<string | null> {
  const result = await db.execute(sql`SELECT now() AS now`)
  const rows = (result as { rows?: Array<Record<string, unknown>> } | null)
    ?.rows
  const value = rows?.[0]?.now

  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Remove rows for documents that no longer exist or are no longer eligible.
 *
 * @remarks Both bounds come from {@link orphanDeleteBounds}, which has already
 * refused every shape that cannot be stated safely — so this function never
 * has to decide anything, and `idList` is provably a list of integers by the
 * time it reaches `sql.raw`. That matters because `sql.raw` bypasses parameter
 * binding, which a variable-length `NOT IN` cannot use in one drizzle
 * fragment. The timestamp, by contrast, IS bound as a parameter.
 *
 * @param db - Payload's drizzle instance.
 * @param collection - Collection slug.
 * @param bounds - The validated id list and timestamp bound.
 * @returns Number of orphaned rows deleted.
 */
async function deleteOrphans(
  db: CorvusEmbeddingsDb,
  collection: string,
  bounds: { idList: string; notTouchedSince: string },
): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM "corvus_embeddings"
    WHERE "collection" = ${collection}
      AND "doc_id" NOT IN (${sql.raw(bounds.idList)})
      AND "updated_at" < ${bounds.notTouchedSince}::timestamptz
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
