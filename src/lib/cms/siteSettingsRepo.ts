import { unstable_cache } from 'next/cache'

import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'
import { getCmsProvider } from '@/lib/cms/provider'
import { getNotionSiteSettingsDataSourceId } from '@/lib/cms/notion/config'
import { mapSiteSettings } from '@/lib/cms/notion/mapper'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import { getSiteUrl, SITE_DESCRIPTION } from '@/lib/site'
import type { CmsSiteSettings } from '@/lib/cms/types'

const DEFAULT_SITE_SETTINGS: CmsSiteSettings = {
  siteName: 'Brandon Perfetti',
  siteTitle: 'Brandon Perfetti - Product & Project Manager and Software Engineer',
  siteDescription: SITE_DESCRIPTION,
  canonicalUrl: getSiteUrl(),
  twitterCard: 'summary_large_image',
}

const getCachedNotionSiteSettings = unstable_cache(
  async (): Promise<CmsSiteSettings> => {
    const pages = await queryAllDataSourcePages(getNotionSiteSettingsDataSourceId(), {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    })

    for (const page of pages) {
      const settings = mapSiteSettings(page)
      if (settings) {
        return settings
      }
    }

    return DEFAULT_SITE_SETTINGS
  },
  ['cms', 'notion', 'site-settings'],
  {
    revalidate: CMS_REVALIDATE.settings,
    tags: [CMS_TAGS.settings],
  },
)

export async function getCmsSiteSettings() {
  if (getCmsProvider() !== 'notion') {
    return DEFAULT_SITE_SETTINGS
  }

  return getCachedNotionSiteSettings()
}
