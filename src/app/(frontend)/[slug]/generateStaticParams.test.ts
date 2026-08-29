import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 empty-CMS guard: Cache Components hard-errors when generateStaticParams
// returns []. The guard must emit ≥1 param (a notFound sentinel) on an empty
// published-slug set, and map slugs normally otherwise.
const getPublishedPageSlugs = vi.fn()
vi.mock('@/lib/cms/pagesRepo', () => ({
  RESERVED_PAGE_SLUGS: new Set<string>(),
  getPageBySlugDraftAware: vi.fn(),
  getPublishedPageSlugs: () => getPublishedPageSlugs(),
}))
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: vi.fn(async () => ({})),
}))
vi.mock('@/lib/site', () => ({ getSiteUrl: () => 'https://example.com' }))
// RenderRhythmPage transitively loads gsap/ScrollReveal, which registers a
// ScrollTrigger plugin at import and needs window.matchMedia (absent in jsdom).
// generateStaticParams never renders it, so stub it out.
vi.mock('@/heros/RenderRhythmPage', () => ({ RenderRhythmPage: () => null }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import { generateStaticParams } from '@/app/(frontend)/[slug]/page'

beforeEach(() => {
  getPublishedPageSlugs.mockReset()
})

describe('/[slug] generateStaticParams empty-CMS guard (#76 B2)', () => {
  it('returns ≥1 param (a notFound sentinel) when no pages are published', async () => {
    getPublishedPageSlugs.mockResolvedValue([])
    const params = await generateStaticParams()
    expect(params.length).toBeGreaterThanOrEqual(1)
    expect(typeof params[0].slug).toBe('string')
    expect(params[0].slug.length).toBeGreaterThan(0)
  })

  it('maps the published slugs when the set is non-empty', async () => {
    getPublishedPageSlugs.mockResolvedValue(['now', 'consulting'])
    expect(await generateStaticParams()).toEqual([
      { slug: 'now' },
      { slug: 'consulting' },
    ])
  })
})
