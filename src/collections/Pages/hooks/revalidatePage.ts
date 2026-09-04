import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

import { publicPathFor } from '@/fields/slug/slugPaths'
import { containRevalidation } from '@/hooks/containRevalidation'
import type { Page } from '../../../payload-types'

/**
 * Expire both page data-cache tags with the immediate-expiration profile.
 *
 * @remarks Named because all three branches below need the identical pair and a
 * branch that purged only one would be a silent staleness bug, not a visible
 * one: the route would regenerate against a fresh `pages` read and a stale
 * `pages-sitemap` one, or the reverse.
 *
 * `{ expire: 0 }`, never `'max'` (#118) — under cacheComponents `'max'` is
 * stale-while-revalidate with a one-year window, so an edit keeps serving old
 * content until a background refresh happens to land.
 */
const purgePageTags = () => {
  revalidateTag('pages', { expire: 0 })
  revalidateTag('pages-sitemap', { expire: 0 })
}

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
 * **Which transitions purge which path (#132).** Same decision and same
 * ownership rule as `revalidatePost`
 * (`src/collections/Posts/hooks/revalidatePost.ts`) — the hook that writes a
 * redirect row owns purging that row's `from`, this hook owns the page's own
 * paths — and the matrix is pinned in
 * `revalidatePage.test.ts`. A publish purges the page's current path; an
 * unpublish purges `previousDoc`'s path; a published→published rename purges
 * only the NEW path here, with `createSlugRedirect` purging the old one.
 *
 * **The vocabulary conflict is closed (#132 → #148).** Pages used to make the
 * argument concrete in the worst way: this hook hand-built the root's `/` in three
 * places by comparing the slug to the root slug, while
 * `publicPathForSlug('pages', <root slug>)` yielded `/home`, so a purge
 * spelled in the wrong one of those two never uncovered the row it was meant to
 * uncover. Both sides now go through `publicPathFor`, which owns the root
 * mapping outright, so the two vocabularies are the same vocabulary and the
 * three hand-built root comparisons are gone.
 *
 * The ownership split #132 decided is unchanged and still the reason this hook
 * does not purge a rename's old path: whoever writes a redirect row purges that
 * row's `from`; this hook purges the document's own paths. What changed is only
 * that both now spell those paths identically. Placement makes that mandatory
 * rather than merely tidy — a placed page's path is `/work/brytecore`, which no
 * `/`+slug template can produce.
 *
 * The autosave gap on the unpublish branch is identical to the Posts one and
 * documented there: Pages autosaves at the same 100ms interval, so unpublishing
 * with a pending draft leaves `previousDoc._status === 'draft'` and purges
 * nothing. Measured 2026-09-02, pinned by test, tracked in a follow-up to
 * #132.
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
 *
 * **A revalidation failure never fails the write (#156).** Every
 * `revalidatePath`/`revalidateTag` call below goes through
 * `containRevalidation` (`src/hooks/containRevalidation.ts`), which logs at
 * `error` with the path and the reason and lets the page land. That module's
 * docblock is where the argument lives, once, for all three call sites — this
 * hook, `revalidatePost` and `revalidateRedirects` (#135): `afterChange` runs
 * inside the operation's transaction, so an uncontained throw rolls the page
 * back, and no script in this repo wants revalidation to be fatal. The
 * `disableRevalidate` fast path is unchanged.
 */
export const revalidatePage: CollectionAfterChangeHook<Page> = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = publicPathFor('pages', doc)

      if (path) {
        payload.logger.info(`Revalidating page at path: ${path}`)
        containRevalidation(
          payload,
          'page write',
          `the page path ${path}`,
          () => revalidatePath(path),
        )
      }
      // The data layer (getCmsPageByPath / getPageLayout / CmsPageBlocks)
      // caches under the 'pages' tag — revalidatePath alone regenerates the
      // route against STALE data, so admin edits never surfaced without a
      // redeploy.
      containRevalidation(
        payload,
        'page write',
        'the pages/pages-sitemap tags',
        purgePageTags,
      )
    }

    // If the page was previously published, we need to revalidate the old path
    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPath = publicPathFor('pages', previousDoc)

      if (oldPath) {
        payload.logger.info(`Revalidating old page at path: ${oldPath}`)
        containRevalidation(
          payload,
          'page write',
          `the old page path ${oldPath}`,
          () => revalidatePath(oldPath),
        )
      }
      containRevalidation(
        payload,
        'page write',
        'the pages/pages-sitemap tags',
        purgePageTags,
      )
    }
  }
  return doc
}

/**
 * afterDelete companion to {@link revalidatePage}. Same `{ expire: 0 }`
 * immediate-expiration reasoning as {@link revalidatePage} (#118), and the same
 * `containRevalidation` wrap (#156) — `afterDelete` is transactional too, so an
 * uncontained throw would resurrect the page the caller deleted.
 */
export const revalidateDelete: CollectionAfterDeleteHook<Page> = ({
  doc,
  req: { context, payload },
}) => {
  if (!context.disableRevalidate) {
    const path = publicPathFor('pages', doc ?? {})
    if (path)
      containRevalidation(
        payload,
        'page write',
        `the deleted page path ${path}`,
        () => revalidatePath(path),
      )
    containRevalidation(
      payload,
      'page write',
      'the pages/pages-sitemap tags',
      purgePageTags,
    )
  }

  return doc
}
