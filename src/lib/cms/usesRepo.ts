import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getCmsProvider } from '@/lib/cms/provider'
import { getNotionUsesDataSourceId } from '@/lib/cms/notion/config'
import { mapNotionEntity } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import type { CmsEntityItem, CmsUseSection } from '@/lib/cms/types'

const getCachedNotionUses = unstable_cache(
  async (): Promise<CmsEntityItem[]> => {
    const pages = await queryAllDataSourcePages(getNotionUsesDataSourceId(), {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    })

    return pages
      .map(mapNotionEntity)
      .filter((item): item is CmsEntityItem => item !== null)
      .sort((a, b) => {
        const categorySort = (a.category ?? '').localeCompare(b.category ?? '')
        if (categorySort !== 0) {
          return categorySort
        }

        return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
      })
  },
  ['cms', 'notion', 'uses'],
  {
    revalidate: CMS_REVALIDATE.uses,
    tags: [CMS_TAGS.uses],
  },
)

function groupUses(items: CmsEntityItem[]): CmsUseSection[] {
  const bySection = new Map<string, CmsEntityItem[]>()

  for (const item of items) {
    const section = item.category || 'Tools'
    const existing = bySection.get(section) ?? []
    existing.push(item)
    bySection.set(section, existing)
  }

  return [...bySection.entries()].map(([title, sectionItems]) => ({
    title,
    items: sectionItems,
  }))
}

export async function getCmsUses() {
  if (getCmsProvider() !== 'notion') {
    return null
  }

  const items = await getCachedNotionUses()
  return groupUses(items)
}
