import type { Metadata } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { cache } from 'react'

import { ShareButton } from '@/components/cms/ShareButton'
import { RenderRhythmPage } from '@/heros/RenderRhythmPage'
import { EMPTY_CMS_SENTINEL } from '@/lib/cms/emptyCmsSentinel'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import { getRedirectForPath } from '@/lib/cms/redirectsRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import {
  getAncestorPages,
  getPageByPathDraftAware,
  getPublishedPagePaths,
  isReservedPagePath,
  pathSegments,
} from '@/lib/cms/pagesRepo'
import { publicPathFor } from '@/fields/slug/slugPaths'
import { getArticleByPath } from '@/lib/articles'
import { getPublishedPostPaths } from '@/lib/content/posts'
import { getSiteUrl } from '@/lib/site'

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryPageByPath = cache(getPageByPathDraftAware)

/**
 * Request-deduped wrapper over the placed-article query (#153).
 *
 * @remarks Deduped for the same reason the page query is: `generateMetadata`
 * and the component both resolve the same path in one request, and without
 * `cache` a placed article costs two reads per render instead of one. The
 * signed-out viewer is pinned here exactly as `/articles/[slug]` pins it — the
 * per-request member unlock is Suspense-isolated inside `ArticleView`, so the
 * shell this route prerenders stays the signed-out one.
 */
const queryPostByPath = cache((path: string) =>
  getArticleByPath(path, { isAuthenticated: false }),
)

/**
 * The stored path a request's segments address, and the request path itself.
 *
 * @param segments - Catch-all segments, as Next hands them over.
 *
 * @remarks Two spellings of one thing, needed in two vocabularies: the stored
 * path (no leading slash) is what the indexed equality read matches on, and the
 * request path (leading slash) is what the #120 redirect lookup is keyed by.
 * Deriving both here keeps them incapable of disagreeing.
 */
const addressOf = (segments: string[] | undefined) => {
  const parts = pathSegments((segments ?? []).join('/'))
  const path = parts.join('/')
  return { parts, path, requestPath: `/${path}` }
}

/**
 * The catch-all's prerender set: one entry per published, non-reserved,
 * non-root page, each as its path split into segments.
 *
 * @returns Route params for every page the catch-all serves, or a single
 *   sentinel entry when the CMS is empty.
 *
 * @remarks The count matches the flat `[slug]` route's exactly — the static
 * profile changes in the shape of the param, not in kind. The empty-CMS guard
 * is load-bearing and not an optimisation: Cache Components hard-errors when
 * `generateStaticParams` returns `[]`, so an all-hidden CMS or a from-scratch
 * staging reset must still yield one param, which resolves to `notFound()`.
 */
export async function generateStaticParams() {
  const [pagePaths, postPaths] = await Promise.all([
    getPublishedPagePaths(),
    // Placed articles are served here too (#153), so they must prerender here
    // too — otherwise placing an article silently converts it from a static
    // page into a dynamically-rendered one. The list is empty until an editor
    // places something, so this route's static profile is unchanged on the day
    // M2 lands and grows only by deliberate acts.
    getPublishedPostPaths(),
  ])
  const paths = [...pagePaths, ...postPaths]
  // Empty-CMS guard: Cache Components hard-errors when `generateStaticParams`
  // returns []. Emit one sentinel that resolves to `notFound()` — it matches no
  // published page, so `CmsPage`'s existing guard 404s it — so an all-hidden CMS
  // (or a from-scratch staging reset) degrades to a clean 404 instead of crashing
  // the build.
  if (paths.length === 0) return [{ segments: [EMPTY_CMS_SENTINEL] }]
  // One entry per published page plus one per placed article: the static
  // profile changes in the shape of the param, not in kind.
  return paths.map((path) => ({ segments: pathSegments(path) }))
}

/**
 * Title, description and canonical for a page-builder page.
 *
 * @param params - The catch-all's route params.
 * @returns Next `Metadata`, or `{}` when no published page serves the path —
 *   the not-found branch in {@link CmsPage} owns the redirect/404 decision, and
 *   emitting metadata for a page that will 404 would be worse than emitting
 *   none.
 *
 * @remarks The canonical is built from the resolved DOCUMENT, not from the
 * request, so a page reached by some other spelling still canonicalises to the
 * single URL `publicPathFor` names.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments?: string[] }>
}): Promise<Metadata> {
  const { segments } = await params
  const { path } = addressOf(segments)
  const page = await queryPageByPath(path)
  if (!page) {
    // A placed article (#153) resolves at this path instead. Its metadata is
    // the article's own — same canonical, same OG card — emitted by the same
    // builder `/articles/[slug]` uses, so the two routes cannot describe one
    // document differently.
    const article = await queryPostByPath(path)
    if (!article) return {}
    const { buildArticleMetadata } =
      await import('@/app/(frontend)/articles/[slug]/ArticleView')
    return buildArticleMetadata(article, await getCmsSiteSettings())
  }
  const settings = await getCmsSiteSettings()
  const base = (settings?.canonicalUrl || getSiteUrl()).replace(/\/+$/, '')
  // The canonical is built from the document, not from the request: a request
  // that reached a page through some other spelling must still canonicalise to
  // the one URL `publicPathFor` names.
  const canonicalPath = publicPathFor('pages', page)
  return {
    title: page.meta?.title || page.title,
    description: page.meta?.description || page.subtitle || undefined,
    ...(canonicalPath
      ? { alternates: { canonical: `${base}${canonicalPath}` } }
      : {}),
  }
}

/**
 * CMS page-builder catch-all: any published Pages doc whose path isn't owned by
 * a dedicated route renders here — hero + layout blocks, fully composed in the
 * admin. New pages need no code or deploy, and a page with a `parent` composes
 * a nested URL (`/work/brytecore`, `/tech/ai`) with no route per section (#148).
 *
 * @remarks Resolution is **one indexed equality read** on the unique `path`
 * column, never a per-request ancestor walk: at depth 3 a walk would be three
 * sequential round trips on a route that is supposed to prerender, and it would
 * give `generateStaticParams` nothing cheap to enumerate.
 */
