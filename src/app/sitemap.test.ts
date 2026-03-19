import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllArticles: vi.fn(),
  getSiteUrl: vi.fn(),
}))

vi.mock('@/lib/articles', () => ({
  getAllArticles: mocks.getAllArticles,
}))

vi.mock('@/lib/site', () => ({
  getSiteUrl: mocks.getSiteUrl,
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
    expect(articleEntry?.lastModified).toEqual(new Date('2025-03-01'))
  })
})
