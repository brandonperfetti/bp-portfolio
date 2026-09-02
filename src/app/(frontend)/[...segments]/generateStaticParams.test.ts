import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 empty-CMS guard: Cache Components hard-errors when generateStaticParams
// returns []. The guard must emit ≥1 param (a notFound sentinel) on an empty
// published-path set, and map paths to segment arrays otherwise (#148).
const getPublishedPagePaths = vi.fn()
vi.mock('@/lib/cms/pagesRepo', () => ({
  getPageByPathDraftAware: vi.fn(),
  getPublishedPagePaths: () => getPublishedPagePaths(),
  isReservedPagePath: () => false,
  pathSegments: (path: string) => path.split('/').filter(Boolean),
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

import { generateStaticParams } from '@/app/(frontend)/[...segments]/page'

beforeEach(() => {
  getPublishedPagePaths.mockReset()
})

describe('/[...segments] generateStaticParams empty-CMS guard (#76 B2)', () => {
  it('returns ≥1 param (a notFound sentinel) when no pages are published', async () => {
    getPublishedPagePaths.mockResolvedValue([])
    const params = await generateStaticParams()
    expect(params.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(params[0].segments)).toBe(true)
    expect(params[0].segments).toHaveLength(1)
    expect(params[0].segments[0].length).toBeGreaterThan(0)
  })

  it('maps the published paths when the set is non-empty', async () => {
    getPublishedPagePaths.mockResolvedValue(['now', 'consulting'])
    expect(await generateStaticParams()).toEqual([
      { segments: ['now'] },
      { segments: ['consulting'] },
    ])
  })

  it('splits a nested path into its segments (#148)', async () => {
    getPublishedPagePaths.mockResolvedValue([
      'work/brytecore',
      'tech/ai',
      'a/b/c',
    ])
    expect(await generateStaticParams()).toEqual([
      { segments: ['work', 'brytecore'] },
      { segments: ['tech', 'ai'] },
      { segments: ['a', 'b', 'c'] },
    ])
  })

  it('emits exactly one entry per published page — the static profile is unchanged in kind', async () => {
    getPublishedPagePaths.mockResolvedValue([
      'now',
      'consulting',
      'work/brytecore',
    ])
    expect(await generateStaticParams()).toHaveLength(3)
  })
})
