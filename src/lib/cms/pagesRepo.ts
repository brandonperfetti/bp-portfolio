import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getCmsProvider } from '@/lib/cms/provider'
import { getNotionBlockTree } from '@/lib/cms/notion/blocks'
import { getNotionPagesDataSourceId } from '@/lib/cms/notion/config'
import { NotionConfigError, NotionHttpError } from '@/lib/cms/notion/errors'
import { mapNotionPageContent } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import type { CmsPageContent } from '@/lib/cms/types'

function normalizePath(path: string) {
  if (!path || path === '/') {
    return '/'
  }

  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  return withLeadingSlash.replace(/\/+$/, '')
}

const getCachedNotionPages = unstable_cache(
  async (): Promise<CmsPageContent[]> => {
    const pages = await queryAllDataSourcePages(getNotionPagesDataSourceId(), {
      sorts: [{ property: 'Sort Order', direction: 'ascending' }],
    })

    return pages.map(mapNotionPageContent).filter(Boolean) as CmsPageContent[]
  },
  ['cms', 'notion', 'pages'],
  {
    revalidate: CMS_REVALIDATE.pages,
    tags: [CMS_TAGS.pages],
  },
)

const getCachedPageByPath = unstable_cache(
  async (path: string, includeBody: boolean): Promise<CmsPageContent | null> => {
    const targetPath = normalizePath(path)
    const pages = await getCachedNotionPages()
    const page = pages.find((candidate) => candidate.routeKey === targetPath)
    if (!page) {
      return null
    }

    if (!includeBody) {
      return page
    }

    try {
      const bodyBlocks = await getNotionBlockTree(page.pageId)
      return { ...page, bodyBlocks }
    } catch (error) {
      console.warn('[cms:notion] page body blocks unavailable', {
        path: targetPath,
        pageId: page.pageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return page
    }
  },
  ['cms', 'notion', 'page-by-path'],
  {
    revalidate: CMS_REVALIDATE.pages,
    tags: [CMS_TAGS.pages],
  },
)

export async function getCmsPageByPath(path: string, options?: { includeBody?: boolean }) {
  if (getCmsProvider() !== 'notion') {
    return null
  }

  const includeBody = options?.includeBody ?? false
  try {
    return await getCachedPageByPath(path, includeBody)
  } catch (error) {
    if (error instanceof NotionConfigError || error instanceof NotionHttpError) {
      console.warn('[cms:notion] page content unavailable, falling back to local content', {
        path,
        error: error.message,
      })
      return null
    }

    throw error
  }
}
