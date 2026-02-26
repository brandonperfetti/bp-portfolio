import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getCmsProvider } from '@/lib/cms/provider'
import { getNotionProjectsDataSourceId } from '@/lib/cms/notion/config'
import { mapNotionEntity } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import type { CmsEntityItem } from '@/lib/cms/types'

async function getNotionProjectsRaw(): Promise<CmsEntityItem[]> {
  const pages = await queryAllDataSourcePages(getNotionProjectsDataSourceId(), {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
  })

  return pages
    .map(mapNotionEntity)
    .filter((project): project is CmsEntityItem => project !== null)
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
}

const getCachedNotionProjects = unstable_cache(
  async (): Promise<CmsEntityItem[]> => getNotionProjectsRaw(),
  ['cms', 'notion', 'projects'],
  {
    revalidate: CMS_REVALIDATE.projects,
    tags: [CMS_TAGS.projects],
  },
)

export async function getCmsProjects() {
  if (getCmsProvider() !== 'notion') {
    return null
  }

  if (process.env.NODE_ENV !== 'production') {
    return getNotionProjectsRaw()
  }

  return getCachedNotionProjects()
}
