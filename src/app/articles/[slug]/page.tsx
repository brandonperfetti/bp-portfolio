import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleLayout } from '@/components/ArticleLayout'
import { ArticleBody } from '@/components/cms/ArticleBody'
import { ArticleMeta } from '@/components/cms/ArticleMeta'
import { SyncErrorState } from '@/components/cms/SyncErrorState'
import { UseWithAiMenu } from '@/components/cms/UseWithAiMenu'
import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { articleBlocksToMarkdown } from '@/lib/cms/markdown'
import { canonicalizeArticleUrl } from '@/lib/seo/canonical'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'

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
  const article = await getArticleBySlug(slug)

  if (!article) {
    return {
      title: 'Article not found',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const siteUrl = getSiteUrl()
  const canonical = canonicalizeArticleUrl(
    siteUrl,
    article.slug,
    article.canonicalUrl,
  )

  const image = toAbsoluteImageUrl(siteUrl, article.image)

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
    robots: article.noindex
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
  const article = await getArticleBySlug(slug)

  if (!article) {
    notFound()
  }

  const bodyBlocks = Array.isArray(article.bodyBlocks) ? article.bodyBlocks : []
  const hasBodyBlocks = bodyBlocks.length > 0
  const siteUrl = getSiteUrl()
  const canonical = canonicalizeArticleUrl(
    siteUrl,
    article.slug,
    article.canonicalUrl,
  )
  const schemaImage = toAbsoluteImageUrl(siteUrl, article.image)
  const authorName =
    typeof article.author === 'string'
      ? article.author.trim() || undefined
      : article.author?.name?.trim() || undefined
  const articleKeywords = getArticleKeywords(article)
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
          },
        ]
      : undefined,
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
        item: `${siteUrl}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Articles',
        item: `${siteUrl}/articles`,
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
          <UseWithAiMenu markdown={articleBlocksToMarkdown(bodyBlocks)} />
        }
        readingTimeMinutes={article.readingTimeMinutes}
        category={article.category?.title}
        topics={article.topics}
        tech={article.tech}
      />
      {hasBodyBlocks ? <ArticleBody blocks={bodyBlocks} /> : <SyncErrorState />}
    </ArticleLayout>
  )
}
