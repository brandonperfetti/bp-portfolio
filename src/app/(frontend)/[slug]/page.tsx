import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { Container } from '@/components/Container'
import { RenderHero } from '@/heros/RenderHero'
import { ROUTE_RHYTHM_PROFILES, routeRhythm } from '@/heros/routeRhythm'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import {
  RESERVED_PAGE_SLUGS,
  getPageBySlugDraftAware,
  getPublishedPageSlugs,
} from '@/lib/cms/pagesRepo'
import { getSiteUrl } from '@/lib/site'

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryPageBySlug = cache(getPageBySlugDraftAware)

export async function generateStaticParams() {
  const slugs = await getPublishedPageSlugs()
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
    notFound()
  }

  // Opt-in, additive: a page whose hero selects the `homeParity` rhythm
  // reproduces live Home's flush-hero spacing; every other page (rhythm null →
  // `standard`) takes the default branch below, byte-identical to before this
  // field existed. Both branches keep `HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS`
  // on the one `<Container>` that wraps hero *and* blocks — the full-bleed
  // stacking contract (`src/heros/presentation.ts`). The class knobs live in
  // `ROUTE_RHYTHM_PROFILES` so the orchestrator dials pixel parity in one place.
  if (routeRhythm(page.hero?.rhythm) === 'homeParity') {
    const profile = ROUTE_RHYTHM_PROFILES.homeParity
    return (
      <Container className={profile.containerClass}>
        <div className={profile.heroWrapperClass ?? undefined}>
          <RenderHero page={page} />
        </div>
        <div className={profile.blocksWrapperClass}>
          <RenderBlocks blocks={page.layout} />
        </div>
      </Container>
    )
  }

  return (
    // `isolate` is load-bearing, not decoration: a full-bleed shader hero
    // paints its canvas at `-z-10`, and this is the element that owns the
    // stacking context the canvas sinks inside — the one wrapper that holds
    // both the hero and the blocks, so the canvas lands under the blocks but
    // still above the fixed page panel. See
    // `HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS` in `src/heros/presentation.ts`.
    // Kept verbatim as the `standard` rhythm; `routeRhythm.ts` mirrors these
    // literals and `[slug]/page.test.tsx` asserts the two never drift.
    <Container className="isolate mt-16 sm:mt-32">
      <RenderHero page={page} />
      <div className="mt-8">
        <RenderBlocks blocks={page.layout} />
      </div>
    </Container>
  )
}
