import type { CollectionAfterChangeHook } from 'payload'

import { revalidateTag } from 'next/cache'

import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * afterChange hook that purges the redirects data-cache tag whenever a
 * redirect is saved.
 *
 * @remarks The tag comes from `CMS_TAGS` (#133), not from a literal: the
 * reader this purge has to reach — `getCmsRedirects` in
 * `src/lib/cms/redirectsRepo.ts` — subscribes via `cacheTag(CMS_TAGS.redirects)`,
 * so sharing the constant is what makes a rename of the tag move both sides at
 * once. A literal here would survive such a rename unchanged and leave the
 * purge aimed at a tag nothing caches under (the orphaned-purge pattern of
 * #104); `cacheTags.test.ts` pins the pair.
 *
 * @remarks `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so an edited redirect
 * would keep resolving with the old destination until a background refresh
 * happened to land AND re-cache the stale mapping into the CDN in the
 * meantime. `{ expire: 0 }` expires the entry outright instead, so the first
 * post-edit read blocks for fresh data.
 *
 * That is an EXPIRATION profile, not read-your-writes: `updateTag` is the
 * read-your-writes API and it is Server-Action-only, while this hook runs in
 * a Route Handler (Next 16.3.0 docs, `revalidateTag` / `updateTag`).
 */
export const revalidateRedirects: CollectionAfterChangeHook = ({
  doc,
  req: { payload },
}) => {
  payload.logger.info(`Revalidating redirects`)

  revalidateTag(CMS_TAGS.redirects, { expire: 0 })

  return doc
}
