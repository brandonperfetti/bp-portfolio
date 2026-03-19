import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllArticles: vi.fn(),
  getCmsSiteSettings: vi.fn(),
  getSiteUrl: vi.fn(),
}))

vi.mock('@/lib/articles', () => ({
  getAllArticles: mocks.getAllArticles,
}))

vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: mocks.getCmsSiteSettings,
}))

vi.mock('@/lib/site', () => ({
  getSiteUrl: mocks.getSiteUrl,
}))

import { GET } from './route'

describe('GET /llms-full.txt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getCmsSiteSettings.mockResolvedValue({
      siteName: 'Example Site',
      siteTitle: 'Example Site',
      siteDescription: 'A sample site for testing.',
      canonicalUrl: 'https://example.com',
      twitterCard: 'summary_large_image',
    })
  })

  it('returns expanded corpus entries and references primary llms index', async () => {
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'public-article',
        title: 'Public Article',
        description: 'Expanded listing entry.',
        date: '2025-01-10',
        updatedAt: '2025-01-12T00:00:00.000Z',
        topics: ['Web Development'],
        keywords: ['Next.js'],
        tech: ['TypeScript'],
        noindex: false,
      },
    ])

    const response = await GET()
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(body).toContain('Primary index: https://example.com/llms.txt')
    expect(body).toContain('## Public Article')
    expect(body).toContain('URL: https://example.com/articles/public-article')
    expect(body).toContain('Topics: Web Development')
    expect(body).toContain('Keywords: Next.js')
    expect(body).toContain('Tech: TypeScript')
  })

  it('excludes noindex and future-dated articles from full corpus', async () => {
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'public-article',
        title: 'Public Article',
        description: 'Should remain.',
        date: '2025-01-10',
        noindex: false,
      },
      {
        slug: 'noindex-article',
        title: 'Noindex Article',
        description: 'Should be hidden.',
        date: '2025-01-11',
        noindex: true,
      },
      {
        slug: 'future-article',
        title: 'Future Article',
        description: 'Should be hidden.',
        date: '2999-01-01',
        noindex: false,
      },
    ])

    const response = await GET()
    const body = await response.text()

    expect(body).toContain('Public Article')
    expect(body).not.toContain('Noindex Article')
    expect(body).not.toContain('Future Article')
  })

  it('prefers canonicalUrl from settings when getSiteUrl differs', async () => {
    mocks.getSiteUrl.mockReturnValue('https://app.example.com')
    mocks.getCmsSiteSettings.mockResolvedValue({
      siteName: 'Example Site',
      siteTitle: 'Example Site',
      siteDescription: 'A sample site for testing.',
      canonicalUrl: 'https://canonical.example.com',
      twitterCard: 'summary_large_image',
    })
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'public-article',
        title: 'Public Article',
        description: 'Expanded listing entry.',
        date: '2025-01-10',
        noindex: false,
      },
    ])

    const response = await GET()
    const body = await response.text()

    expect(body).toContain('Base: https://canonical.example.com')
    expect(body).toContain(
      'Primary index: https://canonical.example.com/llms.txt',
    )
    expect(body).toContain(
      'URL: https://canonical.example.com/articles/public-article',
    )
    expect(body).not.toContain(
      'https://app.example.com/articles/public-article',
    )
  })
})
