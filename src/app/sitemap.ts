import { cacheLife, cacheTag } from 'next/cache'
import { type MetadataRoute } from 'next'

import { getAllArticles } from '@/lib/articles'
import { CMS_TAGS } from '@/lib/cms/cache'
import { getPublishedPageSlugs } from '@/lib/cms/pagesRepo'
import { isFuturePublicationDate, toValidDate } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

/**
 * Sitemap data prepared inside a `'use cache'` scope (#76 B3, restores the
 * caching Piece 1 removed with `revalidate = 3600`).
 *
 * @remarks The future-dated publish gate reads `Date.now()`
 * (`isFuturePublicationDate`), which `cacheComponents` rejects during prerender;
 * running it here freezes `Date.now()` at cache generation and refreshes it on
 * the `cmsContent` cadence, so `/sitemap.xml` prerenders static and stays fresh
 * via the `posts`/`pages` cache tags. Returns only serializable primitives
 * (slugs + epoch-ms) — the `Date` objects the sitemap shape needs are rebuilt
 * from those fixed timestamps in {@link sitemap} (never `Date.now()`), which is
 * prerender-safe.
 */
async function getSitemapData(): Promise<{
  articles: Array<{ slug: string; lastModifiedMs: number | null }>
  newestArticleMs: number | null
  pageSlugs: string[]
}> {
  'use cache'
  cacheTag(CMS_TAGS.articles, CMS_TAGS.pages)
  cacheLife('cmsContent')

  const [allArticles, pageSlugs] = await Promise.all([
    getAllArticles(),
    getPublishedPageSlugs(),
  ])

  const publicArticles = allArticles.filter(
    (article) => !article.noindex && !isFuturePublicationDate(article.date),
  )

  const articles = publicArticles.map((article) => {
    const freshness =
      toValidDate(article.updatedAt) || toValidDate(article.date)
    return { slug: article.slug, lastModifiedMs: freshness?.getTime() ?? null }
  })

  const newestArticleMs = articles.reduce<number | null>((latest, article) => {
    if (article.lastModifiedMs === null) return latest
    return latest === null || article.lastModifiedMs > latest
      ? article.lastModifiedMs
      : latest
  }, null)

  return { articles, newestArticleMs, pageSlugs }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const { articles, newestArticleMs, pageSlugs } = await getSitemapData()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${siteUrl}/about`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/articles`,
      lastModified:
        newestArticleMs === null ? undefined : new Date(newestArticleMs),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/projects`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/tech`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/uses`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/corvus`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]

  const articleRoutes: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${siteUrl}/articles/${article.slug}`,
    lastModified:
      article.lastModifiedMs === null
        ? undefined
        : new Date(article.lastModifiedMs),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // Published page-builder pages served by the [slug] catch-all (M5 —
  // these were previously missing from the sitemap entirely).
  const pageRoutes: MetadataRoute.Sitemap = pageSlugs.map((slug) => ({
    url: `${siteUrl}/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }))

  return [...staticRoutes, ...articleRoutes, ...pageRoutes]
}
