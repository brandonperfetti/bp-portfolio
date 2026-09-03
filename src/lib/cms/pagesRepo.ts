import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { ROOT_PAGE_SLUG } from '@/fields/slug/slugPaths'
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

/**
 * Route path → the value stored in a page's `path` column.
 *
 * @remarks The stored path carries no leading slash, matching how `slug` is
 * stored, and the site root is stored under {@link ROOT_PAGE_SLUG} — the
 * designation `publicPathFor` owns from the other direction. Before #148 this
 * produced a *slug* and the readers below matched on `slug`; the string it
 * returns is identical for every top-level page (M1 backfilled `path = slug`),
 * which is why swapping the column these readers match on moves no URL.
 */
const pathToPagePath = (path: string): string => {
  const normalized = normalizePath(path)
  return normalized === '/' ? ROOT_PAGE_SLUG : normalized.replace(/^\//, '')
}

/**
 * The segments of a request path, with the empty strings a leading/trailing
 * slash produces removed.
 *
 * @param path - A request path such as `/tech/ai`.
 */
export const pathSegments = (path: string): string[] =>
  path.split('/').filter(Boolean)

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
  const pagePath = pathToPagePath(path)
  const { docs } = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: { path: { equals: pagePath } },
  })
  const page = docs[0]
  if (!page) return null

  const content: CmsPageContent = {
    pageId: String(page.id),
    routeKey: normalizePath(path),
    slug: page.slug || pagePath,
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
 * **Under hierarchy this is a FIRST-SEGMENT rule, and only for a one-segment
 * path (#148).** A dedicated route owns exactly its own path — `tech/page.tsx`
 * serves `/tech` and nothing below it — so `/tech` stays reserved while
 * `/tech/ai` falls through to the catch-all and resolves (Brandon, D1). That is
 * what {@link isReservedPagePath} encodes.
 *
 * This set is an **emit/serve** exclusion, not a save-time one. A Pages
 * document at a reserved path is legitimate and load-bearing: `/about`,
 * `/tech`, `/uses`, `/projects`, `/corvus` and `/articles` all take their copy
 * from one through {@link getCmsPageByPath}. The save-time reservation is a
 * different, smaller set — `CODE_OWNED_FIRST_SEGMENTS` in
 * `src/collections/Pages/hooks/pageHierarchy.ts` — and the two are deliberately
 * not merged.
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
 * Whether a request path is owned by a dedicated route and must therefore never
 * be served, emitted, or statically generated by the `[...segments]` catch-all.
 *
 * @param segments - The request path's segments, e.g. `['tech', 'ai']`.
 *
 * @remarks Reserved-ness applies to a **single-segment** path only. `/tech` is
 * a dedicated route; `/tech/ai` is not, because Next's static `tech` segment
 * matches the exact path and never a deeper one — which is precisely what makes
 * a reserved page usable as a path anchor for its children (Brandon, D1 on
 * #148).
 */
export const isReservedPagePath = (segments: string[]): boolean =>
  segments.length === 1 && RESERVED_PAGE_SLUGS.has(segments[0])

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
const getPublishedPageByPath = async (path: string): Promise<Page | null> => {
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
    where: { path: { equals: path } },
  })
  return docs[0] ?? null
}

/**
 * Uncached draft page by slug — the admin Live Preview path only. Stays
 * uncached (draft preview must be live) and is reached solely when Next draft
 * mode is enabled, an inherently request-time, admin-only state (#76 B2).
 */
const getDraftPageByPath = async (path: string): Promise<Page | null> => {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { path: { equals: path } },
  })
  return docs[0] ?? null
}

/**
 * Draft-aware single-page query for the page-builder routes (`/`, `/about`,
 * `/[...segments]`). A thin `draftMode()` selector over a split read: published
 * visitors and the build take the cached {@link getPublishedPageByPath} branch
 * (→ static prerender, #76 B2); admins in Live Preview take the uncached
 * {@link getDraftPageByPath} branch. Behavior-preserving — the visible result
 * for a published, signed-out visitor is unchanged.
 *
 * @remarks Lives here (not in the route file) per docs/STATE.md — pages
 * never call `getPayload()` directly (fresh-eyes review 2026-08, m5). Reading
 * `draftMode()` alone does not block prerender (it is statically off at build);
 * only an uncached data read would, which is why the published branch is cached.
 */
