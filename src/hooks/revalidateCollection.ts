import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import { revalidateTag } from 'next/cache'

/**
 * Build afterChange/afterDelete hooks that revalidate a collection's data
 * cache tag, so admin and MCP edits go live without a redeploy.
 *
 * @remarks The frontend reads these collections through `unstable_cache`
 * repos keyed by tag ('tech-stack', 'uses', 'work-history', 'projects');
 * without tag revalidation, route regeneration re-reads STALE data and
 * edits only surface on the next deploy.
 *
 * @param tag - The cache tag the collection's repo caches under.
 */
export const revalidateCollectionTag = (
  tag: string,
): CollectionAfterChangeHook => {
  return ({ doc, req: { payload, context } }) => {
    if (!context.disableRevalidate) {
      payload.logger.info(`Revalidating tag: ${tag}`)
      revalidateTag(tag, 'max')
    }
    return doc
  }
}

/** afterDelete companion to {@link revalidateCollectionTag}. */
export const revalidateCollectionTagDelete = (
  tag: string,
): CollectionAfterDeleteHook => {
  return ({ doc, req: { context } }) => {
    if (!context.disableRevalidate) {
      revalidateTag(tag, 'max')
    }
    return doc
  }
}
