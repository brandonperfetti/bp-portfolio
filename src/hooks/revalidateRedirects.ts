import type { CollectionAfterChangeHook } from 'payload'

import { revalidateTag } from 'next/cache'

import { CMS_TAGS } from '@/lib/cms/cache'
import { containRevalidation } from '@/hooks/containRevalidation'

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
 *
 * @remarks **Two independent guards, and why a revalidation failure must never
 * fail the row write (#135).**
 *
 * This hook is an `afterChange` on the `redirects` collection, and Payload runs
 * `afterChange` inside the operation's transaction: a hook that throws reaches
 * `killTransaction` and the row that was just written is rolled back. So an
 * exception here is not a missed cache purge — it destroys the redirect. That
 * is the whole defect #135 names: `revalidateTag` throws
 * `Invariant: static generation store missing` outside a Next request scope,
 * and every caller that writes a redirect from outside one (a seed script, an
 * integration test, a job runner) silently lost its row.
 *
 * 1. **`context.disableRevalidate`** — the explicit opt-out the sibling hooks
 *    (`revalidatePost`, `revalidatePage`, `createPathRedirect`) already honour.
 *    Read from `req.context`, matching the siblings: a nested Local API call
 *    reassigns `req.context` to a fresh shallow spread
 *    (`createLocalReq.js:86`), so the caller's flag arrives here through `req`
 *    even when this hook was reached via `createPathRedirect`'s
 *    `payload.create({ …, req })`. That is what lets a script or a test write
 *    a redirect row without stubbing `next/cache` at all.
 * 2. **`containRevalidation`** (`src/hooks/containRevalidation.ts`) — the
 *    ticket's "optionally wrap", and it is not optional. The flag only helps
 *    callers who know to set it; the wrap covers the ones who do not, and the
 *    honest position is that we cannot enumerate them. `[inference]` The
 *    scheduled-publish job (`payload/dist/versions/schedule/job.js`) publishes
 *    through `payload.update` without setting `disableRevalidate`, so whether
 *    its redirect row survives would otherwise depend on whether the job
 *    happened to be driven from inside a Next request scope — a property of the
 *    deployment, not of the code. Ranking the two outcomes settles it: a
 *    swallowed purge costs at most one `cmsContent` TTL of a stale redirect
 *    mapping, while a thrown purge costs the redirect row itself and the old
 *    URL 404s permanently. The failure is logged at `error`, never silent.
 *
 *    The wrap was inline here until #156 found the same containment written a
 *    second and third time in `revalidatePost`/`revalidatePage`. All three now
 *    share one function, whose docblock carries the transaction mechanics and
 *    the survey of `scripts/`.
 *
 * The wrap deliberately does NOT extend to anything but the purge, so a real
 * defect in the surrounding hook still fails loudly.
 */
export const revalidateRedirects: CollectionAfterChangeHook = ({
  doc,
  req: { context, payload },
}) => {
  if (context?.disableRevalidate) return doc

  payload.logger.info(`Revalidating redirects`)

  // Never rethrow: see the docblock — an `afterChange` throw rolls the redirect
  // row back, which is strictly worse than a stale cache entry.
  containRevalidation(
    payload,
    'redirect row',
    `the ${CMS_TAGS.redirects} tag`,
    () => revalidateTag(CMS_TAGS.redirects, { expire: 0 }),
  )

  return doc
}
