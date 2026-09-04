import type { Metadata } from 'next'
import { Suspense } from 'react'

import { ArticleLayout } from '@/components/ArticleLayout'
import { ArticleMeta } from '@/components/cms/ArticleMeta'
import { CmsPostBlocks } from '@/components/cms/CmsPostBlocks'
import {
  ArticleBodyRegion,
  AuthGatedArticleBody,
} from '@/components/cms/GatedArticleBody'
import { CopyPageButton } from '@/components/cms/CopyPageButton'
import { ArticleCopyMarkdownProvider } from '@/components/cms/ArticleCopyMarkdown'
import { ShareButton } from '@/components/cms/ShareButton'
import { publicPathFor } from '@/fields/slug/slugPaths'
import type { ArticleDetailWithSlug } from '@/lib/articles'
import { resolveArticleShareTargetIds } from '@/lib/cms/articlesRepo'
import { articleBlocksToMarkdown } from '@/lib/cms/markdown'
import { resolveArticleSocialImage } from '@/lib/cms/pageMetadata'
import { getAncestorPages } from '@/lib/cms/pagesRepo'

import type { CmsSiteSettings } from '@/lib/cms/types'
import { canonicalizeArticleUrl } from '@/lib/seo/canonical'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'
import type { CmsAuthor } from '@/lib/cms/types'

/**
 * One article's rendered page and its metadata, independent of the URL that
 * reached it.
 *
 * @remarks Extracted from `/articles/[slug]/page.tsx` by #153, because a placed
 * article is reached by **two** routes: `/articles/[slug]`, which now redirects
 * it, and the `[...segments]` catch-all, which serves it at its placed path.
 * Both must render byte-identical output — same JSON-LD, same gating, same
 * share targets — so the render lives here once and each route contributes only
 * its own resolution and redirect logic. Duplicating this into the catch-all
 * would have made the two URLs' output free to drift, and the drift would have
 * been invisible until a reader noticed one of them missing a schema block.
 *
 * It deliberately holds NO redirect: the `publicPathFor(post) !== requested`
 * check belongs to the route that can be reached at the wrong URL, and putting
 * it here would make the catch-all redirect a placed article to its own path
 * forever.
 */

/**
 * The de-duplicated keyword set an article advertises: its explicit keywords,
 * its topics and its tech, in that order.
 *
 * @remarks Private to this module and shared by the metadata builder and the
 * `Article` JSON-LD, so the two can never advertise different keywords for one
 * document.
 */
function getArticleKeywords(article: {
  keywords?: string[]
  topics?: string[]
  tech?: string[]
}) {
  return Array.from(
    new Set([
      ...(article.keywords ?? []),
      ...(article.topics ?? []),
      ...(article.tech ?? []),
    ]),
  )
}

/**
 * Resolve a possibly-relative image reference against the canonical origin.
 *
 * @remarks Private. JSON-LD and the publisher logo both need absolute URLs,
 * while the CMS stores some of them site-relative.
 */
function toAbsoluteImageUrl(siteUrl: string, image?: string) {
  if (!image) return undefined
  return image.startsWith('http') ? image : new URL(image, siteUrl).toString()
}

/**
 * The ancestor pages of a placed article, for its breadcrumb trail (#153).
 *
 * @param article - The resolved article.
 * @returns The ancestor chain, or `[]` for an unplaced article — which is what
 *   makes {@link ArticleView} fall back to the archive trail it has always
 *   emitted (Home → Articles → title).
 */
export async function articleAncestors(
  article: ArticleDetailWithSlug,
): Promise<Array<{ path: string; title: string }>> {
  return article.path ? getAncestorPages(article.path) : []
}

/**
 * Next `Metadata` for one article — title, description, canonical, robots, and
 * the OG/Twitter cards.
 *
 * @param article - The resolved article, placed or not.
 * @param settings - Site settings, for the canonical origin, the site name and
 *   the generated-OG toggle.
 * @returns The route's `Metadata`.
 *
 * @remarks Built from the DOCUMENT rather than the request, so both routes that
 * can reach an article describe it identically: the canonical is
 * `publicPathFor`'s answer, which for a placed article is its section URL and
 * never the `/articles/<slug>` that 308s to it (#153). Keeping this a plain
 * function rather than a `generateMetadata` lets the catch-all reuse it as-is.
 */
