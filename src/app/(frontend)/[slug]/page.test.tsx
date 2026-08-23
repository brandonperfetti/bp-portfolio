import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ROUTE_RHYTHM_PROFILES } from '@/heros/routeRhythm'
import type { Page } from '@/payload-types'

/**
 * The `[slug]` route's rhythm behaviour (#42): a page whose hero opts into the
 * `homeParity` rhythm reproduces live Home's flush-hero spacing, and — the
 * invariant this suite exists to guard — every other page renders exactly the
 * DOM it did before the field existed.
 */

const getPageBySlugDraftAware = vi.fn()

vi.mock('@/lib/cms/pagesRepo', () => ({
  RESERVED_PAGE_SLUGS: new Set<string>(),
  getPageBySlugDraftAware: (slug: string) => getPageBySlugDraftAware(slug),
  getPublishedPageSlugs: vi.fn(async () => []),
}))

// The hero and blocks each own their pixels elsewhere; here they are probes
// that report where the route placed them.
vi.mock('@/heros/RenderHero', () => ({
  RenderHero: ({ page }: { page: Page }) => (
    <div data-testid="render-hero" data-title={page.title} />
  ),
}))
vi.mock('@/blocks/RenderBlocks', () => ({
  RenderBlocks: () => <div data-testid="render-blocks" />,
}))

// Only reached by generateMetadata, which this suite doesn't exercise — mocked
// so importing the route can't pull the whole Payload config into jsdom.
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: vi.fn(async () => ({})),
}))
vi.mock('@/lib/site', () => ({ getSiteUrl: () => 'https://example.com' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import CmsPage from '@/app/(frontend)/[slug]/page'

const page = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 1,
    title: 'Consulting',
    subtitle: 'How I can help',
    slug: 'consulting',
    hero: { type: 'shader', presentation: 'fullBleed', ...hero },
    layout: [],
  }) as unknown as Page

const renderRoute = async (doc: Page) => {
  getPageBySlugDraftAware.mockResolvedValue(doc)
  return render(await CmsPage({ params: Promise.resolve({ slug: doc.slug! }) }))
}

/** The route's outer container — the element that owns the stacking context. */
const outerContainer = (container: HTMLElement) =>
  container.querySelector('.isolate') as HTMLElement

describe('[slug] route rhythm — default (standard) is byte-identical', () => {
  it('wraps hero and blocks in the historical isolate container', async () => {
    const { container } = await renderRoute(page())
    const outer = outerContainer(container)

    // Exactly the classes the route has always rendered (the profile is pinned
    // to these literals in routeRhythm.test.ts).
    expect(ROUTE_RHYTHM_PROFILES.standard.containerClass).toBe(
      'isolate mt-16 sm:mt-32',
    )
    expect(outer).toHaveClass('isolate', 'mt-16', 'sm:mt-32')
    expect(screen.getByTestId('render-hero')).toBeInTheDocument()
    expect(screen.getByTestId('render-blocks')).toBeInTheDocument()
  })

  it('renders the hero bare and the blocks under mt-8 — no extra wrappers', async () => {
    await renderRoute(page())

    // No home-parity padding wrapper around the hero.
    expect(screen.getByTestId('render-hero').closest('.pt-9')).toBeNull()
    // The blocks sit under the historical mt-8 div.
    const blocksWrapper = screen.getByTestId('render-blocks').parentElement
    expect(blocksWrapper).toHaveAttribute('class', 'mt-8')
  })

  it('takes the default branch for an unknown stored rhythm', async () => {
    const { container } = await renderRoute(
      page({ rhythm: 'flush' } as unknown as Partial<
        NonNullable<Page['hero']>
      >),
    )

    expect(outerContainer(container)).toHaveClass('mt-16', 'sm:mt-32')
    expect(screen.getByTestId('render-hero').closest('.pt-9')).toBeNull()
  })
})

describe('[slug] route rhythm — home parity', () => {
  it('drops the container top margin and keeps the isolation', async () => {
    const { container } = await renderRoute(page({ rhythm: 'homeParity' }))
    const outer = outerContainer(container)

    expect(outer).toHaveClass('isolate')
    expect(outer.className).not.toContain('mt-16')
    expect(outer.className).not.toContain('mt-32')
  })

  it('pads the hero with the homepage’s pt-9 pb-16 sm:pb-20', async () => {
    await renderRoute(page({ rhythm: 'homeParity' }))

    const heroWrapper = screen.getByTestId('render-hero').parentElement
    expect(heroWrapper).toHaveAttribute('class', 'pt-9 pb-16 sm:pb-20')
    expect(heroWrapper?.className).toBe(
      ROUTE_RHYTHM_PROFILES.homeParity.heroWrapperClass,
    )
  })

  it('still wraps both hero and blocks inside the one isolate container', async () => {
    const { container } = await renderRoute(page({ rhythm: 'homeParity' }))
    const outer = outerContainer(container)

    expect(outer.querySelector('[data-testid="render-hero"]')).not.toBeNull()
    expect(outer.querySelector('[data-testid="render-blocks"]')).not.toBeNull()
  })
})
