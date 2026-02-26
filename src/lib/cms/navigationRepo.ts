import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getNotionRouteRegistryDataSourceId } from '@/lib/cms/notion/config'
import { NotionConfigError, NotionHttpError } from '@/lib/cms/notion/errors'
import { mapNavigationItem } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import { getCmsProvider } from '@/lib/cms/provider'
import type { CmsNavigationItem } from '@/lib/cms/types'

const DEFAULT_NAVIGATION: CmsNavigationItem[] = [
  { href: '/about', label: 'About', order: 10, showInNav: true },
  { href: '/articles', label: 'Articles', order: 20, showInNav: true },
  { href: '/projects', label: 'Projects', order: 30, showInNav: true },
  { href: '/tech', label: 'Tech', order: 40, showInNav: true },
  { href: '/hermes', label: 'Hermes', order: 50, showInNav: true },
  { href: '/uses', label: 'Uses', order: 60, showInNav: true },
]

const getCachedNotionNavigation = unstable_cache(
  async (): Promise<CmsNavigationItem[]> => {
    const pages = await queryAllDataSourcePages(getNotionRouteRegistryDataSourceId(), {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    })

    const items = pages
      .map(mapNavigationItem)
      .filter((item): item is CmsNavigationItem => item !== null)
      .sort((a, b) => a.order - b.order)

    if (!items.length) {
      return DEFAULT_NAVIGATION
    }

    return items
  },
  ['cms', 'notion', 'navigation'],
  {
    revalidate: CMS_REVALIDATE.navigation,
    tags: [CMS_TAGS.navigation],
  },
)

export async function getCmsNavigation() {
  if (getCmsProvider() !== 'notion') {
    return DEFAULT_NAVIGATION
  }

  try {
    return await getCachedNotionNavigation()
  } catch (error) {
    if (error instanceof NotionConfigError || error instanceof NotionHttpError) {
      console.warn('[cms:notion] navigation unavailable, using default navigation', {
        error: error.message,
      })
      return DEFAULT_NAVIGATION
    }

    throw error
  }
}
