import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

import type { Post } from '../../../payload-types'

/**
 * afterChange hook that keeps published articles live without a redeploy:
 * pairs `revalidatePath` on `/articles/[slug]` with purges of the
 * 'posts' and 'posts-sitemap' data-cache tags.
 *
 * @remarks Both purges are required — the tag purge refreshes list/search
 * consumers cached under `CMS_TAGS.articles`, while `revalidatePath`
 * regenerates the article's static shell. `CMS_TAGS.articles === 'posts'`
 * is the load-bearing coupling here, pinned by `cache.test.ts` so a tag
 * rename can't silently break publish-time revalidation. Unpublishing also
 * purges the OLD slug's path so the stale page stops serving.
 *
 * Honest freshness semantics (measured 2026-08-10, see docs/MAINTENANCE.md
 * → Watchpoints): the article's DETAIL page is fresh immediately; the
 * `unstable_cache`-backed list surfaces (`/articles`, `/api/search`) were
 * measured NOT reliably refreshed by these purges on Vercel and converge
 * within their 300 s TTLs instead; the sitemap refreshes on its hourly
 * revalidate (the `posts-sitemap` tag purge is aspirational — nothing
 * caches under it, per docs/SEO.md).
 *
 * `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so a publish/edit
 * keeps serving old content until a background refresh happens to land AND
 * re-caches that stale render into the CDN in the meantime. `{ expire: 0 }`
 * is the documented read-your-writes profile outside Server Actions: the
 * first post-edit regeneration blocks for fresh data instead of
 * serve-stale-then-refresh.
 */
export const revalidatePost: CollectionAfterChangeHook<Post> = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = `/articles/${doc.slug}`

      payload.logger.info(`Revalidating post at path: ${path}`)

      revalidatePath(path)
      revalidatePath('/articles')
      revalidatePath('/api/search')
      revalidateTag('posts-sitemap', { expire: 0 })
      revalidateTag('posts', { expire: 0 })
    }

    // If the post was previously published, we need to revalidate the old path
    if (previousDoc._status === 'published' && doc._status !== 'published') {
      const oldPath = `/articles/${previousDoc.slug}`

      payload.logger.info(`Revalidating old post at path: ${oldPath}`)

      revalidatePath(oldPath)
      revalidatePath('/articles')
      revalidatePath('/api/search')
      revalidateTag('posts-sitemap', { expire: 0 })
      revalidateTag('posts', { expire: 0 })
    }
  }
  return doc
}

/**
 * afterDelete companion to {@link revalidatePost}: purges the deleted
 * article's path plus the same 'posts'/'posts-sitemap' tags. The detail
 * page 404s immediately; list surfaces and search converge within their
 * TTLs and the sitemap on its hourly revalidate (same measured semantics
 * as {@link revalidatePost} — docs/MAINTENANCE.md → Watchpoints). Same
 * `{ expire: 0 }` read-your-writes reasoning as {@link revalidatePost}
 * (#118).
 */
export const revalidateDelete: CollectionAfterDeleteHook<Post> = ({
  doc,
  req: { context },
}) => {
  if (!context.disableRevalidate) {
    const path = `/articles/${doc?.slug}`

    revalidatePath(path)
    revalidatePath('/articles')
    revalidatePath('/api/search')
    revalidateTag('posts-sitemap', { expire: 0 })
    revalidateTag('posts', { expire: 0 })
  }

  return doc
}
