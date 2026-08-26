import { cacheLife, cacheTag } from 'next/cache'

import {
  getAllCmsArticleSummaries,
  getCmsArticleBySlug,
  getCmsSearchArticles,
  type CmsArticleDetailResult,
} from '@/lib/cms/articlesRepo'
import { CMS_TAGS } from '@/lib/cms/cache'
import { isFuturePublicationDate } from '@/lib/date'
import type { OgImageMode } from '@/lib/og/types'

interface Article {
  title: string
  description: string
  seoTitle?: string
  seoDescription?: string
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
  updatedAt?: string
  image?: string
  readingTimeMinutes?: number
  canonicalUrl?: string
  keywords?: string[]
  topics?: string[]
  tech?: string[]
  noindex?: boolean
  /** How this article's social image resolves (auto/bespoke/generated, T7). */
  ogImageMode?: OgImageMode
}

export interface ArticleWithSlug extends Article {
  slug: string
  searchText: string
}

export interface ArticleDetailWithSlug extends ArticleWithSlug {
  /** True when the body was withheld pending sign-in (§12 gating). */
  gated?: boolean
  /** True when the publish date is still in the future (resolved in a
   * `'use cache'` scope; drives `generateMetadata`'s noindex — #76 B3). */
  isScheduledFuture?: boolean
  bodyBlocks: CmsArticleDetailResult['bodyBlocks']
  sourceType: CmsArticleDetailResult['sourceType']
  /** When true, this article offers no share affordance (per-post kill switch). */
  disableSharing?: boolean
  /** Share-target ids layered on top of the global set for this article. */
  shareTargetsAdd?: string[]
  /** Share-target ids subtracted from the global set for this article. */
  shareTargetsRemove?: string[]
}

export async function getAllArticles(): Promise<ArticleWithSlug[]> {
  const articles = await getAllCmsArticleSummaries()
  return articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    description: article.description,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    author: article.author,
    category: article.category,
    date: article.date,
    updatedAt: article.updatedAt,
    image: article.image,
    readingTimeMinutes: article.readingTimeMinutes,
    canonicalUrl: article.canonicalUrl,
    keywords: article.keywords,
    topics: article.topics,
    tech: article.tech,
    noindex: article.noindex,
    searchText: '',
  }))
}

export async function getArticleBySlug(
  slug: string,
  viewer?: { isAuthenticated: boolean },
): Promise<ArticleDetailWithSlug | null> {
  const article = await getCmsArticleBySlug(slug, viewer)

  if (!article) {
    return null
  }

  return article
}

export async function getSearchArticles(): Promise<ArticleWithSlug[]> {
  'use cache'
  // #76 B3: the future-dated publish gate below reads `Date.now()`
  // (isFuturePublicationDate), which `cacheComponents` rejects during prerender.
  // Running the gate inside this `'use cache'` scope freezes `Date.now()` at
  // cache generation and refreshes it on the `cmsContent` cadence — so
  // `/articles` (and `/api/search`) prerender static while scheduled posts still
  // stay hidden until their date, flipping on the same window content refreshes.
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const articles = await getCmsSearchArticles()

  return (
    articles
      // Publish gate: scheduled articles stay hidden until their publish date.
      .filter((article) => !isFuturePublicationDate(article.date))
      // Keep a stable public search payload shape instead of passing through
      // all CMS fields (prevents accidental leakage when repo types evolve).
      .map((article) => ({
        slug: article.slug,
        title: article.title,
        description: article.description,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        author: article.author,
        category: article.category,
        date: article.date,
        updatedAt: article.updatedAt,
        image: article.image,
        readingTimeMinutes: article.readingTimeMinutes,
        canonicalUrl: article.canonicalUrl,
        keywords: article.keywords,
        topics: article.topics,
        tech: article.tech,
        noindex: article.noindex,
        searchText: article.searchText,
      }))
  )
}