export function buildArticleMetadata(
  article: ArticleDetailWithSlug,
  settings: CmsSiteSettings,
): Metadata {
  const canonicalBase = (settings.canonicalUrl || getSiteUrl()).replace(
    /\/+$/,
    '',
  )
  const canonical = canonicalizeArticleUrl(
    canonicalBase,
    article,
    article.canonicalUrl,
  )

  // Cover, else a generated card (T7), else the site-default OG image, else the
  // last-resort — a cover-less article still shares a branded card rather than
  // no image (T6). Generation is gated by the article's ogImageMode + the global
  // toggle (see resolveArticleSocialImage / shouldUseGeneratedOg).
  const image = resolveArticleSocialImage({
    articleImage: article.image,
    mode: article.ogImageMode,
    generatedOgEnabled: settings.generatedOgEnabled,
    generatedImageUrl: `${canonicalBase}/api/og/article/${article.slug}`,
    openGraphImage: settings.openGraphImage,
    siteUrl: canonicalBase,
  })
  // #76 B3: the future-dated noindex gate reads the `isScheduledFuture` flag the
  // repo resolved inside a `'use cache'` scope — no `Date.now()` at the metadata
  // layer, so `/articles/[slug]` metadata prerenders and the route reaches ◐ partial.
  const shouldNoindex = article.noindex || (article.isScheduledFuture ?? false)

  const effectiveTitle = article.seoTitle || article.title
  const effectiveDescription = article.seoDescription || article.description

  return {
    title: {
      // Keep article SEO title exact and avoid inheriting the global
      // "%s - SiteName" layout template, which can push titles over limits.
      absolute: effectiveTitle,
    },
    description: effectiveDescription,
    keywords: getArticleKeywords(article),
    alternates: {
      canonical,
    },
    robots: shouldNoindex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
    openGraph: {
      type: 'article',
      title: effectiveTitle,
      description: effectiveDescription,
      publishedTime: article.date,
      url: canonical,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: effectiveTitle,
      description: effectiveDescription,
      images: image ? [image] : undefined,
    },
  }
}

/**
 * The article page's body: layout, JSON-LD, the actions row, and the
 * gated-or-published body region.
 *
 * @param article - The resolved article, already gated for a signed-out viewer.
 * @param settings - Site settings, for the canonical origin, share targets and
 *   the copy-page toggle.
 * @param ancestors - The placed article's ancestor pages, for the breadcrumb
 *   trail; `[]` for an unplaced article, which keeps the archive trail.
 * @returns The rendered article.
 *
 * @remarks Synchronous on purpose (see the module note): an async component
 * cannot be composed into a route's return value and rendered by anything but
 * the RSC runtime, which is why the one await it needs — the ancestor read —
 * is hoisted into {@link articleAncestors} and passed in.
 */
