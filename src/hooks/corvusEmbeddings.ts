import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import type { CorvusCollectionSlug } from '@/lib/ai/chunking'
import {
  type CorvusEmbeddingsDb,
  deleteDocumentEmbeddings,
  syncDocumentEmbeddings,
} from '@/lib/ai/embeddingsStore'

/**
 * Wall-clock bound on the provider call a single content save may trigger.
 *
 * @remarks Shorter than the read path's budget: this one sits in the admin
 * editor's save request, and a hung provider must not wedge it (research §3.7,
 * non-negotiable 5). When the signal fires, the embed rejects, the hook logs,
 * and the save completes with a stale row that the backfill repairs.
 */
export const HOOK_EMBEDDING_TIMEOUT_MS = 8_000

/** The document shape both hooks read; deliberately structural, not per-collection. */
type HookDoc = Record<string, unknown> & { id?: unknown; _status?: unknown }

const isPublished = (doc: HookDoc | null | undefined): boolean =>
  doc?._status === 'published'

/**
 * Is this save an autosave tick?
 *
 * @remarks Posts run `versions.drafts.autosave` at a 100ms interval, so
 * `afterChange` fires constantly while someone types. Autosave writes a DRAFT
 * version, so the published-status guard below already catches the common
 * case; this is the explicit belt to that braces, and it keeps working if
 * Payload ever autosaves a published doc directly. Payload puts the flag on
 * `req.query.autosave`.
 *
 * @param req - The Payload request.
 * @returns `true` when the write came from autosave.
 */
export function isAutosaveRequest(req: unknown): boolean {
  const query = (req as { query?: Record<string, unknown> } | null)?.query
  const flag = query?.autosave
  return flag === true || flag === 'true'
}

/**
 * Payload's drizzle handle, or `null` when the adapter is not Postgres.
 *
 * @param payload - The Payload instance from `req`.
 * @returns The drizzle instance, or `null`.
 */
function drizzleOf(payload: unknown): CorvusEmbeddingsDb | null {
  const db = (payload as { db?: { drizzle?: unknown } } | null)?.db?.drizzle
  return db && typeof (db as CorvusEmbeddingsDb).execute === 'function'
    ? (db as CorvusEmbeddingsDb)
    : null
}

/**
 * afterChange hook keeping one collection's Corvus embeddings fresh (#82).
 *
 * @remarks Refresh is hook-driven, not scheduled, which is what discharges
 * #82's "published-content edits reflect in retrieval without a redeploy" AC.
 * Five behaviors are load-bearing, and each one exists because of a specific
 * failure it prevents:
 *
 * - **`context.disableRevalidate` is honoured**, exactly as the revalidation
 *   hooks beside this one do. The e2e seed and any bulk import set it, so a
 *   seed run spends no provider dollars and takes no provider latency.
 * - **Drafts, unpublished docs, and autosave ticks are skipped.** Without
 *   this, a 100ms autosave interval would embed on every keystroke batch.
 * - **Unchanged content is skipped before the provider is called**, by
 *   `content_hash` comparison inside `syncDocumentEmbeddings`. The common save
 *   is one indexed SELECT and nothing else. The one thing that skip must NOT
 *   swallow is a change to `visibility` or `published_at`: those are stored
 *   per-row and are what retrieval filters on, so the store repairs them with a
 *   plain UPDATE (still no provider call) and reports `metadataUpdated`, which
 *   is logged distinctly below.
 * - **A published → draft transition DELETES the document's rows**, detected
 *   the same way `revalidatePost` detects it — a previously published doc
 *   arriving with a non-published `_status`. Unpublishing must remove
 *   content from retrieval, not merely stop refreshing it — otherwise
 *   unpublishing an article leaves Corvus still quoting it.
 * - **It never throws.** A provider outage must not fail a content save. The
 *   error is logged through `req.payload.logger` and the stale row is left in
 *   place; `scripts/backfill-corvus-embeddings.ts` is the repair path. This is
 *   the same "the index is derived and rebuildable" stance the migration takes
 *   by keeping the table out of the Payload config.
 *
 * The provider call is awaited rather than fired and forgotten, bounded by
 * {@link HOOK_EMBEDDING_TIMEOUT_MS}: a floating promise in a serverless
 * function is not guaranteed to run at all, and an awaited-but-bounded call
 * has a knowable worst case.
 *
 * @param collection - Which embedded collection this hook is wired onto.
 * @returns An `afterChange` hook.
 */
