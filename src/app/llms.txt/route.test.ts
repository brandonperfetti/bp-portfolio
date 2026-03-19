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

describe('GET /llms.txt', () => {
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

  it('returns plaintext with canonical links and public articles', async () => {
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'visible-article',
        title: 'Visible Article',
        description: 'Public and indexable.',
        date: '2025-01-10',
        noindex: false,
      },
    ])

    const response = await GET()
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(body).toContain('# Example Site')
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(body).toContain('Full Index: https://example.com/llms-full.txt')
    expect(body).toContain(
      '- [Visible Article](https://example.com/articles/visible-article) - Public and indexable.',
    )
  })

  it('excludes noindex and future-dated articles', async () => {
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

  it('uses settings.canonicalUrl as the output base when it differs from getSiteUrl', async () => {
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
        slug: 'canonical-article',
        title: 'Canonical Article',
        description: 'Canonical base test.',
        date: '2025-01-10',
        noindex: false,
      },
    ])

    const response = await GET()
    const body = await response.text()

    expect(body).toContain('Base: https://canonical.example.com')
    expect(body).toContain('Sitemap: https://canonical.example.com/sitemap.xml')
    expect(body).toContain(
      '- [Canonical Article](https://canonical.example.com/articles/canonical-article) - Canonical base test.',
    )
    expect(body).not.toContain(
      'https://app.example.com/articles/canonical-article',
    )
  })
})
