import { unstable_cache } from 'next/cache'

import { getCmsDefaultAuthor } from '@/lib/cms/authorsRepo'
import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { flattenBlockText, getNotionBlockTree } from '@/lib/cms/notion/blocks'
import { notionRequest } from '@/lib/cms/notion/client'
import { getNotionArticlesDataSourceId } from '@/lib/cms/notion/config'
import type { NotionPage } from '@/lib/cms/notion/contracts'
import {
	mapNotionArticleSummary,
	mapNotionAuthorProfile,
} from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import { getProperty, propertyToRelationIds } from '@/lib/cms/notion/property'
import { mapWithConcurrency } from '@/lib/cms/notion/utils'
import { getCmsProvider } from '@/lib/cms/provider'
import type { CmsArticleDetail, CmsArticleSummary } from '@/lib/cms/types'

export type CmsArticleDetailResult = CmsArticleDetail & {
  sourceType: 'notion'
}

const getCachedLocalArticles = unstable_cache(
  async (): Promise<CmsArticleDetailResult[]> => [],
  ['cms', 'local', 'articles'],
  {
    revalidate: CMS_REVALIDATE.articles,
    tags: [CMS_TAGS.articles],
  },
)

async function getNotionPublishedArticlePages(): Promise<NotionPage[]> {
  return queryAllDataSourcePages(getNotionArticlesDataSourceId(), {
    sorts: [
      {
        timestamp: 'last_edited_time',
        direction: 'descending',
      },
    ],
  })
}

const getCachedNotionArticleSummaries = unstable_cache(
  async (): Promise<CmsArticleSummary[]> => {
    const pages = await getNotionPublishedArticlePages()
    const mappedByPage: Array<{
      summary: CmsArticleSummary
      authorId?: string
    }> = []

    for (const page of pages) {
      const summary = mapNotionArticleSummary(page)
      if (!summary) {
        continue
      }

      const authorIds = propertyToRelationIds(
        getProperty(page.properties, ['Author', 'Authors']),
      )

      mappedByPage.push({
        summary,
        authorId: authorIds[0],
      })
    }

    const authorIds = Array.from(
      new Set(mappedByPage.map((item) => item.authorId).filter(Boolean)),
    ) as string[]
    const authorsById = new Map<string, NonNullable<ReturnType<typeof mapNotionAuthorProfile>>>()

    await mapWithConcurrency(
      authorIds,
      async (authorId) => {
        try {
          const page = (await notionRequest(`/pages/${authorId}`, {
            method: 'GET',
          })) as NotionPage
          const author = mapNotionAuthorProfile(page)
          if (author) {
            authorsById.set(author.id, author)
          }
        } catch (error) {
          console.warn('[cms:notion] author fetch degraded', {
            authorId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
      2,
    )

    const defaultAuthor = await getCmsDefaultAuthor()
    const mapped = mappedByPage
      .map(({ summary, authorId }) => ({
        ...summary,
        author:
          (authorId ? authorsById.get(authorId) : undefined) ??
          defaultAuthor ??
          summary.author,
      }))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))

    return mapped
  },
  ['cms', 'notion', 'articles'],
  {
    revalidate: CMS_REVALIDATE.articles,
    tags: [CMS_TAGS.articles],
  },
)

async function getNotionArticleDetailRaw(slug: string): Promise<CmsArticleDetailResult | null> {
  const summaries = await getCachedNotionArticleSummaries()
  const summary = summaries.find((article) => article.slug === slug)

  if (!summary?.sourceArticlePageId) {
    return null
  }

  const bodyBlocks = await getNotionBlockTree(summary.sourceArticlePageId)

  return {
    ...summary,
    bodyBlocks,
    searchText: flattenBlockText(bodyBlocks),
    sourceType: 'notion',
  }
}

function getCachedNotionArticleDetail(slug: string) {
  return unstable_cache(
    async () => getNotionArticleDetailRaw(slug),
    ['cms', 'notion', 'article', slug],
    {
      revalidate: CMS_REVALIDATE.articleDetail,
      tags: [CMS_TAGS.articles, CMS_TAGS.article(slug)],
    },
  )()
}

export async function getAllCmsArticleSummaries() {
  if (getCmsProvider() === 'notion') {
    return getCachedNotionArticleSummaries()
  }

  return getCachedLocalArticles()
}

export async function getCmsArticleBySlug(slug: string): Promise<CmsArticleDetailResult | null> {
  if (getCmsProvider() === 'notion') {
    return getCachedNotionArticleDetail(slug)
  }

  return null
}

export async function getCmsSearchArticles(): Promise<CmsArticleDetailResult[]> {
  if (getCmsProvider() !== 'notion') {
    return getCachedLocalArticles()
  }

  const getCachedNotionSearchArticles = unstable_cache(
    async (): Promise<CmsArticleDetailResult[]> => {
      const summaries = await getCachedNotionArticleSummaries()

      return summaries.map((summary) => {
        const metadataSearchText = [
          summary.title,
          summary.description,
          ...(summary.keywords ?? []),
          ...(summary.topics ?? []),
          ...(summary.tech ?? []),
        ]
          .join(' ')
          .toLowerCase()
          .trim()

        const projectedSearchText = (summary.searchIndexText ?? '')
          .toLowerCase()
          .trim()

        return {
          ...summary,
          sourceType: 'notion' as const,
          bodyBlocks: [],
          searchText: `${metadataSearchText} ${projectedSearchText}`.trim(),
        }
      })
    },
    ['cms', 'notion', 'articles', 'search'],
    {
      revalidate: CMS_REVALIDATE.search,
      tags: [CMS_TAGS.articles],
    },
  )

  return getCachedNotionSearchArticles()
}

export async function fetchNotionPageById(pageId: string) {
  return notionRequest(`/pages/${pageId}`, { method: 'GET' })
}