export function ArticleView({
  article,
  settings,
  ancestors = [],
}: {
  article: ArticleDetailWithSlug
  settings: CmsSiteSettings
  /**
   * The placed article's ancestor pages, for the `BreadcrumbList` (#153).
   * Resolved by the route (see {@link articleAncestors}) rather than here so
   * this component stays synchronous — an async component cannot be composed
   * into a route's return value and rendered by anything but the RSC runtime,
   * which would have made both routes untestable at once.
   */
  ancestors?: Array<{ path: string; title: string }>
}) {
  const slug = article.slug
  // `bodyBlocks` here is the signed-out body — feeds the copy-to-markdown action
  // (a gated article's copy reflects the teaser, matching today's signed-out
  // behavior; the visible body still unlocks for members via the Suspense child).
  const bodyBlocks = Array.isArray(article.bodyBlocks) ? article.bodyBlocks : []
  const siteUrl = getSiteUrl()
  const canonicalSiteUrl = (settings.canonicalUrl || siteUrl).replace(
    /\/+$/,
    '',
  )
  const canonical = canonicalizeArticleUrl(
    canonicalSiteUrl,
    article,
    article.canonicalUrl,
  )
  const schemaImage = resolveArticleSocialImage({
    articleImage: article.image,
    mode: article.ogImageMode,
    generatedOgEnabled: settings.generatedOgEnabled,
    generatedImageUrl: `${canonicalSiteUrl}/api/og/article/${article.slug}`,
    openGraphImage: settings.openGraphImage,
    siteUrl: canonicalSiteUrl,
  })
  const publisherLogo = toAbsoluteImageUrl(
    canonicalSiteUrl,
    settings.openGraphImage || '/favicon.ico',
  )
  // The declared author type omits `sameAs` (defined only on CmsAuthor in the
  // CMS layer); the runtime object carries it, so narrow via CmsAuthor here.
  const authorObject =
    typeof article.author === 'object' && article.author
      ? (article.author as unknown as CmsAuthor)
      : undefined
  const authorName =
    typeof article.author === 'string'
      ? article.author.trim() || undefined
      : authorObject?.name?.trim() || undefined
  const authorSameAs = Array.from(
    new Set(
      (authorObject?.sameAs ?? []).map((url) => url.trim()).filter(Boolean),
    ),
  )
  const authorUrl = authorObject?.href
    ? toAbsoluteImageUrl(canonicalSiteUrl, authorObject.href)
    : undefined
  const articleKeywords = getArticleKeywords(article)
  // Article actions row. Copy follows the global toggle; Share is offered only
  // when the resolved (global ± per-article) target set is non-empty — the
  // per-post `disableSharing` kill switch collapses it to []. `shareTargetIds`
  // is a plain string[] resolved here (server), the sole client boundary being
  // `ShareButton`, which receives only serializable props.
  const effectiveTitle = article.seoTitle || article.title
  const shareTargetIds = resolveArticleShareTargetIds(
    article,
    settings.shareTargets,
  )
  const showCopy = settings.copyPageEnabled
  const showShare = shareTargetIds.length > 0
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.seoDescription || article.description,
    datePublished: article.date,
    dateModified: article.updatedAt || article.date,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    author: authorName
      ? [
          {
            '@type': 'Person',
            name: authorName,
            ...(authorUrl ? { url: authorUrl } : {}),
            ...(authorSameAs.length > 0 ? { sameAs: authorSameAs } : {}),
          },
        ]
      : undefined,
    publisher: {
      '@type': 'Organization',
      name: settings.siteName,
      logo: publisherLogo
        ? {
            '@type': 'ImageObject',
            url: publisherLogo,
          }
        : undefined,
    },
    image: schemaImage ? [schemaImage] : undefined,
    keywords: articleKeywords,
  }
  // Breadcrumb JSON-LD. An unplaced article keeps the archive chain it has
  // always emitted (Home → Articles → title). A placed one (#153) emits its
  // REAL ancestor chain instead — Home → Work → Brytecore → title — because a
  // crumb trail that says "Articles" for a URL under `/work` describes a
  // navigation path the site does not have. The ancestors come from the stored
  // `path` in one indexed read, never stored twice.
  const trail = article.path
    ? ancestors.map((ancestor) => ({
        name: ancestor.title,
        item: `${canonicalSiteUrl}${publicPathFor('pages', { path: ancestor.path })}`,
      }))
    : [{ name: 'Articles', item: `${canonicalSiteUrl}/articles` }]
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${canonicalSiteUrl}`,
      },
      ...trail.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: crumb.name,
        item: crumb.item,
      })),
      {
        '@type': 'ListItem',
        position: trail.length + 2,
        name: article.title,
        item: canonical,
      },
    ],
  }

  const articleActions =
    showCopy || showShare ? (
      <div className="flex items-center gap-2">
        {showCopy ? (
          <CopyPageButton
            markdown={articleBlocksToMarkdown(bodyBlocks)}
            label={settings.copyPageLabel}
          />
        ) : null}
        {showShare ? (
          <ShareButton
            url={canonical}
            title={effectiveTitle}
            targetIds={shareTargetIds}
          />
        ) : null}
      </div>
    ) : undefined

  const articleMeta = (
    <ArticleMeta
      author={article.author}
      actions={articleActions}
      readingTimeMinutes={article.readingTimeMinutes}
      category={article.category?.title}
      topics={article.topics}
      tech={article.tech}
    />
  )

  return (
    <>
      <ArticleLayout
        article={{
          title: article.title,
          date: article.date,
          image: article.image,
        }}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toSafeJsonLd(articleSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toSafeJsonLd(breadcrumbSchema) }}
        />
        {/* #106: a gated article wraps its actions row + body in the copy-markdown
            provider so the member-unlocked Markdown streamed by
            <AuthGatedArticleBody> can reach the copy button in the prerendered
            shell. auth() stays inside the <Suspense> child, so /articles/[slug]
            still partial-prerenders (no auth() pulled up to the page level). */}
        {article.gated ? (
          <ArticleCopyMarkdownProvider>
            {articleMeta}
            <Suspense fallback={<ArticleBodyRegion article={article} />}>
              <AuthGatedArticleBody slug={slug} fallback={article} />
            </Suspense>
          </ArticleCopyMarkdownProvider>
        ) : (
          <>
            {articleMeta}
            <ArticleBodyRegion article={article} />
          </>
        )}
      </ArticleLayout>
      <CmsPostBlocks slug={article.slug} />
    </>
  )
}