export const getPageByPathDraftAware = async (
  path: string,
): Promise<Page | null> => {
  const { draftMode } = await import('next/headers')
  const { isEnabled } = await draftMode()
  return isEnabled ? getDraftPageByPath(path) : getPublishedPageByPath(path)
}

/**
 * Draft-aware single-page query keyed by slug, for the dedicated routes that
 * serve exactly one known top-level page (`/` and `/about`).
 *
 * @param slug - A top-level page's slug.
 *
 * @remarks A thin wrapper over {@link getPageByPathDraftAware}: a top-level
 * page's `path` **is** its slug (M1 backfilled exactly that), so the two agree
 * for every caller that has only a slug. It is correct for a top-level page and
 * necessarily wrong for a placed one — the catch-all therefore calls
 * {@link getPageByPathDraftAware} with the request path instead.
 */
export const getPageBySlugDraftAware = async (
  slug: string,
): Promise<Page | null> => getPageByPathDraftAware(slug)

/**
 * Published, non-reserved page-builder **paths** — the set of pages the
 * `[...segments]` catch-all serves. Feeds `generateStaticParams` and the
 * sitemap (fresh-eyes review 2026-08, M5: builder pages were missing from the
 * sitemap entirely).
 *
 * @remarks Returns stored paths (`about`, `work/brytecore`), not slugs. Two
 * exclusions, both unchanged in intent from the slug version:
 *
 * - **The root** ({@link ROOT_PAGE_SLUG}) renders at `/`, not `/home` — which
 *   permanently redirects — so listing it would emit a second, redirecting URL
 *   and statically generate a page that redirect immediately shadows.
 * - **Reserved single-segment paths** ({@link isReservedPagePath}) are served by
 *   dedicated routes. A *child* under one is not excluded, which is what puts
 *   `/tech/ai` in the sitemap and in `generateStaticParams` while `/tech` stays
 *   the dedicated route's (Brandon, D1 on #148).
 *
 * Falling back to `slug` when `path` is null keeps this correct against a
 * database that has not yet run M1's backfill.
 *
 * The count is one entry per published page, exactly as the slug version
 * produced — the route's static profile changes in the shape of the param, not
 * in kind.
 *
 * `'use cache: remote'` so a `pages` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118).
 */
export const getPublishedPagePaths = async (): Promise<string[]> => {
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
    select: { path: true, slug: true },
    where: { _status: { equals: 'published' } },
  })
  return docs
    .map((doc) => doc.path || doc.slug)
    .filter(
      (p): p is string =>
        Boolean(p) &&
        p !== ROOT_PAGE_SLUG &&
        !isReservedPagePath(pathSegments(p!)),
    )
}

/**
 * Titles and paths for every ancestor of a page path, root-first.
 *
 * @param path - A stored page path, e.g. `work/brytecore`.
 * @returns One entry per existing ancestor, ordered shallowest-first. A
 *   top-level path returns `[]`.
 *
 * @remarks **One read, not N.** The ancestor set of `a/b/c` is the prefix set
 * `['a', 'a/b']`, so a single `where: { path: { in: [...] } }` produces every
 * ancestor's title at once — which is exactly why the design stores a `path`
 * instead of the plugin's breadcrumb array: given a path, breadcrumbs are
 * derivable and never need storing twice.
 *
 * Missing ancestors are simply absent from the result rather than an error: a
 * page can outlive a deleted parent (the FK is `ON DELETE set null`), and a
 * partial breadcrumb trail is better SEO than none.
 *
 * `'use cache: remote'` so a `pages` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118).
 */
export const getAncestorPages = async (
  path: string,
): Promise<Array<{ path: string; title: string }>> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.pages)
  cacheLife('cmsContent')

  const segments = pathSegments(path)
  const ancestorPaths = segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'))
  if (ancestorPaths.length === 0) return []

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft: false,
    limit: ancestorPaths.length,
    overrideAccess: false,
    pagination: false,
    select: { path: true, title: true },
    where: { path: { in: ancestorPaths } },
  })

  const byPath = new Map(
    docs
      .filter((doc): doc is typeof doc & { path: string } => Boolean(doc.path))
      .map((doc) => [doc.path, doc.title]),
  )
  return ancestorPaths
    .filter((ancestor) => byPath.has(ancestor))
    .map((ancestor) => ({ path: ancestor, title: byPath.get(ancestor)! }))
}
