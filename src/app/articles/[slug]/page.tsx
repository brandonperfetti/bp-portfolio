import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { ArticleLayout } from '@/components/ArticleLayout'
import { ArticleBody } from '@/components/cms/ArticleBody'
import { ArticleMeta } from '@/components/cms/ArticleMeta'
import { SyncErrorState } from '@/components/cms/SyncErrorState'
import { UseWithAiMenu } from '@/components/cms/UseWithAiMenu'
import { getArticleBySlug, getAllArticles } from '@/lib/articles'
import { articleBlocksToMarkdown } from '@/lib/cms/markdown'
import { getSiteUrl } from '@/lib/site'

export const dynamicParams = true

type Params = {
  slug: string
}

type PageProps = {
  params: Promise<Params>
}

export async function generateStaticParams() {
  const articles = await getAllArticles()
  return articles.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
  const canonical =
    article.canonicalUrl?.startsWith('http')
      ? article.canonicalUrl
      : `${siteUrl}/articles/${article.slug}`

  const image = article.image
    ? article.image.startsWith('http')
      ? article.image
      : `${siteUrl}${article.image}`
    : undefined

  return {
    title: article.title,
    description: article.description,
    keywords: Array.from(
      new Set([...(article.keywords ?? []), ...(article.topics ?? []), ...(article.tech ?? [])]),
    ),
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
      title: article.title,
      description: article.description,
      publishedTime: article.date,
      url: canonical,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: article.title,
      description: article.description,
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

  return (
    <ArticleLayout article={{ title: article.title, date: article.date, image: article.image }}>
      <ArticleMeta
        author={article.author}
        actions={<UseWithAiMenu markdown={articleBlocksToMarkdown(article.bodyBlocks)} />}
        readingTimeMinutes={article.readingTimeMinutes}
        category={article.category?.title}
        topics={article.topics}
        tech={article.tech}
      />
      {article.bodyBlocks.length ? (
        <ArticleBody blocks={article.bodyBlocks} />
      ) : (
        <SyncErrorState />
      )}
    </ArticleLayout>
  )
}
