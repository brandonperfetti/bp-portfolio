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
 * expires the entry outright instead, so the next read blocks for fresh data.
 *
 * That is a purge PROFILE, not a purge REACH — an earlier revision of this
 * comment called it "the documented read-your-writes profile outside Server
 * Actions", which overstates it. Read-your-writes needs work-store state only
 * a Server Action's own request chain carries; a global save is a Route
 * Handler request and the visitor's later GET is unrelated. What makes the
 * purge reach the instance serving that GET is the globals repos living on the
 * shared Runtime Cache — `'use cache: remote'`, #118 — not this argument.
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
