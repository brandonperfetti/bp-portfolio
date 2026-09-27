import { cacheLife, cacheTag } from 'next/cache'
import { type MetadataRoute } from 'next'

import { getAllArticles } from '@/lib/articles'
import { CMS_TAGS } from '@/lib/cms/cache'
import { publicPathFor } from '@/fields/slug/slugPaths'
import { getPublishedPagePaths } from '@/lib/cms/pagesRepo'
import { isFuturePublicationDate, toValidDate } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

/**
 * Sitemap data prepared inside a `'use cache: remote'` scope (#76 B3 restored
 * the caching Piece 1 removed with `revalidate = 3600`; #209 moved it to the
 * shared tier).
 *
 * @remarks **Why `:remote` (#209).** This scope is tagged `posts` + `pages` and
 * both revalidation hooks purge those tags on every publish, unpublish and
 * delete — so it is a CMS read in every sense that matters, and it has to live
 * where a purge can reach it. On plain `'use cache'` it lived in each
 * instance's in-memory LRU, whose tag state is a module-level `Map`
 * (`refreshTags` is a no-op in `next/dist/server/lib/cache-handlers/default.js`
 * at 16.3.4), so `[source]` a hook's purge expired the copy on the instance
 * that ran the hook and no other. `[inference]` whichever instance regenerated
 * `/sitemap.xml` next rebuilt it from its own stale copy and re-cached the
 * result — the #118 failure mode, measured there on the detail route, on the
 * one scope #118's conversion skipped. Per-instance behaviour cannot be
 * observed off-platform: a single local `next start` process refreshes
 * correctly on both tiers.
 * `[measured, prod 2026-09-26, #209 comment]` a page and two articles
 * published after the `revalidatePath('/sitemap.xml')` fix stayed out of the
 * sitemap (61 URLs) for over an hour; only a redeploy with no code change took
 * it to 64. One scope carries both tags, so `[inference]` one stale copy
 * starved articles and pages together. That this scope was the stale layer is
 * itself `[inference]`: a 2026-09-09 read stale 28.5 h after publish is past
 * the 24 h `expire` below, which a per-instance copy should not survive, so it
 * may not be the only one (#209).
 *
 * On `:remote` the entry is the platform's shared Runtime Cache — the tier
 * #118 measured fresh on the preview for the static detail route (5/5 timed
 * edit trials, 2026-08-28) — so the purge is expected to reach the copy every
 * instance reads. `[inference]`: verified only by #209's production check. If
 * that check fails, diagnose first — the stale response's headers, the two
 * inner `:remote` reads, whether the hooks' purge ran — and only then fall
 * back to not caching this assembly (the route goes dynamic). The route
 * stays `○` static (`[measured, local next build, 2026-09-27]`: 6h
 * revalidate / 1d expire, `x-next-cache-tags` carrying `posts`, `pages` and
 * `_N_T_/sitemap.xml`), so
 * the hooks' tag and path purges are expected to expire the prerendered entry
 * and its regeneration to read a copy the purge reached (`[inference]` on
 * Vercel; `[measured, local, 2026-09-27]` a single `next start` process did
 * both, on either tier). Both inner reads were already `:remote`
 * (`getPublishedPagePaths`, `getPublishedPostSummaries`); remote-in-remote is
 * a supported nesting
 * `[source, next 16.3.4 docs, use-cache-remote.md § Nesting rules]`. The
 * value is slugs and epoch-ms — under 100 bytes an entry, so a few kilobytes
 * at today's ~60 URLs and nowhere near the 2 MB item ceiling that keeps the
 * search index on the in-memory tier.
 *
 * The future-dated publish gate reads `Date.now()`
 * (`isFuturePublicationDate`), which `cacheComponents` rejects during
 * prerender; running it here freezes `Date.now()` at cache generation and
 * refreshes it on the `cmsContent` cadence or the next purge, so
 * `/sitemap.xml` prerenders static. Returns only serializable primitives
 * (slugs + epoch-ms) — the `Date` objects the sitemap shape needs are rebuilt
 * from those fixed timestamps in {@link sitemap} (never `Date.now()`), which is
 * prerender-safe.
 */
async function getSitemapData(): Promise<{
  articles: Array<{
    slug: string
    /** A placed article's stored path (#153); absent for `/articles/<slug>`. */
    path?: string
    lastModifiedMs: number | null
  }>
  newestArticleMs: number | null
  pagePaths: string[]
}> {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles, CMS_TAGS.pages)
  cacheLife('cmsContent')

  const [allArticles, pagePaths] = await Promise.all([
    getAllArticles(),
    getPublishedPagePaths(),
  ])

  const publicArticles = allArticles.filter(
    (article) => !article.noindex && !isFuturePublicationDate(article.date),
  )

  const articles = publicArticles.map((article) => {
    const freshness =
      toValidDate(article.updatedAt) || toValidDate(article.date)
    return {
      slug: article.slug,
      // Carried through this deliberately-narrow projection because the URL is
      // built from it below: without `path`, a placed article would be listed
      // at `/articles/<slug>`, a URL that 308s (#153).
      path: article.path,
      lastModifiedMs: freshness?.getTime() ?? null,
    }
  })

  const newestArticleMs = articles.reduce<number | null>((latest, article) => {
    if (article.lastModifiedMs === null) return latest
    return latest === null || article.lastModifiedMs > latest
      ? article.lastModifiedMs
      : latest
  }, null)

  return { articles, newestArticleMs, pagePaths }
}

/**
 * The `/sitemap.xml` route: assembles the static, article, and page-builder
 * URLs from the cached {@link getSitemapData} payload.
 *
 * @remarks
 * Kept outside the cache scope so it stays a cheap pure reshape: it
 * rebuilds the `Date` objects the `MetadataRoute.Sitemap` shape requires from
 * the fixed epoch-ms timestamps {@link getSitemapData} returns — never
 * `Date.now()`, which `cacheComponents` rejects during prerender — so
 * `lastModified` reflects real content freshness while the route prerenders
 * static.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const { articles, newestArticleMs, pagePaths } = await getSitemapData()

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
    url: `${siteUrl}${publicPathFor('posts', article)}`,
    lastModified:
      article.lastModifiedMs === null
        ? undefined
        : new Date(article.lastModifiedMs),
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
