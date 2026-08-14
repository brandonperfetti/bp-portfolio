import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import type { CmsPageContent } from '@/lib/cms/types'
import type { Page } from '@/payload-types'

function normalizePath(path: string) {
  if (!path || path === '/') {
    return '/'
  }
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  return withLeadingSlash.replace(/\/+$/, '')
}

/** Route path → Pages collection slug (`home` renders at `/`). */
const pathToSlug = (path: string): string => {
  const normalized = normalizePath(path)
  return normalized === '/' ? 'home' : normalized.replace(/^\//, '')
}

/**
 * Page content by route path from the Payload `pages` collection (was Notion).
 *
 * @param path - Route path to resolve (for example `/` or `/about`).
 * @returns v3-shaped page content, or `null` when no published page exists —
 * callers already treat `null` as "use hard-coded copy", which preserves the
 * boots-with-empty-CMS behavior.
 */
export const getCmsPageByPath = unstable_cache(
  async (path: string): Promise<CmsPageContent | null> => {
    const payload = await getPayload({ config: configPromise })
    const slug = pathToSlug(path)
    const { docs } = await payload.find({
      collection: 'pages',
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: { slug: { equals: slug } },
    })
    const page = docs[0]
    if (!page) return null

    const content: CmsPageContent = {
      pageId: String(page.id),
      routeKey: normalizePath(path),
      slug: page.slug || slug,
      title: page.title,
      subtitle: page.subtitle || page.meta?.description || undefined,
      seoTitle: page.meta?.title || undefined,
      seoDescription: page.meta?.description || undefined,
      heroImage: mediaUrl(page.hero?.media),
      ogImage: mediaUrl(page.meta?.image),
      updatedAt: page.updatedAt,
      disableSharing: page.disableSharing ?? undefined,
      shareTargetsAdd: page.shareTargetsAdd ?? undefined,
      shareTargetsRemove: page.shareTargetsRemove ?? undefined,
    }

    return content
  },
  ['page-by-path'],
  { tags: ['pages'] },
)

/**
 * Slugs owned by dedicated route components. The `[slug]` catch-all must
 * never render or emit these, and the sitemap must not double-list them.
 *
 * @remarks `home` is deliberately absent. It is a real page-builder document,
 * rendered by the dedicated `/` route through the same {@link RenderRhythmPage}
 * seam the catch-all uses (the #42 home flip). Its `/home` URL is a permanent
 * redirect to `/` (`next.config.mjs`), so the catch-all never serves it; the
 * one place that still needs `home` filtered — the sitemap/static-params slug
 * list — excludes it explicitly in {@link getPublishedPageSlugs} below, because
 * `/home` must not appear as a second, redirecting URL.
 *
 * `about` is the counter-case, and it stays: the #44 about flip put `/about`
 * on the same {@link RenderRhythmPage} seam (rendering the `about` Pages doc),
 * but — unlike `home` — its slug *already equals its path*. A dedicated
 * `about/page.tsx` static segment always shadows the `[slug]` dynamic segment
 * for `/about`, so the catch-all never serves it and no `/home`-style redirect
 * is needed. Keeping `about` reserved is what yields exactly one canonical
 * `/about`: it holds `about` out of {@link getPublishedPageSlugs} (no duplicate
 * sitemap URL, no dead catch-all static param) and keeps the catch-all's guard
 * defensively rejecting it. Removing it would gain nothing and force a second
 * explicit exclusion below, so the decision is to leave it in place.
 */
export const RESERVED_PAGE_SLUGS = new Set([
  'about',
  'account',
  'articles',
  'hermes',
  'projects',
  'sign-in',
  'sign-up',
  'tech',
  'thank-you',
  'uses',
])

/**
 * Draft-aware single-page query for the page-builder catch-all route.
 * Draft mode (admin Live Preview) reads the newest draft with authenticated
 * access; visitors only ever see published documents.
 *
 * @remarks Lives here (not in the route file) per docs/STATE.md — pages
 * never call `getPayload()` directly (fresh-eyes review 2026-08, m5).
 */
export const getPageBySlugDraftAware = async (
  slug: string,
): Promise<Page | null> => {
  const { draftMode } = await import('next/headers')
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] ?? null
}

/**
 * Slug served by the dedicated `/` route (redirected away from `/home`), so it
 * is never a catch-all URL and must not surface in the slug list below.
 */
const HOME_PAGE_SLUG = 'home'

/**
 * Published, non-reserved page-builder slugs — the set of pages the
 * `[slug]` catch-all serves. Feeds `generateStaticParams` and the sitemap
 * (fresh-eyes review 2026-08, M5: builder pages were missing from the
 * sitemap entirely).
 *
 * @remarks Excludes {@link HOME_PAGE_SLUG} as well as {@link RESERVED_PAGE_SLUGS}:
 * `home` renders at `/` (not `/home`, which permanently redirects), so listing
 * it here would emit `/home` as a second, redirecting sitemap URL and statically
 * generate a page the redirect immediately shadows.
 */
export const getPublishedPageSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'pages',
      draft: false,
      limit: 500,
      overrideAccess: false,
      pagination: false,
      select: { slug: true },
      where: { _status: { equals: 'published' } },
    })
    return docs
      .map((doc) => doc.slug)
      .filter(
        (s): s is string =>
          Boolean(s) && s !== HOME_PAGE_SLUG && !RESERVED_PAGE_SLUGS.has(s!),
      )
  },
  ['published-page-slugs'],
  { tags: ['pages'] },
)
