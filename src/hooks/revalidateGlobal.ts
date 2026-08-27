import type { GlobalAfterChangeHook } from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Build an afterChange hook that revalidates a global's cache tag and every
 * prerendered route.
 *
 * @remarks Tag purge alone clears the data cache but never regenerates a
 * static route's shell (same gap fixed for collections in
 * `revalidateCollection.ts`). Globals render site-wide — Navigation/Footer
 * on every page, SiteSettings in every page's metadata, Identity on the
 * home and about pages — so the site-wide `revalidatePath('/', 'layout')`
 * is the honest scope, and global edits are rare enough that the blanket
 * purge is cheap.
 *
 * `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so a save keeps
 * serving old content until a background refresh happens to land AND
 * re-caches that stale render into the CDN in the meantime. `{ expire: 0 }`
 * is the documented read-your-writes profile outside Server Actions: the
 * first post-edit regeneration blocks for fresh data instead of
 * serve-stale-then-refresh.
 *
 * @param slug - The global slug; pages fetch globals with `global_<slug>` tags.
 */
export const revalidateGlobal =
  (slug: string): GlobalAfterChangeHook =>
  ({ doc, req: { payload, context } }) => {
    if (!context.disableRevalidate) {
      payload.logger.info(`Revalidating global: ${slug}`)
      revalidateTag(`global_${slug}`, { expire: 0 })
      revalidatePath('/', 'layout')
    }
    return doc
  }
