import assert from 'assert'
import * as cheerio from 'cheerio'
import { Feed } from 'feed'
import { getAllArticles } from '@/lib/articles'
import { isFuturePublicationDate } from '@/lib/date'
import { getSiteUrl, SITE_DESCRIPTION } from '@/lib/site'

export async function GET(req: Request) {
  const siteUrl = getSiteUrl()
  const articles = (await getAllArticles()).filter(
    (article) => !article.noindex && !isFuturePublicationDate(article.date),
  )

  const author = {
    name: 'Brandon Perfetti',
    email: 'brandon@brandonperfetti.com',
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

  for (const articleSummary of articles) {
    const url = String(new URL(`/articles/${articleSummary.slug}`, req.url))
    let html = ''
    try {
      const response = await fetch(url)

      if (!response.ok) {
        console.error('[feed.xml] Failed to fetch article', {
          url,
          status: response.status,
        })
        continue
      }

      html = await response.text()
      if (!html || !html.trim()) {
        console.error('[feed.xml] Empty article HTML response', { url })
        continue
      }
    } catch (error) {
      console.error('[feed.xml] Error fetching article', {
        url,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    const $ = cheerio.load(html)

    const publicUrl = `${siteUrl}/articles/${articleSummary.slug}`
    const article = $('article').first()
    const title = article.find('h1').first().text() || articleSummary.title
    const date = article.find('time').first().attr('datetime')
    const content = article.find('[data-mdx-content]').first().html()

    assert(typeof title === 'string')
    assert(typeof content === 'string')

    const freshnessDate =
      articleSummary.updatedAt || date || articleSummary.date

    feed.addItem({
      title,
      id: publicUrl,
      link: publicUrl,
      content,
      author: [author],
      contributor: [author],
      date: new Date(freshnessDate),
    })
  }

  return new Response(feed.rss2(), {
    status: 200,
    headers: {
      'content-type': 'application/xml',
      'cache-control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
