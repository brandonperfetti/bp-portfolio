import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { CmsSiteSettings } from '@/lib/cms/types'
import { getSiteUrl, SITE_DESCRIPTION } from '@/lib/site'

const DEFAULT_SITE_SETTINGS: CmsSiteSettings = {
  siteName: 'Brandon Perfetti',
  siteTitle:
    'Brandon Perfetti - Product & Project Manager and Software Engineer',
  siteDescription: SITE_DESCRIPTION,
  canonicalUrl: getSiteUrl(),
  twitterCard: 'summary_large_image',
  copyPageEnabled: true,
  copyPageLabel: 'Copy page',
}

/**
 * Site settings from the Payload `site-settings` global (was Notion in v3),
 * cached under `global_site-settings` and revalidated by its afterChange hook.
 *
 * @remarks Falls back to hard defaults so the site renders with an empty CMS
 * (the Phase 0 "boots with only a database" invariant).
 */
export const getCmsSiteSettings = unstable_cache(
  async (): Promise<CmsSiteSettings> => {
    const payload = await getPayload({ config: configPromise })
    const settings = await payload.findGlobal({
      slug: 'site-settings',
      depth: 1,
    })

    const ogImage =
      settings?.defaultSeo?.ogImage &&
      typeof settings.defaultSeo.ogImage === 'object'
        ? settings.defaultSeo.ogImage.url || undefined
        : undefined

    return {
      siteName: settings?.siteName || DEFAULT_SITE_SETTINGS.siteName,
      siteTitle: settings?.defaultSeo?.title || DEFAULT_SITE_SETTINGS.siteTitle,
      siteDescription:
        settings?.defaultSeo?.description ||
        DEFAULT_SITE_SETTINGS.siteDescription,
      canonicalUrl:
        settings?.canonicalUrl || DEFAULT_SITE_SETTINGS.canonicalUrl,
      openGraphImage: ogImage,
      twitterCard: 'summary_large_image',
      copyPageEnabled: settings?.copyPageEnabled ?? true,
      copyPageLabel: settings?.copyPageLabel || 'Copy page',
    }
  },
  ['site-settings'],
  { tags: ['global_site-settings'] },
)
