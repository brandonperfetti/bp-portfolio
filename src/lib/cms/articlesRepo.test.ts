import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCmsDefaultAuthor: vi.fn(),
  getNotionBlockTree: vi.fn(),
  flattenBlockText: vi.fn(),
  notionRequest: vi.fn(),
  getNotionArticlesDataSourceId: vi.fn(),
  mapNotionArticleSummary: vi.fn(),
  mapNotionAuthorProfile: vi.fn(),
  queryAllDataSourcePages: vi.fn(),
  getProperty: vi.fn(),
  propertyToRelationIds: vi.fn(),
  mapWithConcurrency: vi.fn(),
  getCmsProvider: vi.fn(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/cms/authorsRepo', () => ({
  getCmsDefaultAuthor: mocks.getCmsDefaultAuthor,
}))

vi.mock('@/lib/cms/notion/blocks', () => ({
  getNotionBlockTree: mocks.getNotionBlockTree,
  flattenBlockText: mocks.flattenBlockText,
}))

vi.mock('@/lib/cms/notion/client', () => ({
  notionRequest: mocks.notionRequest,
}))

vi.mock('@/lib/cms/notion/config', () => ({
  getNotionArticlesDataSourceId: mocks.getNotionArticlesDataSourceId,
}))

vi.mock('@/lib/cms/notion/mapper', () => ({
  mapNotionArticleSummary: mocks.mapNotionArticleSummary,
  mapNotionAuthorProfile: mocks.mapNotionAuthorProfile,
}))

vi.mock('@/lib/cms/notion/pagination', () => ({
  queryAllDataSourcePages: mocks.queryAllDataSourcePages,
}))

vi.mock('@/lib/cms/notion/property', () => ({
  getProperty: mocks.getProperty,
  propertyToRelationIds: mocks.propertyToRelationIds,
}))

vi.mock('@/lib/cms/notion/utils', () => ({
  mapWithConcurrency: mocks.mapWithConcurrency,
}))

vi.mock('@/lib/cms/provider', () => ({
  getCmsProvider: mocks.getCmsProvider,
}))

import { getCmsArticleBySlug } from '@/lib/cms/articlesRepo'

describe('getCmsArticleBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCmsProvider.mockReturnValue('notion')
    mocks.getNotionArticlesDataSourceId.mockReturnValue('ds_articles')
    mocks.queryAllDataSourcePages.mockResolvedValue([{ id: 'article-page-1' }])
    mocks.mapNotionArticleSummary.mockReturnValue({
      slug: 'zod-the-validation-library-that-changed-how-i-think-about-data',
      title: 'Zod',
      description: 'Validation',
      author: 'Brandon',
      date: '2026-03-19',
      sourceArticlePageId: 'source-page-1',
    })
    mocks.getProperty.mockReturnValue(undefined)
    mocks.propertyToRelationIds.mockReturnValue([])
    mocks.mapWithConcurrency.mockImplementation(async (items, worker) => {
      return Promise.all(items.map((item: unknown) => worker(item)))
    })
    mocks.getCmsDefaultAuthor.mockResolvedValue(null)
    mocks.flattenBlockText.mockReturnValue('')
  })

  it('fails open when Notion block fetch for a slug is transiently unavailable', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.getNotionBlockTree.mockRejectedValueOnce(new Error('read ECONNRESET'))

    const result = await getCmsArticleBySlug(
      'zod-the-validation-library-that-changed-how-i-think-about-data',
    )

    expect(result).toMatchObject({
      slug: 'zod-the-validation-library-that-changed-how-i-think-about-data',
      sourceType: 'notion',
      bodyBlocks: [],
      searchText: '',
    })
    expect(warningSpy).toHaveBeenCalledWith(
      '[cms:notion] article body blocks unavailable',
      expect.objectContaining({
        slug: 'zod-the-validation-library-that-changed-how-i-think-about-data',
        sourceArticlePageId: 'source-page-1',
        error: 'read ECONNRESET',
      }),
    )
  })
})
