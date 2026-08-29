import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { CmsSiteSettings } from '@/lib/cms/types'
import { SHARE_TARGET_IDS } from '@/lib/share/vocabulary'
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
  shareTargets: [...SHARE_TARGET_IDS],
  generatedOgEnabled: false,
}

/**
 * Site settings from the Payload `site-settings` global (was Notion in v3),
 * cached under `global_site-settings` and revalidated by its afterChange hook.
 *
 * @remarks Falls back to hard defaults so the site renders with an empty CMS
 * (the Phase 0 "boots with only a database" invariant).
 *
 * `'use cache: remote'` so a `global_site-settings` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 */
export const getCmsSiteSettings = async (): Promise<CmsSiteSettings> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.settings)
  cacheLife('cmsContent')
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
    canonicalUrl: settings?.canonicalUrl || DEFAULT_SITE_SETTINGS.canonicalUrl,
    openGraphImage: ogImage,
    twitterCard: 'summary_large_image',
    copyPageEnabled: settings?.copyPageEnabled ?? true,
    copyPageLabel: settings?.copyPageLabel || 'Copy page',
    // Empty === unset === all ids: there is no "disable Share globally"
    // concept (the per-post `disableSharing` kill switch is the only opt-out),
    // and a pre-existing global row can carry a nullable/empty column that
    // never got the admin defaultValue. So an empty array falls back to the
    // full pinned vocabulary — Share ships live on every article (copy-link
    // floor) rather than being hidden site-wide.
    shareTargets: settings?.shareTargets?.length
      ? settings.shareTargets
      : [...SHARE_TARGET_IDS],
    // Master switch for T7 generated OG cards; defaults off so nothing changes
    // until it's explicitly enabled in the admin.
    generatedOgEnabled: settings?.generatedOgEnabled ?? false,
  }
}
