import { Feed } from 'feed'

import { getAllArticles } from '@/lib/articles'
import { isFuturePublicationDate } from '@/lib/date'
import { getSiteUrl, SITE_DESCRIPTION } from '@/lib/site'
import { publicPathFor } from '@/fields/slug/slugPaths'

// #76 Piece 1: `export const revalidate = 3600` removed (incompatible with
// `cacheComponents`; removal-only in Piece 1). This handler already sets
// `Cache-Control: s-maxage=3600` on its Response (below), so CDN caching is
// preserved; Piece 2 may restore route-level ISR via `'use cache'` + `cacheLife`.

/**
 * RSS 2.0 feed rendered directly from Payload content.
 *
 * @remarks v3 fetched each article's own HTML page and scraped it with
 * cheerio; v4 renders item descriptions from the CMS excerpt/body text with
 * no self-HTTP requests.
 */
export async function GET() {
  const siteUrl = getSiteUrl()
  const articles = (await getAllArticles()).filter(
    (article) => !article.noindex && !isFuturePublicationDate(article.date),
  )

  const author = {
    name: 'Brandon Perfetti',
    email: 'info@brandonperfetti.com',
  }

  const feed = new Feed({
    title: author.name,
    description: SITE_DESCRIPTION,
    author,
    id: siteUrl,
    link: siteUrl,
    image: `${siteUrl}/favicon.ico`,
    favicon: `${siteUrl}/favicon.ico`,
    copyright: `All rights reserved ${new Date().getFullYear()}`,
    feedLinks: {
      rss2: `${siteUrl}/feed.xml`,
    },
  })

  for (const summary of articles) {
    // One definition of an article's URL, shared with the sitemap, the
    // canonical, and the redirect machinery (#148).
    const url = `${siteUrl}${publicPathFor('posts', summary)}`

    feed.addItem({
      title: summary.title,
      id: url,
      link: url,
      description: summary.description,
      author: [author],
      date: new Date(summary.date),
      image: summary.image?.startsWith('http') ? summary.image : undefined,
    })
  }

  return new Response(feed.rss2(), {
    status: 200,
    headers: {
      'content-type': 'application/xml',
      'cache-control': 's-maxage=3600, stale-while-revalidate',
    },
  })
}
