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
  RESERVED_PAGE_SLUGS,
  getPageBySlugDraftAware,
  getPublishedPageSlugs,
} from '@/lib/cms/pagesRepo'
import { publicPathForSlug } from '@/fields/slug/slugPaths'
import { getSiteUrl } from '@/lib/site'

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryPageBySlug = cache(getPageBySlugDraftAware)

export async function generateStaticParams() {
  const slugs = await getPublishedPageSlugs()
  // Empty-CMS guard: Cache Components hard-errors when `generateStaticParams`
  // returns []. Emit one sentinel that resolves to `notFound()` — it matches no
  // published page, so `CmsPage`'s existing guard 404s it — so an all-hidden CMS
  // (or a from-scratch staging reset) degrades to a clean 404 instead of crashing
  // the build.
  if (slugs.length === 0) return [{ slug: EMPTY_CMS_SENTINEL }]
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await queryPageBySlug(slug)
  if (!page) return {}
  const settings = await getCmsSiteSettings()
  const base = (settings?.canonicalUrl || getSiteUrl()).replace(/\/+$/, '')
  return {
    title: page.meta?.title || page.title,
    description: page.meta?.description || page.subtitle || undefined,
    alternates: { canonical: `${base}/${slug}` },
  }
}

/**
 * CMS page builder route: any published Pages doc whose slug isn't owned by
 * a dedicated route renders here — hero + layout blocks, fully composed in
 * the admin. New pages need no code or deploy.
 */
export default async function CmsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (RESERVED_PAGE_SLUGS.has(slug)) {
    notFound()
  }

  const page = await queryPageBySlug(slug)
  if (!page) {
    // #120: same three lines as /articles/[slug] — a renamed published page
    // serves a redirect from its old path instead of a 404. Deliberately NOT
    // applied to the RESERVED_PAGE_SLUGS branch above: those paths are owned by
    // dedicated routes, so a redirect row must never shadow one.
    //
    // `publicPathForSlug` builds the lookup path, so this reader and
    // `createSlugRedirect` (the writer) share one definition of what a page's
    // public path is — see the matching note in /articles/[slug].
    const from = publicPathForSlug('pages', slug)
    const match = from ? await getRedirectForPath(from) : null
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
  const pageUrl = `${base}/${slug}`
  const pageTitle = page.meta?.title || page.title
  const shareTargetIds = resolvePageShareTargetIds(page, settings.shareTargets)

  // Hero + blocks, spaced by the page's route rhythm, in the one Container that
  // owns the full-bleed stacking context. Rendered through the shared
  // `RenderRhythmPage` seam so `/` (the home flip, #42) and this catch-all can
  // never drift; the rhythm profiles (`ROUTE_RHYTHM_PROFILES`) are where the
  // orchestrator dials pixel parity. `[slug]/page.test.tsx` pins the emitted
  // DOM for both `standard` and `homeParity`.
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
