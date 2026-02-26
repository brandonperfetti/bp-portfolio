import type { Metadata } from 'next'

import { DEFAULT_SOCIAL_IMAGE, getSiteUrl } from '@/lib/site'
import type { CmsPageContent, CmsSiteSettings } from '@/lib/cms/types'

function toAbsoluteUrl(url: string | undefined, siteUrl: string) {
  if (!url) {
    return undefined
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  return `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

export function resolvePageSocialImage(page: CmsPageContent | null, settings: CmsSiteSettings) {
  const siteUrl = settings.canonicalUrl || getSiteUrl()
  return (
    toAbsoluteUrl(page?.ogImage, siteUrl) ??
    toAbsoluteUrl(page?.heroImage, siteUrl) ??
    toAbsoluteUrl(settings.openGraphImage, siteUrl) ??
    toAbsoluteUrl(DEFAULT_SOCIAL_IMAGE, siteUrl)
  )
}

export function buildPageMetadata({
  page,
  settings,
  fallbackTitle,
  fallbackDescription,
  path,
}: {
  page: CmsPageContent | null
  settings: CmsSiteSettings
  fallbackTitle: string
  fallbackDescription: string
  path: string
}): Metadata {
  const siteUrl = settings.canonicalUrl || getSiteUrl()
  const canonicalPath = path === '/' ? '' : path
  const canonical = `${siteUrl}${canonicalPath}`

  const title = page?.seoTitle || fallbackTitle
  const description = page?.seoDescription || fallbackDescription
  const socialImage = resolvePageSocialImage(page, settings)

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: settings.siteName,
      title,
      description,
      images: socialImage ? [{ url: socialImage }] : undefined,
    },
    twitter: {
      card: socialImage ? 'summary_large_image' : settings.twitterCard ?? 'summary_large_image',
      title,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
  }
}
