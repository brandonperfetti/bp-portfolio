import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getCmsProvider } from '@/lib/cms/provider'
import { getNotionWorkHistoryDataSourceId } from '@/lib/cms/notion/config'
import { NotionConfigError, NotionHttpError } from '@/lib/cms/notion/errors'
import { mapNotionWorkHistory } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import type { CmsWorkHistoryItem } from '@/lib/cms/types'

const getCachedNotionWorkHistory = unstable_cache(
  async (): Promise<CmsWorkHistoryItem[]> => {
    const pages = await queryAllDataSourcePages(getNotionWorkHistoryDataSourceId(), {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    })

    return pages
      .map(mapNotionWorkHistory)
      .filter((item): item is CmsWorkHistoryItem => item !== null)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
  },
  ['cms', 'notion', 'work-history'],
  {
    revalidate: CMS_REVALIDATE.workHistory,
    tags: [CMS_TAGS.workHistory],
  },
)

export async function getCmsWorkHistory() {
  if (getCmsProvider() !== 'notion') {
    return null
  }

  try {
    return await getCachedNotionWorkHistory()
  } catch (error) {
    if (error instanceof NotionConfigError || error instanceof NotionHttpError) {
      console.warn('[cms:notion] work history unavailable, falling back to local content', {
        error: error.message,
      })
      return null
    }

    throw error
  }
}