export const refreshCorvusEmbeddings = (
  collection: CorvusCollectionSlug,
): CollectionAfterChangeHook => {
  return async ({ doc, previousDoc, req }) => {
    const { payload, context } = req
    if (context?.disableRevalidate) return doc

    try {
      const db = drizzleOf(payload)
      if (!db) return doc

      const current = doc as HookDoc
      const previous = previousDoc as HookDoc | undefined
      const docId = Number(current?.id)
      if (!Number.isFinite(docId)) return doc

      // Unpublish (published → draft), detected exactly as revalidatePost
      // detects it. Delete first and return: an unpublished doc is not
      // embeddable, so falling through would only re-derive the same delete.
      if (isPublished(previous) && !isPublished(current)) {
        await deleteDocumentEmbeddings(db, collection, docId)
        payload.logger.info(
          `[corvus] unpublished ${collection}#${docId}: embeddings deleted`,
        )
        return doc
      }

      if (isAutosaveRequest(req)) return doc

      const result = await syncDocumentEmbeddings({
        db,
        collection,
        doc: current,
        abortSignal: AbortSignal.timeout(HOOK_EMBEDDING_TIMEOUT_MS),
      })

      if (result.metadataUpdated > 0) {
        // Logged distinctly from a re-embed: this path spends NO provider
        // dollars and is how a public → gated flip (or a re-date) takes effect
        // immediately rather than waiting for an unrelated body edit.
        payload.logger.info(
          `[corvus] embedding metadata corrected for ${collection}#${docId}: ` +
            `rows=${result.metadataUpdated} (visibility/published_at, no re-embed)`,
        )
      } else if (!result.skipped) {
        payload.logger.info(
          `[corvus] embeddings refreshed for ${collection}#${docId}: ` +
            `written=${result.written} deleted=${result.deleted}`,
        )
      }
    } catch (error) {
      // NEVER throw: a provider outage or a database hiccup must not fail the
      // content save. The stale row stays; the backfill script repairs it.
      payload.logger.error(
        `[corvus] embedding refresh failed for ${collection}; leaving the ` +
          `existing rows in place (payload run scripts/backfill-corvus-embeddings.ts repairs it): ${String(error)}`,
      )
    }

    return doc
  }
}

/**
 * afterDelete companion to {@link refreshCorvusEmbeddings}.
 *
 * @remarks Same never-throw contract, for the same reason: a failure here must
 * not fail the delete. The asymmetry with the afterChange path is that a
 * failed delete leaves content in the index that no longer exists on the site,
 * so it logs at error level and names the repair path explicitly.
 *
 * @param collection - Which embedded collection this hook is wired onto.
 * @returns An `afterDelete` hook.
 */
export const deleteCorvusEmbeddings = (
  collection: CorvusCollectionSlug,
): CollectionAfterDeleteHook => {
  return async ({ doc, req }) => {
    const { payload, context } = req
    if (context?.disableRevalidate) return doc

    try {
      const db = drizzleOf(payload)
      if (!db) return doc

      const docId = Number((doc as HookDoc)?.id)
      if (!Number.isFinite(docId)) return doc

      await deleteDocumentEmbeddings(db, collection, docId)
      payload.logger.info(
        `[corvus] embeddings deleted for ${collection}#${docId}`,
      )
    } catch (error) {
      payload.logger.error(
        `[corvus] embedding delete failed for ${collection}; stale rows may ` +
          `remain (payload run scripts/backfill-corvus-embeddings.ts repairs it): ${String(error)}`,
      )
    }

    return doc
  }
}
