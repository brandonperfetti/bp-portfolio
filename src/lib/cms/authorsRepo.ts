import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getOptionalNotionAuthorsDataSourceId } from '@/lib/cms/notion/config'
import { mapNotionAuthorProfile, DEFAULT_CMS_AUTHOR } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import { getCmsProvider } from '@/lib/cms/provider'
import type { CmsAuthor, CmsAuthorProfile } from '@/lib/cms/types'

export const FALLBACK_AUTHOR: CmsAuthor = { ...DEFAULT_CMS_AUTHOR }

const getCachedNotionAuthors = unstable_cache(
  async (): Promise<CmsAuthorProfile[]> => {
    const dataSourceId = getOptionalNotionAuthorsDataSourceId()
    if (!dataSourceId) {
      return []
    }

    const pages = await queryAllDataSourcePages(dataSourceId, {})
    return pages
      .map(mapNotionAuthorProfile)
      .filter((author): author is CmsAuthorProfile => author !== null)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
  },
  ['cms', 'notion', 'authors'],
  {
    revalidate: CMS_REVALIDATE.authors,
    tags: [CMS_TAGS.authors],
  },
)

export async function getCmsAuthors() {
  if (getCmsProvider() !== 'notion') {
    return []
  }

  return getCachedNotionAuthors()
}

export async function getCmsDefaultAuthor(): Promise<CmsAuthor> {
  if (getCmsProvider() !== 'notion') {
    return FALLBACK_AUTHOR
  }

  const authors = await getCachedNotionAuthors()
  return (
    authors.find((author) => author.primary) ??
    authors[0] ??
    FALLBACK_AUTHOR
  )
}
