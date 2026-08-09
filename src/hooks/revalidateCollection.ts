import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

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
      revalidateTag(tag, 'max')
      for (const path of paths) {
        revalidatePath(path)
      }
    }
    return doc
  }
}

/** afterDelete companion to {@link revalidateCollectionTag}. */
export const revalidateCollectionTagDelete = (
  tag: string,
  paths: string[] = [],
): CollectionAfterDeleteHook => {
  return ({ doc, req: { context } }) => {
    if (!context.disableRevalidate) {
      revalidateTag(tag, 'max')
      for (const path of paths) {
        revalidatePath(path)
      }
    }
    return doc
  }
}
