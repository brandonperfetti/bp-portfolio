import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

import { containRevalidation } from '@/hooks/containRevalidation'

/**
 * The whole purge for one collection: its data-cache tag, then every consumer
 * route's shell.
 *
 * @remarks Named and shared for the same reason `purgePostSurfaces` is one
 * collection over: the afterChange and afterDelete hooks below need the
 * identical group, and a copy that purged the tag but not the paths would be a
 * silent staleness bug of exactly the kind the `@remarks` above
 * {@link revalidateCollectionTag} records. It is also the unit of containment —
 * see {@link collectionSurfaces}.
 */
const purgeCollectionSurfaces = (tag: string, paths: string[]) => () => {
  revalidateTag(tag, { expire: 0 })
  for (const path of paths) {
    revalidatePath(path)
  }
}

/** What {@link purgeCollectionSurfaces} covers, for the containment log line. */
const collectionSurfaces = (tag: string, paths: string[]) =>
  `the ${tag} tag and the paths ${paths.join(', ') || '(none)'}`

/**
 * Build afterChange/afterDelete hooks that revalidate a collection's data
 * cache tag AND the static routes that render it, so admin and MCP edits
 * go live without a redeploy.
 *
 * @remarks The frontend reads these collections through `unstable_cache`
 * repos keyed by tag ('tech-stack', 'uses', 'work-history', 'projects').
 * Two purges are required, not one: `revalidateTag` clears the data cache
 * but does NOT regenerate a statically prerendered route's shell, so
 * tag-only revalidation left pages (e.g. the home Work card) serving the
 * build-time prerender indefinitely — verified live on staging when
 * work-history edits never surfaced despite the tag purge logging. Pairing
 * `revalidatePath` for each consumer route matches the proven Pages hook
 * pattern (`revalidatePage.ts`).
 *
 * Limitation: layout-builder pages that embed a collection-driven block
 * (e.g. `workHistoryCard` on an arbitrary slug) are not in the static
 * `paths` list; they refresh when that page is next edited or deployed.
 *
 * `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so a save keeps
 * serving old content until a background refresh happens to land AND
 * re-caches that stale render into the CDN in the meantime. `{ expire: 0 }`
 * expires the entry outright instead, so the first post-edit regeneration
 * blocks for fresh data rather than serve-stale-then-refresh.
 *
 * That is an EXPIRATION profile, not read-your-writes. `updateTag` is the
 * read-your-writes API and it is Server-Action-only; this hook runs in a
 * Route Handler, where `revalidateTag(tag, { expire: 0 })` is the documented
 * way to expire immediately (Next 16.3.0 docs, `revalidateTag` /
 * `updateTag`).
 *
 * **A revalidation failure never fails the write (#156).** The purge goes
 * through `containRevalidation` (`src/hooks/containRevalidation.ts`) for the
 * reason that module's docblock argues once for every hook that shares it:
 * Payload runs `afterChange` INSIDE the operation's transaction, so a purge
 * that throws does not cost a cache entry — it rolls back the Categories or
 * WorkHistory row that was just written. `revalidateTag`/`revalidatePath`
 * throw `Invariant: static generation store missing` outside a Next request
 * scope, which is every Local-API script, seed and job-driven write, and these
 * collections are exactly what such writers touch. The `disableRevalidate` fast
 * path is unchanged and still short-circuits the whole hook before any purge is
 * attempted; it is not a substitute, because it only helps callers who set it.
 *
 * @param tag - The cache tag the collection's repo caches under.
 * @param paths - Route paths whose prerenders render this collection.
 */
export const revalidateCollectionTag = (
  tag: string,
  paths: string[] = [],
): CollectionAfterChangeHook => {
  return ({ doc, req: { payload, context } }) => {
    if (!context.disableRevalidate) {
      payload.logger.info(
        `Revalidating tag: ${tag} (paths: ${paths.join(', ') || 'none'})`,
      )
      containRevalidation(
        payload,
        'collection write',
        collectionSurfaces(tag, paths),
        purgeCollectionSurfaces(tag, paths),
      )
    }
    return doc
  }
}

/**
 * afterDelete companion to {@link revalidateCollectionTag}.
 *
 * @remarks Same `{ expire: 0 }` immediate-expiration reasoning as
 * {@link revalidateCollectionTag} — a delete must stop serving the removed
 * doc's data as fast as a save surfaces new data (#118).
 *
 * Containment (#156) applies here for a reason that is not weaker than on the
 * afterChange side but stronger: `afterDelete` also runs inside the operation's
 * transaction, so an uncontained purge throw resurrects the row the caller
 * asked to delete.
 */
export const revalidateCollectionTagDelete = (
  tag: string,
  paths: string[] = [],
): CollectionAfterDeleteHook => {
  return ({ doc, req: { payload, context } }) => {
    if (!context.disableRevalidate) {
      containRevalidation(
        payload,
        'collection write',
        collectionSurfaces(tag, paths),
        purgeCollectionSurfaces(tag, paths),
      )
    }
    return doc
  }
}