export default async function CmsPage({
  params,
}: {
  params: Promise<{ segments?: string[] }>
}) {
  const { segments } = await params
  const { parts, path, requestPath } = addressOf(segments)
  // Reserved-ness is a FIRST-SEGMENT rule applying to a one-segment path only,
  // so `/tech` stays the dedicated route's and `/tech/ai` resolves here
  // (Brandon, D1 on #148).
  if (isReservedPagePath(parts)) {
    notFound()
  }

  const page = await queryPageByPath(path)
  if (!page) {
    // Placed articles resolve here (#153), by the same one indexed equality
    // read on a unique `path` column that pages use — the catch-all consults
    // Posts rather than the article route being reached some other way.
    //
    // **Why the catch-all, and not a rewrite or a second route.** A placed
    // article's URL is `/work/brytecore`, which is structurally a page path:
    // any other mechanism (a `next.config.mjs` rewrite, a `[...]` route nested
    // under each section) would need to know the set of section prefixes at
    // build time, which is editorial data that lives in the database. The
    // catch-all already owns "resolve an arbitrary path against the CMS", so
    // extending it to a second collection is one more read on a route that was
    // going to 404 anyway. Pages win a tie by being asked first; a path can
    // never legitimately be both, because `assertNoCrossCollectionCollision`
    // rejects the second document to claim it.
    const article = await queryPostByPath(path)
    if (article) {
      // Imported lazily, and not for bundle size: `ArticleView` pulls in the
      // whole article render tree (layout, motion, gsap). A static import would
      // put that graph on the module path of every page request this route
      // serves — the common case, which needs none of it.
      const { ArticleView, articleAncestors } =
        await import('@/app/(frontend)/articles/[slug]/ArticleView')
      return (
        <ArticleView
          article={article}
          settings={await getCmsSiteSettings()}
          ancestors={await articleAncestors(article)}
        />
      )
    }

    // #120: same three lines as /articles/[slug] — a renamed published page
    // serves a redirect from its old path instead of a 404. Deliberately NOT
    // applied to the RESERVED_PAGE_SLUGS branch above: those paths are owned by
    // dedicated routes, so a redirect row must never shadow one.
    //
    // The lookup is keyed by the REQUEST path, which is the string a redirect
    // row's `from` is written as — `createSlugRedirect` builds it through the
    // same `publicPathFor` seam, so reader and writer still share one
    // definition of what a page's public path is. See the matching note in
    // /articles/[slug].
    const match = await getRedirectForPath(requestPath)
    // #130: the row's permanence decides the API. `permanentRedirect` emits
    // 308 and `redirect` 307; a row with no stored type answers permanent, so
    // every pre-#130 row keeps the behaviour it had.
    if (match?.permanent) permanentRedirect(match.destination)
    if (match) redirect(match.destination)
    notFound()
  }

  // Page actions row (top-right, above the hero). Share is offered only when the
  // resolved (global ± per-page) target set is non-empty — the per-page
  // `disableSharing` kill switch collapses it to []. `shareTargetIds` is a plain
  // string[] resolved here (server); the sole client boundary is `ShareButton`,
  // which receives only serializable props. Copy-page stays articles-only.
  const settings = await getCmsSiteSettings()
  const base = (settings.canonicalUrl || getSiteUrl()).replace(/\/+$/, '')
  const pageUrl = `${base}${publicPathFor('pages', page) ?? requestPath}`
  const pageTitle = page.meta?.title || page.title
  const shareTargetIds = resolvePageShareTargetIds(page, settings.shareTargets)

  // Breadcrumb JSON-LD (#148). Only a placed page has ancestors, so a
  // top-level page emits Home → itself exactly as the flat route always
  // implied, and a nested one emits the real chain — derived from `path` in one
  // indexed read, never stored twice.
  const ancestors = await getAncestorPages(page.path ?? '')
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: base },
      ...ancestors.map((ancestor, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: ancestor.title,
        item: `${base}${publicPathFor('pages', { path: ancestor.path })}`,
      })),
      {
        '@type': 'ListItem',
        position: ancestors.length + 2,
        name: page.title,
        item: pageUrl,
      },
    ],
  }

  // Hero + blocks, spaced by the page's route rhythm, in the one Container that
  // owns the full-bleed stacking context. Rendered through the shared
  // `RenderRhythmPage` seam so `/` (the home flip, #42) and this catch-all can
  // never drift; the rhythm profiles (`ROUTE_RHYTHM_PROFILES`) are where the
  // orchestrator dials pixel parity. `[...segments]/page.test.tsx` pins the
  // emitted DOM for both `standard` and `homeParity`.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(breadcrumbSchema) }}
      />
      <RenderRhythmPage
        page={page}
        actions={
          shareTargetIds.length > 0 ? (
            <ShareButton
              url={pageUrl}
              title={pageTitle}
              targetIds={shareTargetIds}
            />
          ) : undefined
        }
      />
    </>
  )
}
