import { type Metadata } from 'next'

type ArticleMetadataInput = {
  title: string
  description: string
  image?: string
  date?: string
}

export function createArticleMetadata(article: ArticleMetadataInput): Metadata {
  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: './',
    },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.description,
      publishedTime: article.date,
      images: article.image ? [{ url: article.image }] : undefined,
    },
    twitter: {
      card: article.image ? 'summary_large_image' : 'summary',
      title: article.title,
      description: article.description,
      images: article.image ? [article.image] : undefined,
    },
  }
}
