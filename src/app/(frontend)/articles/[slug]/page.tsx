import type { Metadata } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
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
import { publicPathForSlug } from '@/fields/slug/slugPaths'
import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { resolveArticleShareTargetIds } from '@/lib/cms/articlesRepo'
import { EMPTY_CMS_SENTINEL } from '@/lib/cms/emptyCmsSentinel'
import { articleBlocksToMarkdown } from '@/lib/cms/markdown'
import { resolveArticleSocialImage } from '@/lib/cms/pageMetadata'
import { getRedirectForPath } from '@/lib/cms/redirectsRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { canonicalizeArticleUrl } from '@/lib/seo/canonical'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'
import type { CmsAuthor } from '@/lib/cms/types'

// #76 Piece 1: `export const dynamicParams = true` removed — `dynamicParams` is
// unsupported under `cacheComponents` (hard build error). Its behavior (serve
// params not returned by `generateStaticParams` at request time) is the
// cacheComponents default, so removal is behavior-preserving. `notFound()` in
// the page still handles slugs that don't resolve. Piece 2 adds the empty-CMS
// `generateStaticParams` guard + the `<Suspense>`/auth-gated-body split.

type Params = {
  slug: string
}

type PageProps = {
  params: Promise<Params>
}

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

function toAbsoluteImageUrl(siteUrl: string, image?: string) {
  if (!image) return undefined
  return image.startsWith('http') ? image : new URL(image, siteUrl).toString()
}

export async function generateStaticParams() {
  const articles = await getAllArticles()
  // Empty-CMS guard (mirrors /[slug]): Cache Components hard-errors on an empty
  // `generateStaticParams`. One sentinel → `getArticleBySlug` returns null →
  // `notFound()`, so a zero-published-posts CMS degrades to a 404, not a crash.
  if (articles.length === 0) return [{ slug: EMPTY_CMS_SENTINEL }]
  return articles.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const [article, settings] = await Promise.all([
    getArticleBySlug(slug),
    getCmsSiteSettings(),
  ])

  if (!article) {
    return {
      title: 'Article not found',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const canonicalBase = (settings.canonicalUrl || getSiteUrl()).replace(
    /\/+$/,
    '',
  )
  const canonical = canonicalizeArticleUrl(
    canonicalBase,
    article.slug,
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

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params
  // #76 B2: prerender the signed-out published shell. `getArticleBySlug` with a
  // signed-out viewer reads the cached published post (no `auth()` on this
  // path), so the shell, metadata, and the published body (or the gated teaser)
  // prerender static. The per-request member unlock is Suspense-isolated in
  // <AuthGatedArticleBody> below, so only gated articles stream and only their
  // body — the signed-out output is byte-identical to today's.
  const [article, settings] = await Promise.all([
    getArticleBySlug(slug, { isAuthenticated: false }),
    getCmsSiteSettings(),
  ])

  if (!article) {
    // #120: a slug that no longer resolves may be a renamed article. The lookup
    // lives INSIDE this already-dynamic not-found branch on purpose — every
    // slug from `generateStaticParams` resolves and never reaches here, so the
    // route's partial-prerender profile is unchanged.
    //
    // The path comes from `publicPathForSlug`, the same function
    // `createSlugRedirect` used to WRITE the redirect row's `from`. Hand-building
    // `/articles/${slug}` here meant the reader and the writer each owned a copy
    // of the prefix, so moving the route would silently stop matching rows the
    // hook is still writing.
    const from = publicPathForSlug('posts', slug)
    const match = from ? await getRedirectForPath(from) : null
    // #130: the row's permanence decides the API. `permanentRedirect` emits
    // 308 and `redirect` 307; a row with no stored type answers permanent, so
    // every pre-#130 row keeps the behaviour it had.
    if (match?.permanent) permanentRedirect(match.destination)
    if (match) redirect(match.destination)
    notFound()
  }

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
    article.slug,
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
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Articles',
        item: `${canonicalSiteUrl}/articles`,
      },
      {
        '@type': 'ListItem',
        position: 3,
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
