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
 * @param slug - The global slug; pages fetch globals with `global_<slug>` tags.
 */
export const revalidateGlobal =
  (slug: string): GlobalAfterChangeHook =>
  ({ doc, req: { payload, context } }) => {
    if (!context.disableRevalidate) {
      payload.logger.info(`Revalidating global: ${slug}`)
      revalidateTag(`global_${slug}`, 'max')
      revalidatePath('/', 'layout')
    }
    return doc
  }
