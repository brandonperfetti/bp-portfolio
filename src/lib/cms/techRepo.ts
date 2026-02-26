import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getCmsProvider } from '@/lib/cms/provider'
import { getNotionTechDataSourceId } from '@/lib/cms/notion/config'
import { mapNotionEntity } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import type { CmsEntityItem } from '@/lib/cms/types'

const getCachedNotionTech = unstable_cache(
  async (): Promise<CmsEntityItem[]> => {
    const pages = await queryAllDataSourcePages(getNotionTechDataSourceId(), {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    })

    const mapped = pages
      .map(mapNotionEntity)
      .filter((tech): tech is CmsEntityItem => tech !== null)
      .sort((a, b) => {
        const orderCompare =
          (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        if (orderCompare !== 0) {
          return orderCompare
        }

        return +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0)
      })

    const seen = new Set<string>()
    const duplicates: string[] = []
    const deduped: CmsEntityItem[] = []

    for (const item of mapped) {
      const key = (item.slug || item.name).toLowerCase().trim()
      if (seen.has(key)) {
        duplicates.push(item.name)
        continue
      }
      seen.add(key)
      deduped.push(item)
    }

    if (duplicates.length) {
      console.warn('[cms:notion] duplicate tech entries skipped', {
        count: duplicates.length,
        items: duplicates,
      })
    }

    return deduped
  },
  ['cms', 'notion', 'tech'],
  {
    revalidate: CMS_REVALIDATE.tech,
    tags: [CMS_TAGS.tech],
  },
)

export async function getCmsTech() {
  if (getCmsProvider() !== 'notion') {
    return null
  }

  return getCachedNotionTech()
}
