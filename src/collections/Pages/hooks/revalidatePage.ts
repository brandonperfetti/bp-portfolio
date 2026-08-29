import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

import type { Page } from '../../../payload-types'

/**
 * afterChange hook that keeps published pages live without a redeploy:
 * pairs `revalidatePath` on the page's route with purges of the
 * 'pages'/'pages-sitemap' data-cache tags.
 *
 * @remarks The data layer (getCmsPageByPath / getPageLayout / CmsPageBlocks)
 * caches under the 'pages' tag — `revalidatePath` alone regenerates the
 * route against STALE data, so admin edits never surfaced without a
 * redeploy.
 *
 * `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so an edit keeps
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
 */
export const revalidatePage: CollectionAfterChangeHook<Page> = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = doc.slug === 'home' ? '/' : `/${doc.slug}`

      payload.logger.info(`Revalidating page at path: ${path}`)

      revalidatePath(path)
      // The data layer (getCmsPageByPath / getPageLayout / CmsPageBlocks)
      // caches under the 'pages' tag — revalidatePath alone regenerates the
      // route against STALE data, so admin edits never surfaced without a
      // redeploy.
      revalidateTag('pages', { expire: 0 })
      revalidateTag('pages-sitemap', { expire: 0 })
    }

    // If the page was previously published, we need to revalidate the old path
    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPath = previousDoc.slug === 'home' ? '/' : `/${previousDoc.slug}`

      payload.logger.info(`Revalidating old page at path: ${oldPath}`)

      revalidatePath(oldPath)
      revalidateTag('pages', { expire: 0 })
      revalidateTag('pages-sitemap', { expire: 0 })
    }
  }
  return doc
}

/**
 * afterDelete companion to {@link revalidatePage}. Same `{ expire: 0 }`
 * immediate-expiration reasoning as {@link revalidatePage} (#118).
 */
export const revalidateDelete: CollectionAfterDeleteHook<Page> = ({
  doc,
  req: { context },
}) => {
  if (!context.disableRevalidate) {
    const path = doc?.slug === 'home' ? '/' : `/${doc?.slug}`
    revalidatePath(path)
    revalidateTag('pages', { expire: 0 })
    revalidateTag('pages-sitemap', { expire: 0 })
  }

  return doc
}
