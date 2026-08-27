import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 empty-CMS guard for the article route (mirrors /[slug]): ≥1 param on an
// empty published set, slug-mapping otherwise. Heavy transitive imports (Payload
// config, Clerk, the body components) are mocked so only generateStaticParams
// runs under jsdom.
const getAllArticles = vi.fn()
vi.mock('@/lib/articles', () => ({
  getAllArticles: () => getAllArticles(),
  getArticleBySlug: vi.fn(),
}))
vi.mock('@/lib/cms/articlesRepo', () => ({
  resolveArticleShareTargetIds: () => [],
}))
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: vi.fn(async () => ({})),
}))
vi.mock('@/components/cms/GatedArticleBody', () => ({
  ArticleBodyRegion: () => null,
  AuthGatedArticleBody: () => null,
}))
vi.mock('@/components/cms/CmsPostBlocks', () => ({
  CmsPostBlocks: () => null,
}))
// ArticleLayout transitively loads gsap/ScrollReveal (registers a ScrollTrigger
// plugin at import → needs window.matchMedia, absent in jsdom). generateStaticParams
// never renders it, so stub it and the other presentational imports.
vi.mock('@/components/ArticleLayout', () => ({ ArticleLayout: () => null }))
vi.mock('@/components/cms/ArticleMeta', () => ({ ArticleMeta: () => null }))
vi.mock('@/components/cms/CopyPageButton', () => ({
  CopyPageButton: () => null,
}))
vi.mock('@/components/cms/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/lib/site', () => ({ getSiteUrl: () => 'https://example.com' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import { generateStaticParams } from '@/app/(frontend)/articles/[slug]/page'

beforeEach(() => {
  getAllArticles.mockReset()
})

describe('/articles/[slug] generateStaticParams empty-CMS guard (#76 B2)', () => {
  it('returns ≥1 param (a notFound sentinel) when no posts are published', async () => {
    getAllArticles.mockResolvedValue([])
    const params = await generateStaticParams()
    expect(params.length).toBeGreaterThanOrEqual(1)
    expect(typeof params[0].slug).toBe('string')
    expect(params[0].slug.length).toBeGreaterThan(0)
  })

  it('maps the published article slugs when the set is non-empty', async () => {
    getAllArticles.mockResolvedValue([{ slug: 'first' }, { slug: 'second' }])
    expect(await generateStaticParams()).toEqual([
      { slug: 'first' },
      { slug: 'second' },
    ])
  })
})
