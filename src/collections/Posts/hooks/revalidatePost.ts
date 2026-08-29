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
 * Honest freshness semantics. The 2026-08-10 measurement recorded here —
 * "the DETAIL page is fresh immediately, the `unstable_cache`-backed list
 * surfaces are not" — predates #76 and no longer describes this tree. Under
 * cacheComponents the split was not detail-vs-list at all: every surface read
 * the same per-process cache tier, so each regeneration was an independent
 * coin flip on whether the instance serving it happened to hold a stale entry.
 * The 2026-08-27 detail-page incident is that coin flip losing on a per-slug
 * key that gets few regeneration draws. The `'use cache: remote'` conversion
 * (#118, this batch's sibling commit) is what removes the coin flip for the
 * converted reads. Still true and unchanged: the search index stays on the
 * in-memory tier (over the 2 MB Runtime Cache item ceiling) and converges on
 * its `cmsContent` cadence, and the sitemap refreshes on its own revalidate —
 * the `posts-sitemap` tag purge is aspirational, nothing caches under it, per
 * docs/SEO.md.
 *
 * `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so a publish/edit
 * keeps serving old content until a background refresh happens to land AND
 * re-caches that stale render into the CDN in the meantime. `{ expire: 0 }`
 * expires the entry outright instead, so the next read blocks for fresh data.
 *
 * That is a purge PROFILE, not a purge REACH — an earlier revision of this
 * comment called it "the documented read-your-writes profile outside Server
 * Actions", which overstates it. Read-your-writes needs the work-store state
 * (`previouslyRevalidatedTags` / `pendingRevalidatedTags`) that only a Server
 * Action's own request chain carries; this hook runs in a Route Handler and
 * the visitor's later GET is an unrelated request. What actually makes the
 * purge reach the instance serving that GET is the reader layer living on the
 * shared Runtime Cache — `'use cache: remote'`, #118 — not this argument.
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
 * page 404s immediately; the search index converges on its `cmsContent`
 * cadence and the sitemap on its own revalidate (same semantics as
 * {@link revalidatePost}). Same `{ expire: 0 }` profile reasoning — and the
 * same caveat that the profile is not what gives the purge cross-instance
 * reach — as {@link revalidatePost} (#118).
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
