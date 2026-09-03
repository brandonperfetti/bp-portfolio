import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllArticles: vi.fn(),
  getPublishedPagePaths: vi.fn(async () => ['now']),
  getSiteUrl: vi.fn(),
}))

vi.mock('@/lib/articles', () => ({
  getAllArticles: mocks.getAllArticles,
}))

vi.mock('@/lib/cms/pagesRepo', () => ({
  getPublishedPagePaths: mocks.getPublishedPagePaths,
}))

vi.mock('@/lib/site', () => ({
  getSiteUrl: mocks.getSiteUrl,
}))

// #76 B3: sitemap prepares its data inside a `'use cache'` scope; stub the
// primitives so the route runs under jsdom.
vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

import sitemap from './sitemap'

describe('sitemap', () => {
  it('excludes noindex and future-dated articles from sitemap routes', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'public-article',
        date: '2025-01-10',
        updatedAt: '2025-02-01T00:00:00.000Z',
        noindex: false,
      },
      {
        slug: 'noindex-article',
        date: '2025-01-11',
        noindex: true,
      },
      {
        slug: 'scheduled-article',
        date: '2999-01-01',
        noindex: false,
      },
    ])

    const entries = await sitemap()
    const urls = entries.map((entry) => String(entry.url))

    expect(urls).toContain('https://example.com/articles/public-article')
    expect(urls).not.toContain('https://example.com/articles/noindex-article')
    expect(urls).not.toContain('https://example.com/articles/scheduled-article')
    // #28 — the /speaking route was removed; it must not appear in the sitemap.
    expect(urls).not.toContain('https://example.com/speaking')
  })

  it('sets /articles lastModified from the newest public article freshness', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'older',
        date: '2025-01-01',
        updatedAt: '2025-01-02T00:00:00.000Z',
        noindex: false,
      },
      {
        slug: 'newer',
        date: '2025-01-05',
        updatedAt: '2025-01-06T00:00:00.000Z',
        noindex: false,
      },
    ])

    const entries = await sitemap()
    const articlesIndex = entries.find(
      (entry) => String(entry.url) === 'https://example.com/articles',
    )

    expect(articlesIndex).toBeDefined()
    expect(articlesIndex?.lastModified).toEqual(
      new Date('2025-01-06T00:00:00.000Z'),
    )

    const home = entries.find(
      (entry) => String(entry.url) === 'https://example.com',
    )
    expect(home?.lastModified).toBeUndefined()
  })

  it('sets /articles lastModified to undefined when no public articles exist', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])

    const entries = await sitemap()
    const articlesIndex = entries.find(
      (entry) => String(entry.url) === 'https://example.com/articles',
    )

    expect(articlesIndex).toBeDefined()
    expect(articlesIndex?.lastModified).toBeUndefined()
  })

  it('uses article.date when article.updatedAt is missing', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'date-only-article',
        date: '2025-03-01',
        noindex: false,
      },
    ])

    const entries = await sitemap()
    const articleEntry = entries.find(
      (entry) =>
        String(entry.url) === 'https://example.com/articles/date-only-article',
    )

    expect(articleEntry).toBeDefined()
    expect(articleEntry?.lastModified).toEqual(new Date(2025, 2, 1, 0, 0, 0, 0))
  })
})

/**
 * Page-builder URLs under hierarchy (#148): the sitemap must list a placed
 * page's real nested URL, not `/` + its slug — which would be a 404 in the
 * sitemap, the worst possible place for one.
 */
describe('sitemap page-builder URLs (#148)', () => {
  it('lists nested pages at their full path', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])
    mocks.getPublishedPagePaths.mockResolvedValue([
      'now',
      'work/brytecore',
      'tech/ai',
    ])

    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain('https://example.com/now')
    expect(urls).toContain('https://example.com/work/brytecore')
    expect(urls).toContain('https://example.com/tech/ai')
  })

  it('never emits /home as a second, redirecting URL for the root', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])
    // `getPublishedPagePaths` already filters the root out; this pins that the
    // sitemap does not reintroduce it by building URLs some other way.
    mocks.getPublishedPagePaths.mockResolvedValue(['now'])

    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).not.toContain('https://example.com/home')
    expect(urls).toContain('https://example.com')
  })
})

/**
 * Placed articles (#153): the sitemap lists an article's placed path, exactly
 * once. Listing both `/articles/<slug>` and the placed path would be the
 * duplicate-content failure the ticket exists to prevent, and listing only the
 * archive path would advertise a URL that 308s.
 */
describe('sitemap · placed articles (#153)', () => {
  it('lists a placed article at its section URL and never at /articles', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getPublishedPagePaths.mockResolvedValue([])
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'brytecore',
        path: 'work/brytecore',
        date: '2025-01-10',
        noindex: false,
      },
      { slug: 'plain', date: '2025-01-10', noindex: false },
    ])

    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain('https://example.com/work/brytecore')
    expect(urls).toContain('https://example.com/articles/plain')
    expect(urls).not.toContain('https://example.com/articles/brytecore')
    expect(urls.filter((u) => u.includes('brytecore'))).toHaveLength(1)
  })
})
