import {
  getAllCmsArticleSummaries,
  getCmsArticleBySlug,
  getCmsSearchArticles,
  type CmsArticleDetailResult,
} from '@/lib/cms/articlesRepo'

interface Article {
  title: string
  description: string
  author:
    | string
    | {
        href?: string
        name?: string
        role?: string
        image?: string
      }
  category?: {
    href?: string
    title?: string
  }
  date: string
  image?: string
  readingTimeMinutes?: number
  canonicalUrl?: string
  keywords?: string[]
  topics?: string[]
  tech?: string[]
  noindex?: boolean
}

export interface ArticleWithSlug extends Article {
  slug: string
  searchText: string
}

export interface ArticleDetailWithSlug extends ArticleWithSlug {
  bodyBlocks: CmsArticleDetailResult['bodyBlocks']
  sourceType: CmsArticleDetailResult['sourceType']
}

export async function getAllArticles(): Promise<ArticleWithSlug[]> {
  const articles = await getAllCmsArticleSummaries()
  return articles.map((article) => ({
    ...article,
    searchText: '',
  }))
}

export async function getArticleBySlug(
  slug: string,
): Promise<ArticleDetailWithSlug | null> {
  const article = await getCmsArticleBySlug(slug)

  if (!article) {
    return null
  }

  return article
}

export async function getSearchArticles(): Promise<ArticleWithSlug[]> {
  const articles = await getCmsSearchArticles()

  return articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    description: article.description,
    author: article.author,
    category: article.category,
    date: article.date,
    image: article.image,
    readingTimeMinutes: article.readingTimeMinutes,
    canonicalUrl: article.canonicalUrl,
    keywords: article.keywords,
    topics: article.topics,
    tech: article.tech,
    noindex: article.noindex,
    searchText: article.searchText,
  }))
}
