import type { Metadata } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { cache } from 'react'

import { ShareButton } from '@/components/cms/ShareButton'
import { RenderRhythmPage } from '@/heros/RenderRhythmPage'
import { EMPTY_CMS_SENTINEL } from '@/lib/cms/emptyCmsSentinel'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import { getRedirectForPath } from '@/lib/cms/redirectsRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import {
  getPageByPathDraftAware,
  getPublishedPagePaths,
  isReservedPagePath,
  pathSegments,
} from '@/lib/cms/pagesRepo'
import { publicPathFor } from '@/fields/slug/slugPaths'
import { getSiteUrl } from '@/lib/site'

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryPageByPath = cache(getPageByPathDraftAware)

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
  const parts = (segments ?? []).filter(Boolean)
  return { parts, path: parts.join('/'), requestPath: `/${parts.join('/')}` }
}

export async function generateStaticParams() {
  const paths = await getPublishedPagePaths()
  // Empty-CMS guard: Cache Components hard-errors when `generateStaticParams`
  // returns []. Emit one sentinel that resolves to `notFound()` — it matches no
  // published page, so `CmsPage`'s existing guard 404s it — so an all-hidden CMS
  // (or a from-scratch staging reset) degrades to a clean 404 instead of crashing
  // the build.
  if (paths.length === 0) return [{ segments: [EMPTY_CMS_SENTINEL] }]
  // One entry per published page, exactly as many as the slug version emitted:
  // the static profile changes in the shape of the param, not in kind.
  return paths.map((path) => ({ segments: pathSegments(path) }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments?: string[] }>
}): Promise<Metadata> {
  const { segments } = await params
  const { path } = addressOf(segments)
  const page = await queryPageByPath(path)
  if (!page) return {}
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

  // Hero + blocks, spaced by the page's route rhythm, in the one Container that
  // owns the full-bleed stacking context. Rendered through the shared
  // `RenderRhythmPage` seam so `/` (the home flip, #42) and this catch-all can
  // never drift; the rhythm profiles (`ROUTE_RHYTHM_PROFILES`) are where the
  // orchestrator dials pixel parity. `[...segments]/page.test.tsx` pins the
  // emitted DOM for both `standard` and `homeParity`.
  return (
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
  )
}
