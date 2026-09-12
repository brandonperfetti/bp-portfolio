import type { CollectionBeforeDeleteHook, Where } from 'payload'

import type { SurfacePathResolver } from '@/hooks/revalidateCollection'
import { publicPathFor } from '@/fields/slug/slugPaths'

/**
 * The layout-capable collections a `workHistoryCard` block can sit in.
 *
 * @remarks Both register the SAME `pageBuilderBlocks` list
 * (`src/blocks/library.ts`), so a block available to Pages is available to a
 * Post's below-article `layout` too — `posts_blocks_work_history_card` is a
 * real table, not a theoretical one. Listing only `pages` here would rebuild
 * the #207 defect one collection over.
 */
const LAYOUT_HOSTS = ['pages', 'posts'] as const

/**
 * Published documents whose `layout` carries a `workHistoryCard` block naming
 * this row, matched on the block's `entry` relationship.
 *
 * @remarks **Why `layout.entry` and not `layout.workHistoryCard.entry`.**
 * [measured, 2026-09-09, Payload 3.88.0 + `@payloadcms/db-postgres`, migrated
 * schema] the block-scoped spelling is rejected outright, with
 * "The following path cannot be queried: layout.workHistoryCard", while
 * `layout.entry` resolves through the block table and returns the hosting
 * document. `entry` is the
 * only field of that name in the whole block library (`src/blocks/**`), so the
 * unscoped path cannot match another block today; if a second block ever adds
 * one, this query gets WIDER, and a widened purge costs an extra
 * `revalidatePath` while a narrowed one costs a stale page. The asymmetry is
 * why the loose spelling is acceptable and the narrow one is not merely
 * unavailable.
 *
 * **Why `_status: published`.** [measured, same run] `layout.entry` alone also
 * returns rows whose `_status` is `draft`: a draft page has a main-table row,
 * and its `path` is a path nothing serves. Purging it is not wrong, it is
 * noise — and the noise grows with every drafted page an editor leaves around.
 */
const publishedHostsWhere = (entryId: unknown): Where => ({
  and: [
    { 'layout.entry': { equals: entryId as string } },
    { _status: { equals: 'published' } },
  ],
})

/**
 * Every public path that renders `work-history` row `id` through a
 * `workHistoryCard` block (#207, #137).
 *
 * @param args - The row id, and the in-flight request.
 * @returns Deduplicated site-relative paths, or `[]` when nothing renders the
 *   row — and `[]`, never a throw, when the lookup itself fails.
 *
 * @remarks **The reason this is derived and not hard-coded** is the one #207
 * argues: `['/']` was a correct hard-coded list right up until #137 gave the
 * collection a second rendering surface, and nothing about the hard-coding
 * announced that it had gone stale. A list that is computed from the block
 * relationship cannot go stale, because the relationship IS the coupling.
 *
 * **Why the query does NOT join the write's transaction.** Every other nested
 * Local API read in this repo forwards `req` so it sees uncommitted state
 * (`pageHierarchy.ts`, `capturePublishedSlug.ts`). This one deliberately does
 * not, and the reason is the #156 contract rather than a preference: a failed
 * statement inside a Postgres transaction poisons it — every later statement
 * errors with `current transaction is aborted` and the COMMIT fails — so a
 * `req`-bound lookup that throws would fail the very write `containRevalidation`
 * exists to protect, and the surrounding `try/catch` could not save it. Off the
 * transaction, a failure costs this list and nothing else. The read is safe to
 * take from outside because the write in flight is a `work-history` row, and
 * nothing in this query reads that table: the Pages and Posts rows it does read
 * are already committed.
 */
export const workHistoryCardPaths: SurfacePathResolver = async ({
  id,
  req,
}) => {
  const { payload } = req
  if (id === undefined || id === null) return []

  const paths = new Set<string>()

  for (const collection of LAYOUT_HOSTS) {
    try {
      const { docs } = await payload.find({
        collection,
        where: publishedHostsWhere(id),
        overrideAccess: true,
        pagination: false,
        // `limit: 0` is the only unlimited form — `pagination: false` alone
        // still leaves the default cap in place (CLAUDE.md §Gotchas,
        // `@payloadcms/drizzle findMany.js` @ 3.88.0). A capped purge list is
        // the #207 bug with a higher threshold.
        limit: 0,
        depth: 0,
        select: { slug: true, path: true },
      })
      for (const doc of docs) {
        const path = publicPathFor(collection, doc)
        if (path) paths.add(path)
      }
    } catch (error) {
      // Fail open (#156): a surface we could not resolve goes stale; the write
      // that triggered this lands either way. Logged at `error` and never
      // swallowed silently, so a persistent lookup failure is visible.
      payload.logger.error(
        { err: error },
        `Failed to resolve ${collection} rendering work-history#${String(id)}; those paths are not purged (#207)`,
      )
    }
  }

  return [...paths]
}

/**
 * `req.context` key under which {@link captureWorkHistorySurfaces} parks the
 * paths for {@link readCapturedWorkHistorySurfaces} to read back.
 *
 * @remarks Exported for the tests that assert the hand-off, not for call sites.
 */
export const WORK_HISTORY_SURFACES_CONTEXT_KEY = 'workHistorySurfacePaths'

type SurfaceStore = Record<string, string[]>

/**
 * `beforeDelete` companion that resolves a row's rendering surfaces while they
 * can still be found.
 *
 * @remarks **Why the delete path cannot derive in `afterDelete`.** The block's
 * `entry_id` column is `ON DELETE SET NULL`
 * (`pages_blocks_work_history_card_entry_id_work_history_id_fk`), and
 * [measured, 2026-09-09, PostgreSQL 16] the constraint fires inside the
 * deleting transaction, immediately: a `SELECT entry_id` after the `DELETE`
 * and before `COMMIT` already reads NULL. Payload runs `afterDelete` after
 * `db.deleteOne`, so a `layout.entry` query there matches nothing at all — the
 * derivation would return `[]` for every delete and the delete path would
 * silently keep the exact bug #207 is about. `beforeDelete` runs before the
 * row is gone, which is the only window where the relationship still exists.
 *
 * Keyed by id because the bulk `delete` operation loops both hooks per
 * document over one shared `req.context`.
 *
 * **`disableRevalidate` short-circuits the capture**, mirroring the afterChange
 * side. A seed, migration or script that has opted out of the purge must not
 * pay for the lookup either — and it is the same flag the `afterDelete` hook
 * checks, so a capture taken here would be parked for a resolver that is never
 * called.
 */
export const captureWorkHistorySurfaces: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  if (req.context.disableRevalidate) return
  const paths = await workHistoryCardPaths({ id, req })
  const store = (req.context[WORK_HISTORY_SURFACES_CONTEXT_KEY] ??=
    {}) as SurfaceStore
  store[String(id)] = paths
}

/**
 * Read back what {@link captureWorkHistorySurfaces} parked for this id.
 *
 * @remarks `[]` when nothing was captured — the `beforeDelete` hook missing
 * from the collection, a delete driven through a path that skips it, or a
 * `req` with no `context` at all. That degrades to today's behaviour (the
 * static `['/']` alone) rather than to an error, and the optional chaining is
 * what keeps it from throwing SYNCHRONOUSLY, before there is a promise for the
 * builder's `catch` to attach to.
 */
export const readCapturedWorkHistorySurfaces: SurfacePathResolver = ({
  id,
  req,
}) => {
  const store = req?.context?.[WORK_HISTORY_SURFACES_CONTEXT_KEY] as
    SurfaceStore | undefined
  return Promise.resolve(store?.[String(id)] ?? [])
}
