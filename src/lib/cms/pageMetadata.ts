import type { Metadata } from 'next'

import { publicPathFor } from '@/fields/slug/slugPaths'
import type { CmsPageContent, CmsSiteSettings } from '@/lib/cms/types'
import { shouldUseGeneratedOg } from '@/lib/og/resolveOgImage'
import type { OgImageMode } from '@/lib/og/types'
import { DEFAULT_SOCIAL_IMAGE, getSiteUrl } from '@/lib/site'

function toAbsoluteUrl(url: string | undefined, siteUrl: string) {
  if (!url) {
    return undefined
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  return `${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

/** Absolute base for generated-OG URLs, with any trailing slash removed so the
 * result is never `https://host//api/og/...`. */
function normalizeBase(siteUrl: string) {
  return siteUrl.replace(/\/+$/, '')
}

/**
 * Social/OG image for a page-builder page. When the page resolves to a generated
 * card (T7 — see {@link shouldUseGeneratedOg}) this returns the
 * `/api/og/page/[...segments]` URL; otherwise it's the page's own OG/hero image,
 * then the site default, then the hardcoded last resort.
 *
 * @remarks The card URL is keyed by the page's **path**, taken from
 * `publicPathFor` — under per-parent slug uniqueness a bare slug is ambiguous
 * (`/work/about` and `/tech/about` are different pages with the same slug), so a
 * slug-keyed card would be served the wrong page's title (#148). The root page
 * maps to `/`, which carries no segment, so it addresses its card by the root
 * slug — the one case where the path and the route parameter differ.
 */
export function resolvePageSocialImage(
  page: CmsPageContent | null,
  settings: CmsSiteSettings,
) {
  const siteUrl = settings.canonicalUrl || getSiteUrl()
  const ownImage =
    toAbsoluteUrl(page?.ogImage, siteUrl) ??
    toAbsoluteUrl(page?.heroImage, siteUrl)

  if (
    page &&
    shouldUseGeneratedOg({
      mode: page.ogImageMode,
      generatedOgEnabled: settings.generatedOgEnabled,
      hasOwnImage: Boolean(ownImage),
    })
  ) {
    const publicPath = publicPathFor('pages', page)
    const cardKey =
      publicPath && publicPath !== '/' ? publicPath : `/${page.slug}`
    return `${normalizeBase(siteUrl)}/api/og/page${cardKey}`
  }

  return (
    ownImage ??
    toAbsoluteUrl(settings.openGraphImage, siteUrl) ??
    toAbsoluteUrl(DEFAULT_SOCIAL_IMAGE, siteUrl)
  )
}

/**
 * Social/OG image for an article. When the article resolves to a generated card
 * (T7) this returns the passed generated-card URL; otherwise its own cover, then
 * the site-default OG image, then the hardcoded last resort — so a cover-less
 * article still shares a branded card instead of no image at all. Mirrors
 * {@link resolvePageSocialImage} for the article route.
 */
export function resolveArticleSocialImage({
  articleImage,
  mode,
  generatedOgEnabled,
  generatedImageUrl,
  openGraphImage,
  siteUrl,
}: {
  articleImage: string | undefined
  mode: OgImageMode | undefined
  generatedOgEnabled: boolean
  generatedImageUrl: string
  openGraphImage: string | undefined
  siteUrl: string
}) {
  const ownImage = toAbsoluteUrl(articleImage, siteUrl)

  if (
    shouldUseGeneratedOg({
      mode,
      generatedOgEnabled,
      hasOwnImage: Boolean(ownImage),
    })
  ) {
    return generatedImageUrl
  }

  return (
    ownImage ??
    toAbsoluteUrl(openGraphImage, siteUrl) ??
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
  const usesGeneratedCard = Boolean(
    page &&
    shouldUseGeneratedOg({
      mode: page.ogImageMode,
      generatedOgEnabled: settings.generatedOgEnabled,
      hasOwnImage: Boolean(page.ogImage?.trim() || page.heroImage?.trim()),
    }),
  )
  // A generated 1200×630 card is a large image, so it earns the large Twitter
  // card just like an explicit cover / site-default OG image does.
  const hasExplicitSocialImage =
    usesGeneratedCard ||
    Boolean(
      page?.ogImage?.trim() ||
      page?.heroImage?.trim() ||
      settings.openGraphImage?.trim(),
    )

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
      card: hasExplicitSocialImage
        ? 'summary_large_image'
        : (settings.twitterCard ?? 'summary_large_image'),
      title,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
  }
}
