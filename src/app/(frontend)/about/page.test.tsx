import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Page } from '@/payload-types'

/**
 * The About route `/about` (#44, the flip): it renders the Payload `about`
 * document through the shared {@link RenderRhythmPage} seam — draft-aware,
 * with a `blank` hero (About's H1 lives in an in-column `heading` block, so the
 * hero draws no `<header>`) — while preserving the page's three JSON-LD scripts
 * (AboutPage + Person + Breadcrumb) and its doc-driven metadata.
 */

const getPageBySlugDraftAware = vi.fn()
const getCmsPageByPath = vi.fn()

vi.mock('@/lib/cms/pagesRepo', () => ({
  RESERVED_PAGE_SLUGS: new Set<string>(['about']),
  getPageBySlugDraftAware: (slug: string) => getPageBySlugDraftAware(slug),
  getCmsPageByPath: (path: string) => getCmsPageByPath(path),
  getPublishedPageSlugs: vi.fn(async () => []),
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

import About, { generateMetadata } from '@/app/(frontend)/about/page'

const aboutDoc = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 2,
    title: 'About Brandon Perfetti',
    subtitle: 'Product and project leader plus software engineer',
    slug: 'about',
    hero: { type: 'blank', ...hero },
    layout: [],
  }) as unknown as Page

const renderAbout = async (doc: Page | null) => {
  getPageBySlugDraftAware.mockResolvedValue(doc)
  return render(await About())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('about route — draft-aware doc read', () => {
  it('reads the about doc through the draft-aware query, keyed on the about slug', async () => {
    await renderAbout(aboutDoc())
    expect(getPageBySlugDraftAware).toHaveBeenCalledWith('about')
  })

  it('404s when the about doc is missing rather than rendering a blank /about', async () => {
    getPageBySlugDraftAware.mockResolvedValue(null)
    await expect(About()).rejects.toThrow('notFound')
  })
})

describe('about route — builder render through the shared seam', () => {
  it('renders hero + blocks inside the one isolate container', async () => {
    const { container } = await renderAbout(aboutDoc())
    const outer = container.querySelector('.isolate') as HTMLElement

    expect(outer).not.toBeNull()
    expect(outer.querySelector('[data-testid="render-hero"]')).not.toBeNull()
    expect(outer.querySelector('[data-testid="render-blocks"]')).not.toBeNull()
  })

  it('renders a blank hero bare (standard rhythm — no home-parity padding wrapper)', async () => {
    // About's hero is `blank`, which carries no `rhythm`, so the route resolves
    // the `standard` profile: hero rendered bare, no `pt-9` wrapper.
    await renderAbout(aboutDoc())
    expect(screen.getByTestId('render-hero').closest('.pt-9')).toBeNull()
  })
})

describe('about route — SEO artifacts preserved', () => {
  it('emits all three JSON-LD scripts (AboutPage, Person, Breadcrumb)', async () => {
    const { container } = await renderAbout(aboutDoc())
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    expect(scripts).toHaveLength(3)
    const combined = Array.from(scripts)
      .map((s) => s.textContent)
      .join(' ')
    expect(combined).toContain('AboutPage')
    expect(combined).toContain('Person')
    expect(combined).toContain('BreadcrumbList')
  })

  it('builds the AboutPage schema from the doc title/subtitle', async () => {
    const doc = {
      id: 2,
      title: 'Doc About Title',
      subtitle: 'Doc about subtitle.',
      slug: 'about',
      hero: { type: 'blank' },
      layout: [],
    } as unknown as Page
    const { container } = await renderAbout(doc)
    const combined = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    )
      .map((s) => s.textContent)
      .join(' ')
    expect(combined).toContain('Doc About Title')
    expect(combined).toContain('Doc about subtitle.')
  })

  it('builds metadata from the about doc', async () => {
    getCmsPageByPath.mockResolvedValue({
      seoTitle: 'About — Brandon Perfetti',
      seoDescription: 'Doc-driven about description.',
    })
    const meta = await generateMetadata()
    expect(meta.title).toBe('About — Brandon Perfetti')
    expect(meta.description).toBe('Doc-driven about description.')
    expect(getCmsPageByPath).toHaveBeenCalledWith('/about')
  })

  it('falls back to the default title/description when the doc has none', async () => {
    getCmsPageByPath.mockResolvedValue(null)
    const meta = await generateMetadata()
    expect(meta.title).toBe('About')
    expect(String(meta.description)).toContain('Brandon')
  })
})
