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

/**
 * Decide whether the root layout's `%s - <siteName>` title template applies to
 * a page's `<title>` (#176).
 *
 * @param seoTitle - The SEO title an editor authored, if any.
 * @param fallbackTitle - The route's own title, used when none was authored.
 * @returns `{ absolute }` for an authored title (template skipped), or the
 *   fallback as a plain string (template applies).
 *
 * @remarks The root layout (`src/app/(frontend)/layout.tsx`) sets
 * `title.template = "%s - ${siteName}"`, so any plain string gets the site name
 * appended. Editors write SEO titles that already carry the brand
 * ("Tech Stack — Brandon Perfetti | Frontend & Full-Stack Engineer"), which
 * shipped it twice — and search engines truncate around 60 characters, so the
 * duplicate ate exactly the differentiator the editor wrote. An AUTHORED title
 * is therefore final: `title.absolute` opts out of the template, matching what
 * the articles route already does (`ArticleView.tsx`, "keep article SEO title
 * exact"). The FALLBACK is a bare route or document name ("Home", "Lab Parent")
 * and still wants the suffix, so it stays a plain string.
 *
 * This lives here rather than inline because two callers must agree:
 * {@link buildPageMetadata} for the dedicated routes, and the `[...segments]`
 * catch-all, which composes its own metadata and does NOT go through that
 * builder. The first pass at #176 fixed only the former, so every CMS-composed
 * page (the #137 `/work/<slug>` set, and any future section page) kept
 * doubling. One helper is what stops the two from drifting again.
 *
 * Never apply this to `openGraph.title` / `twitter.title`: Next does not run
 * the template over those, so they always take the exact string.
 */
export function resolvePageMetadataTitle(
  seoTitle: string | null | undefined,
  fallbackTitle: string,
): Metadata['title'] {
  return seoTitle ? { absolute: seoTitle } : fallbackTitle
}

/**
 * Compose the full `Metadata` for a **dedicated** route whose content comes from
 * a Pages document — `/`, `/about`, `/articles`, `/tech`, `/projects`,
 * `/corvus`, `/uses`.
 *
 * @param page - The route's Pages document, or `null` when none is published;
 *   every field it contributes has a fallback, so a missing document degrades
 *   to the route's own strings rather than to empty metadata.
 * @param settings - SiteSettings, for the canonical host, site name and the
 *   default OG image / Twitter card.
 * @param fallbackTitle - The route's own title, used when no `seoTitle` is
 *   authored. Kept a plain string so the layout template still appends the site
 *   name — see {@link resolvePageMetadataTitle}.
 * @param fallbackDescription - The route's own description, used when no
 *   `seoDescription` is authored.
 * @param path - The route's public path, which becomes the canonical URL. `'/'`
 *   is special-cased so the result is `https://host`, never `https://host/`.
 *
 * @remarks **Why one composer and not per-route metadata.** Seven routes need
 * the same six decisions — canonical, title-vs-template, description,
 * social image, `summary_large_image` vs the settings default, and the
 * openGraph/twitter titles that must NOT take the template. Spread across seven
 * `generateMetadata` functions those drifted: #176 is exactly that failure, where
 * the brand suffix doubled on the routes that had not been updated.
 *
 * **What it deliberately does not own.** The `[...segments]` catch-all composes
 * its own metadata and does not call this — a CMS page there has no route-owned
 * fallback title or path to hand in. What the two share instead is
 * {@link resolvePageMetadataTitle}, extracted for precisely that reason (#176):
 * the title rule is the half both must agree on, so it lives in one function
 * rather than being restated on either side. Change the title rule there, not
 * here.
 *
 * The `openGraph.title` / `twitter.title` below stay the plain `title` string
 * while `title` itself goes through the resolver: Next never runs the layout's
 * `%s` template over the social titles, so they always take the exact string,
 * and routing them through the resolver would wrap them in an `{ absolute }`
 * object the OG serialiser does not accept.
 */
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

  // #176: an authored seoTitle is final; the fallback keeps the layout's
  // "%s - <siteName>" template. See {@link resolvePageMetadataTitle}. `title` below
  // stays the plain string for openGraph/twitter, which never take the
  // template.
  const authoredTitle = page?.seoTitle || undefined
  const title = authoredTitle || fallbackTitle
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
    title: resolvePageMetadataTitle(authoredTitle, fallbackTitle),
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
