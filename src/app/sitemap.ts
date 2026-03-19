import { type MetadataRoute } from 'next'

import { getAllArticles } from '@/lib/articles'
import { isFuturePublicationDate, toValidDate } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const articles = await getAllArticles()
  const publicArticles = articles.filter(
    (article) => !article.noindex && !isFuturePublicationDate(article.date),
  )

  const newestArticleTimestamp = publicArticles.reduce<number | null>(
    (latest, article) => {
      const freshness =
        toValidDate(article.updatedAt) || toValidDate(article.date)
      if (!freshness) return latest
      const time = freshness.getTime()
      return latest === null || time > latest ? time : latest
    },
    null,
  )

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
        newestArticleTimestamp === null
          ? undefined
          : new Date(newestArticleTimestamp),
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
      url: `${siteUrl}/hermes`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]

  const articleRoutes: MetadataRoute.Sitemap = publicArticles.map(
    (article) => ({
      url: `${siteUrl}/articles/${article.slug}`,
      lastModified: toValidDate(article.updatedAt) || toValidDate(article.date),
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
  )

  return [...staticRoutes, ...articleRoutes]
}
