import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import { heroSocialImageUrl } from '@/lib/cms/heroSocialImage'
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
 * @remarks `'use cache: remote'` so a `pages` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 * @param path - Route path to resolve (for example `/` or `/about`).
 * @returns v3-shaped page content, or `null` when no published page exists —
 * callers already treat `null` as "use hard-coded copy", which preserves the
 * boots-with-empty-CMS behavior.
 */
export const getCmsPageByPath = async (
  path: string,
): Promise<CmsPageContent | null> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.pages)
  cacheLife('cmsContent')
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
    // Only a `standard` hero renders an image, so only it seeds the OG
    // fallback — shader/blank/none pages fall through to the site default
    // rather than surfacing a hidden/stale hero image (see heroSocialImageUrl).
    heroImage: heroSocialImageUrl(page.hero),
    ogImage: mediaUrl(page.meta?.image),
    ogImageMode: page.ogImageMode ?? undefined,
    updatedAt: page.updatedAt,
    disableSharing: page.disableSharing ?? undefined,
    shareTargetsAdd: page.shareTargetsAdd ?? undefined,
    shareTargetsRemove: page.shareTargetsRemove ?? undefined,
  }

  return content
}

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
  'corvus',
  // 'hermes' stays reserved after the #77 rename: the deploy-level
  // /hermes -> /corvus 308 shadows the route, so a published 'hermes' CMS
  // doc could never render -- reserving it keeps such a doc out of the
  // sitemap and static generation (final review 2026-08-21, G-1).
  'hermes',
  'projects',
  'sign-in',
  'sign-up',
  'tech',
  'thank-you',
  'uses',
])

/**
 * Cached published page by slug — the prerender path (#76 B2 draft-split).
 * `'use cache'` + `cacheTag(CMS_TAGS.pages)` so `/`, `/about`, and `/[slug]`
 * prerender static and an admin edit still purges them. Deliberately reads NO
 * `draftMode()`: a dynamic-API read here would opt the whole page out of
 * prerender (the B1 diagnosis's measured blocker). The draft branch is
 * {@link getDraftPageBySlug}.
 *
 * @remarks `'use cache: remote'` so a `pages` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 */
const getPublishedPageBySlug = async (slug: string): Promise<Page | null> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.pages)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] ?? null
}

/**
 * Uncached draft page by slug — the admin Live Preview path only. Stays
 * uncached (draft preview must be live) and is reached solely when Next draft
 * mode is enabled, an inherently request-time, admin-only state (#76 B2).
 */
const getDraftPageBySlug = async (slug: string): Promise<Page | null> => {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] ?? null
}

/**
 * Draft-aware single-page query for the page-builder routes (`/`, `/about`,
 * `/[slug]`). A thin `draftMode()` selector over a split read: published
 * visitors and the build take the cached {@link getPublishedPageBySlug} branch
 * (→ static prerender, #76 B2); admins in Live Preview take the uncached
 * {@link getDraftPageBySlug} branch. Behavior-preserving — the visible result
 * for a published, signed-out visitor is unchanged.
 *
 * @remarks Lives here (not in the route file) per docs/STATE.md — pages
 * never call `getPayload()` directly (fresh-eyes review 2026-08, m5). Reading
 * `draftMode()` alone does not block prerender (it is statically off at build);
 * only an uncached data read would, which is why the published branch is cached.
 */
export const getPageBySlugDraftAware = async (
  slug: string,
): Promise<Page | null> => {
  const { draftMode } = await import('next/headers')
  const { isEnabled } = await draftMode()
  return isEnabled ? getDraftPageBySlug(slug) : getPublishedPageBySlug(slug)
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
 *
 * `'use cache: remote'` so a `pages` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118).
 */
export const getPublishedPageSlugs = async (): Promise<string[]> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.pages)
  cacheLife('cmsContent')
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
}
