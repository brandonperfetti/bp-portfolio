import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleLayout } from '@/components/ArticleLayout'
import { ArticleBody } from '@/components/cms/ArticleBody'
import { ArticleMeta } from '@/components/cms/ArticleMeta'
import { CmsPostBlocks } from '@/components/cms/CmsPostBlocks'
import { SyncErrorState } from '@/components/cms/SyncErrorState'
import { CopyPageButton } from '@/components/cms/CopyPageButton'
import { ShareButton } from '@/components/cms/ShareButton'
import { getViewer } from '@/lib/auth/getViewer'
import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { resolveArticleShareTargetIds } from '@/lib/cms/articlesRepo'
import { articleBlocksToMarkdown } from '@/lib/cms/markdown'
import { resolveArticleSocialImage } from '@/lib/cms/pageMetadata'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { isFuturePublicationDate } from '@/lib/date'
import { canonicalizeArticleUrl } from '@/lib/seo/canonical'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'
import type { CmsAuthor } from '@/lib/cms/types'

export const dynamicParams = true

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
  const shouldNoindex = article.noindex || isFuturePublicationDate(article.date)

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
  const [article, settings] = await Promise.all([
    getArticleBySlug(slug, await getViewer()),
    getCmsSiteSettings(),
  ])

  if (!article) {
    notFound()
  }

  const bodyBlocks = Array.isArray(article.bodyBlocks) ? article.bodyBlocks : []
  const hasBodyBlocks = bodyBlocks.length > 0
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
        <ArticleMeta
          author={article.author}
          actions={
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
          }
          readingTimeMinutes={article.readingTimeMinutes}
          category={article.category?.title}
          topics={article.topics}
          tech={article.tech}
        />
        {article.gated ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 p-6 text-center dark:border-zinc-700/60">
            <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">
              This article is for members.
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Sign in (it&apos;s free) to read the full piece.
            </p>
            <a
              href={`/sign-in?redirect_url=/articles/${article.slug}`}
              className="mt-4 inline-flex items-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            >
              Sign in to continue
            </a>
          </div>
        ) : hasBodyBlocks ? (
          <ArticleBody blocks={bodyBlocks} />
        ) : (
          <SyncErrorState />
        )}
      </ArticleLayout>
      <CmsPostBlocks slug={article.slug} />
    </>
  )
}
