import { type MetadataRoute } from 'next'
import { connection } from 'next/server'

import { getAllArticles } from '@/lib/articles'
import { publicPathFor } from '@/fields/slug/slugPaths'
import { getPublishedPagePaths } from '@/lib/cms/pagesRepo'
import { isFuturePublicationDate, toValidDate } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

/**
 * The `/sitemap.xml` route: the static routes, every public article, and every
 * published page-builder page, assembled per request.
 *
 * @remarks **Request-time, with no route-level cache (#209, fallback (b)).**
 * The function first awaits `connection()` from `next/server`, the Next 16.3
 * call for output that "should wait for a real user request"
 * (`[source, next 16.3.4 docs, connection.md]`: "prerendering stops here").
 * So the build does not prerender this route, and no cached route response
 * is left for a purge to miss. Every request runs this function. The build is
 * expected to report the route as dynamic (`ƒ`): #209 measured `ƒ` locally for
 * an uncached assembly, but that is `[inference]` for this exact change, which
 * no `next build` has measured. Nothing in this file is a `'use cache'` scope,
 * and the assembly is not cached anywhere.
 *
 * Why the cache went: `[inference, #209]` the route's cached response was the
 * stale layer.
 * `[measured, staging 2026-09-27 and prod 2026-09-28, #209 comments]` after a
 * publish, `/sitemap.xml` kept serving an edge `HIT` whose `age` counted back
 * to the first read after the deploy. That happened whether the write came
 * from the admin UI or the MCP, the hooks logged their revalidation, and
 * runtime logs showed no `/sitemap.xml` function invocation, so the old
 * `'use cache: remote'` assembly beneath it was never reached. Only a
 * redeploy cleared it.
 *
 * **What stays cached is the two inner reads.** `getAllArticles` reads
 * `getPublishedPostSummaries` (`src/lib/content/posts.ts`) and
 * `getPublishedPagePaths` (`src/lib/cms/pagesRepo.ts`). Both are
 * `'use cache: remote'` scopes, tagged `posts` and `pages` on
 * `cacheLife('cmsContent')`, so a request does not query the database while
 * their entries are fresh. The Pages and Posts revalidation hooks purge those
 * tags on publish, unpublish and delete, with `expire: 0`. `[inference]` the
 * next request after a purge reads fresh data, because no layer above those
 * reads holds a copy. Whether the edge still caches the dynamic response is
 * what #209's production check verifies: a post-publish read has to reach the
 * function (a `MISS`, or a function log line). The hooks also call
 * `revalidatePath('/sitemap.xml')`. With no cached route entry left to expire,
 * `[inference]` that call no longer changes what this route serves.
 *
 * **The publish gate runs per request.** Because `connection()` resolves
 * first, `isFuturePublicationDate` reads `Date.now()` at request time, which
 * `cacheComponents` allows outside a prerender. A future-dated article joins
 * the sitemap on the first request at or after its date. It does not wait for
 * a purge or for the `cmsContent` cadence: the cached summaries carry the
 * article, and the gate filters it here. `noindex` articles never appear.
 *
 * `lastModified` comes from content (`updatedAt`, else the publication date),
 * never from the request time, so a crawler sees real freshness and not
 * "changed on every fetch".
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Before any read: everything below runs at request time only.
  await connection()

  const siteUrl = getSiteUrl()
  const [allArticles, pagePaths] = await Promise.all([
    getAllArticles(),
    getPublishedPagePaths(),
  ])

  const articles = allArticles
    .filter(
      (article) => !article.noindex && !isFuturePublicationDate(article.date),
    )
    .map((article) => ({
      slug: article.slug,
      // Kept on the projection because the URL is built from it below:
      // without `path`, a placed article would be listed at `/articles/<slug>`,
      // a URL that 308s (#153).
      path: article.path,
      lastModified: toValidDate(article.updatedAt) || toValidDate(article.date),
    }))

  const newestArticle = articles.reduce<Date | undefined>(
    (latest, article) =>
      article.lastModified &&
      (!latest || article.lastModified.getTime() > latest.getTime())
        ? article.lastModified
        : latest,
    undefined,
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
      lastModified: newestArticle,
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
    url: `${siteUrl}${publicPathFor('posts', article)}`,
    lastModified: article.lastModified,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // Published page-builder pages served by the [...segments] catch-all (M5 —
  // these were previously missing from the sitemap entirely). URLs come from
  // `publicPathFor`, so a placed page lists its real nested URL rather than a
  // `/`+slug guess that would 404 (#148).
  const pageRoutes: MetadataRoute.Sitemap = pagePaths.map((path) => ({
    url: `${siteUrl}${publicPathFor('pages', { path })}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }))

  return [...staticRoutes, ...articleRoutes, ...pageRoutes]
}
