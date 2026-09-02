import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Page } from '@/payload-types'

/**
 * The home route `/` (#42, the flip): it renders the Payload `home` document
 * through the shared {@link RenderRhythmPage} seam — draft-aware, honoring the
 * doc's `homeParity` rhythm — while preserving the site-level WebSite + Person
 * JSON-LD and doc-driven metadata the generic `[slug]` route does not emit.
 * This suite also pins the guarantee that `/` and `[slug]` render the same
 * structure for the same doc.
 */

const getPageBySlugDraftAware = vi.fn()
const getCmsPageByPath = vi.fn()

vi.mock('@/lib/cms/pagesRepo', () => ({
  getPageBySlugDraftAware: (slug: string) => getPageBySlugDraftAware(slug),
  // The catch-all reads by path; `/` and this parity check address the root
  // page, whose path IS its slug, so both mocks answer from one fixture (#148).
  getPageByPathDraftAware: (path: string) => getPageBySlugDraftAware(path),
  getCmsPageByPath: (path: string) => getCmsPageByPath(path),
  getPublishedPagePaths: vi.fn(async () => []),
  isReservedPagePath: () => false,
  pathSegments: (path: string) => path.split('/').filter(Boolean),
}))

// Probes: the hero and blocks own their pixels elsewhere.
vi.mock('@/heros/RenderHero', () => ({
  RenderHero: ({ page }: { page: Page }) => (
    <div data-testid="render-hero" data-title={page.title} />
  ),
}))
vi.mock('@/blocks/RenderBlocks', () => ({
  RenderBlocks: () => <div data-testid="render-blocks" />,
}))

const getCmsSiteSettings = vi.fn(async () => ({
  siteName: 'Brandon Perfetti',
  siteTitle: 'Brandon Perfetti',
  siteDescription: 'Product and software.',
  canonicalUrl: 'https://example.com',
}))
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: () => getCmsSiteSettings(),
}))

vi.mock('@/lib/cms/identityRepo', () => ({
  getCmsIdentity: vi.fn(async () => ({
    name: 'Brandon Perfetti',
    jobTitle: 'Product Leader',
    image: 'https://example.com/avatar.jpg',
    sameAs: ['https://github.com/brandonperfetti'],
  })),
}))

vi.mock('@/lib/site', () => ({
  getSiteUrl: () => 'https://example.com',
  DEFAULT_SOCIAL_IMAGE: '/images/social.png',
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import Home, { generateMetadata } from '@/app/(frontend)/page'
import CmsPage from '@/app/(frontend)/[...segments]/page'

const homeDoc = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 7,
    title: 'Brandon Perfetti',
    subtitle: 'Product and project leader',
    slug: 'home',
    hero: { type: 'shader', presentation: 'fullBleed', ...hero },
    layout: [],
  }) as unknown as Page

const renderHome = async (doc: Page | null) => {
  getPageBySlugDraftAware.mockResolvedValue(doc)
  return render(await Home())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('home route — draft-aware doc read', () => {
  it('reads the home doc through the draft-aware query, keyed on the home slug', async () => {
    await renderHome(homeDoc())
    expect(getPageBySlugDraftAware).toHaveBeenCalledWith('home')
  })

  it('404s when the home doc is missing rather than rendering a blank /', async () => {
    getPageBySlugDraftAware.mockResolvedValue(null)
    await expect(Home()).rejects.toThrow('notFound')
  })
})

describe('home route — builder render through the shared seam', () => {
  it('renders hero + blocks inside the one isolate container', async () => {
    const { container } = await renderHome(homeDoc({ rhythm: 'homeParity' }))
    const outer = container.querySelector('.isolate') as HTMLElement

    expect(outer).not.toBeNull()
    expect(outer.querySelector('[data-testid="render-hero"]')).not.toBeNull()
    expect(outer.querySelector('[data-testid="render-blocks"]')).not.toBeNull()
  })

  it('honors the doc’s homeParity rhythm (flush hero padding)', async () => {
    await renderHome(homeDoc({ rhythm: 'homeParity' }))
    const heroWrapper = screen.getByTestId('render-hero').parentElement
    expect(heroWrapper).toHaveAttribute('class', 'pt-9 pb-16 sm:pb-20')
  })

  it('renders the photoStrip only through RenderBlocks — no second copy', async () => {
    await renderHome(homeDoc({ rhythm: 'homeParity' }))
    // The blocks region is rendered exactly once; the old hard-coded PhotoStrip
    // slot (and its CmsPageBlocks exclude) is gone, so nothing double-renders.
    expect(screen.getAllByTestId('render-blocks')).toHaveLength(1)
  })
})

describe('home route — SEO artifacts preserved', () => {
  it('emits both WebSite and Person JSON-LD scripts', async () => {
    const { container } = await renderHome(homeDoc())
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    expect(scripts).toHaveLength(2)
    const combined = Array.from(scripts)
      .map((s) => s.textContent)
      .join(' ')
    expect(combined).toContain('WebSite')
    expect(combined).toContain('Person')
  })

  it('builds metadata from the home doc', async () => {
    getCmsPageByPath.mockResolvedValue({
      seoTitle: 'Brandon Perfetti — Home',
      seoDescription: 'Doc-driven description.',
    })
    const meta = await generateMetadata()
    expect(meta.title).toBe('Brandon Perfetti — Home')
    expect(meta.description).toBe('Doc-driven description.')
    expect(getCmsPageByPath).toHaveBeenCalledWith('/')
  })

  it('falls back to the default title/description when the doc has none', async () => {
    getCmsPageByPath.mockResolvedValue(null)
    const meta = await generateMetadata()
    expect(meta.title).toBe('Home')
    expect(String(meta.description)).toContain('Brandon')
  })
})

describe('home route — same structure as the [...segments] builder route', () => {
  it('renders an identical hero+blocks subtree to /[...segments] for the same doc', async () => {
    const doc = homeDoc({ rhythm: 'homeParity' })

    getPageBySlugDraftAware.mockResolvedValue(doc)
    const home = render(await Home())
    const homeIsolate = home.container.querySelector('.isolate') as HTMLElement

    getPageBySlugDraftAware.mockResolvedValue(doc)
    const slug = render(
      await CmsPage({ params: Promise.resolve({ segments: ['home'] }) }),
    )
    const slugIsolate = slug.container.querySelector('.isolate') as HTMLElement

    expect(homeIsolate).not.toBeNull()
    expect(slugIsolate).not.toBeNull()
    // The shared seam guarantees byte-identical hero+blocks structure.
    expect(homeIsolate.outerHTML).toBe(slugIsolate.outerHTML)
  })
})
