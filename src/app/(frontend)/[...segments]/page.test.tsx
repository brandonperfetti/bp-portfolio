import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTE_RHYTHM_PROFILES } from '@/heros/routeRhythm'
import type { Page } from '@/payload-types'

/**
 * The `[...segments]` catch-all's rhythm behaviour (#42): a page whose hero opts
 * into the `homeParity` rhythm reproduces live Home's flush-hero spacing, and —
 * the invariant this suite exists to guard — every other page renders exactly
 * the DOM it did before the field existed. Under #148 it also pins that the
 * route resolves on the request PATH, not on a single slug.
 */

const getPageByPathDraftAware = vi.fn()
const reservedPagePaths = new Set<string>()

const getAncestorPages = vi.fn(
  async () =>
    [] as Array<{
      path: string
      title: string
    }>,
)

vi.mock('@/lib/cms/pagesRepo', () => ({
  getAncestorPages: (path: string) => getAncestorPages(path),
  getPageByPathDraftAware: (path: string) => getPageByPathDraftAware(path),
  getPublishedPagePaths: vi.fn(async () => []),
  isReservedPagePath: (segments: string[]) =>
    segments.length === 1 && reservedPagePaths.has(segments[0]),
  pathSegments: (path: string) => path.split('/').filter(Boolean),
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
// #130: the not-found branch chooses between the two redirect APIs, so both
// have to be observable. They are stubbed as throwing sentinels because that
// is what they really do — each one terminates the render.
const getRedirectForPath = vi.fn()
vi.mock('@/lib/cms/redirectsRepo', () => ({
  getRedirectForPath: (path: string) => getRedirectForPath(path),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
  permanentRedirect: (destination: string) => {
    throw new Error(`permanentRedirect:${destination}`)
  },
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`)
  },
}))

import CmsPage from '@/app/(frontend)/[...segments]/page'

const page = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 1,
    title: 'Consulting',
    subtitle: 'How I can help',
    slug: 'consulting',
    hero: { type: 'shader', presentation: 'fullBleed', ...hero },
    layout: [],
  }) as unknown as Page

const renderRoute = async (doc: Page, segments?: string[]) => {
  getPageByPathDraftAware.mockResolvedValue(doc)
  return render(
    await CmsPage({
      params: Promise.resolve({ segments: segments ?? [doc.slug!] }),
    }),
  )
}

/** The route's outer container — the element that owns the stacking context. */
const outerContainer = (container: HTMLElement) =>
  container.querySelector('.isolate') as HTMLElement

describe('[...segments] route rhythm — default (standard) is byte-identical', () => {
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

describe('[...segments] route rhythm — home parity', () => {
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

/**
 * Redirect permanence on the not-found branch (#130).
 *
 * Until #130 the collection had no permanence field and this branch called
 * `permanentRedirect` unconditionally, so a temporary move was served as a 308
 * and cached in browsers and search indexes effectively forever. The reader now
 * answers `permanent`, and these pin that the route acts on the answer instead
 * of ignoring it — including that a row with no stored type still gets the old
 * behaviour.
 */
describe('[...segments] redirect permanence (#130)', () => {
  beforeEach(() => {
    getRedirectForPath.mockReset()
  })

  const renderMissing = async (segments: string[] = ['gone']) => {
    getPageByPathDraftAware.mockResolvedValue(null)
    return CmsPage({ params: Promise.resolve({ segments }) })
  }

  it('serves a permanent row through permanentRedirect (308)', async () => {
    getRedirectForPath.mockResolvedValue({
      destination: '/moved-here',
      permanent: true,
    })

    await expect(renderMissing()).rejects.toThrow(
      'permanentRedirect:/moved-here',
    )
    expect(getRedirectForPath).toHaveBeenCalledWith('/gone')
  })

  it('serves a temporary row through redirect (307)', async () => {
    getRedirectForPath.mockResolvedValue({
      destination: '/promo',
      permanent: false,
    })

    await expect(renderMissing()).rejects.toThrow('redirect:/promo')
  })

  it('404s when no row matches', async () => {
    getRedirectForPath.mockResolvedValue(null)

    await expect(renderMissing()).rejects.toThrow('notFound')
  })

  it('keys the redirect lookup on the full nested REQUEST path', async () => {
    // The row `createSlugRedirect` writes is keyed by the document's public
    // path, which for a placed page is the whole thing — a lookup on the last
    // segment alone would never find it.
    getRedirectForPath.mockResolvedValue(null)

    await expect(renderMissing(['work', 'old-name'])).rejects.toThrow(
      'notFound',
    )
    expect(getRedirectForPath).toHaveBeenCalledWith('/work/old-name')
  })
})

/**
 * Nested resolution and the reserved-first-segment rule (#148).
 */
describe('[...segments] hierarchy resolution', () => {
  beforeEach(() => {
    getPageByPathDraftAware.mockReset()
    getAncestorPages.mockReset()
    getAncestorPages.mockResolvedValue([])
    reservedPagePaths.clear()
  })

  it('resolves a nested page by its full stored path', async () => {
    await renderRoute(
      { ...page(), slug: 'brytecore', path: 'work/brytecore' } as Page,
      ['work', 'brytecore'],
    )

    expect(getPageByPathDraftAware).toHaveBeenCalledWith('work/brytecore')
    expect(screen.getByTestId('render-hero')).toBeInTheDocument()
  })

  it('404s a one-segment reserved path — /tech stays the dedicated route', async () => {
    reservedPagePaths.add('tech')

    await expect(
      CmsPage({ params: Promise.resolve({ segments: ['tech'] }) }),
    ).rejects.toThrow('notFound')
    expect(getPageByPathDraftAware).not.toHaveBeenCalled()
  })

  it('emits a BreadcrumbList reflecting the real ancestor chain', async () => {
    getAncestorPages.mockResolvedValue([{ path: 'work', title: 'Work' }])

    const { container } = await renderRoute(
      {
        ...page(),
        title: 'Brytecore',
        slug: 'brytecore',
        path: 'work/brytecore',
      } as Page,
      ['work', 'brytecore'],
    )

    const jsonLd = container.querySelector(
      'script[type="application/ld+json"]',
    )?.innerHTML
    expect(jsonLd).toBeTruthy()
    const schema = JSON.parse(jsonLd as string)
    expect(schema['@type']).toBe('BreadcrumbList')
    expect(
      schema.itemListElement.map((entry: { name: string; item: string }) => [
        entry.name,
        entry.item,
      ]),
    ).toEqual([
      ['Home', 'https://example.com'],
      ['Work', 'https://example.com/work'],
      ['Brytecore', 'https://example.com/work/brytecore'],
    ])
    expect(getAncestorPages).toHaveBeenCalledWith('work/brytecore')
  })

  it('emits Home → itself for a top-level page', async () => {
    getAncestorPages.mockResolvedValue([])

    const { container } = await renderRoute(
      {
        ...page(),
        title: 'Consulting',
        slug: 'consulting',
        path: 'consulting',
      } as Page,
      ['consulting'],
    )

    const schema = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.innerHTML as string,
    )
    expect(schema.itemListElement).toHaveLength(2)
  })

  it('resolves /tech/ai even though tech is reserved (Brandon, D1)', async () => {
    reservedPagePaths.add('tech')

    await renderRoute({ ...page(), slug: 'ai', path: 'tech/ai' } as Page, [
      'tech',
      'ai',
    ])

    expect(getPageByPathDraftAware).toHaveBeenCalledWith('tech/ai')
    expect(screen.getByTestId('render-hero')).toBeInTheDocument()
  })
})
