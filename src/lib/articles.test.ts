import { afterEach, describe, expect, it, vi } from 'vitest'

// #76 B3: getSearchArticles runs the future-dated publish gate inside a
// `'use cache'` scope. The gate reads Date.now() (isFuturePublicationDate, real
// here) — freeze the clock so the boundary is deterministic, and stub the cache
// primitives so the function runs under jsdom.
const getCmsSearchArticles = vi.fn()
vi.mock('@/lib/cms/articlesRepo', () => ({
  getCmsSearchArticles: () => getCmsSearchArticles(),
  getAllCmsArticleSummaries: vi.fn(),
  getCmsArticleBySlug: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }))

import { getSearchArticles } from '@/lib/articles'

const searchArticle = (slug: string, date: string) => ({
  slug,
  title: slug,
  description: '',
  author: 'Brandon',
  date,
  searchText: '',
})

afterEach(() => {
  vi.useRealTimers()
  getCmsSearchArticles.mockReset()
})

describe('getSearchArticles publish gate (#76 B3, frozen now)', () => {
  it('excludes future-dated and keeps past-dated articles', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    getCmsSearchArticles.mockResolvedValue([
      searchArticle('past', '2025-01-01'),
      searchArticle('future', '2026-12-01'),
      searchArticle('today', '2026-05-01'),
    ])

    const result = await getSearchArticles()

    expect(result.map((a) => a.slug)).toEqual(['past', 'today'])
  })

  it('flips a scheduled post in once its date passes', async () => {
    getCmsSearchArticles.mockResolvedValue([
      searchArticle('drop', '2026-07-01'),
    ])

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    expect((await getSearchArticles()).map((a) => a.slug)).toEqual([])

    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    expect((await getSearchArticles()).map((a) => a.slug)).toEqual(['drop'])
  })
})
