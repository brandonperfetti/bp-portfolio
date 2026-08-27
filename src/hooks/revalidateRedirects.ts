import type { CollectionAfterChangeHook } from 'payload'

import { revalidateTag } from 'next/cache'

/**
 * afterChange hook that purges the 'redirects' data-cache tag whenever a
 * redirect is saved.
 *
 * @remarks `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so an edited redirect
 * would keep resolving with the old destination until a background refresh
 * happened to land AND re-cache the stale mapping into the CDN in the
 * meantime. `{ expire: 0 }` is the documented read-your-writes profile
 * outside Server Actions: the first post-edit read blocks for fresh data.
 */
export const revalidateRedirects: CollectionAfterChangeHook = ({
  doc,
  req: { payload },
}) => {
  payload.logger.info(`Revalidating redirects`)

  revalidateTag('redirects', { expire: 0 })

  return doc
}
