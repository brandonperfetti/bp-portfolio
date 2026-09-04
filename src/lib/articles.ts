import { cacheLife, cacheTag } from 'next/cache'

import {
  getAllCmsArticleSummaries,
  getCmsArticleByPath,
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
  /** The placed article's stored path (#153); absent for `/articles/<slug>`. */
  path?: string
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
    // The placed path travels with the projection (#153) — this explicit
    // allowlist is what would otherwise silently drop it and send every
    // article-card href back to `/articles/<slug>`.
    path: article.path,
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

/**
 * One **placed** article by its stored path (#153) — the `[...segments]`
 * catch-all's reader, gated identically to {@link getArticleBySlug}.
 */
export async function getArticleByPath(
  path: string,
  viewer?: { isAuthenticated: boolean },
): Promise<ArticleDetailWithSlug | null> {
  return (await getCmsArticleByPath(path, viewer)) ?? null
}

/**
 * The search index: every published article plus its flattened body text.
 *
 * @remarks Deliberately stays on plain `'use cache'` (per-process, in-memory)
 * while the small CMS reads moved to `'use cache: remote'` for #118. It wraps
 * the full-body `getPublishedPosts` read, and its own payload measures
 * 1,742,179 bytes over the 52-post corpus — inside Vercel's 2 MB Runtime Cache
 * item ceiling today, but with under 15% headroom and growing one article at a
 * time, so `:remote` would start silently rejecting writes mid-corpus. The
 * consequence is the in-memory tier's known defect: a `posts` purge reaches
 * only the instance that issued it, so search results converge on the
 * `cmsContent` cadence rather than on the edit. Shrinking this read is what
 * would let it join the remote tier (see `lib/content/posts.ts`).
 */
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
        path: article.path,
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
