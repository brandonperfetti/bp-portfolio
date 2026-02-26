import assert from 'assert'
import * as cheerio from 'cheerio'
import { Feed } from 'feed'
import { getAllArticles } from '@/lib/articles'
import { getSiteUrl, SITE_DESCRIPTION } from '@/lib/site'

export async function GET(req: Request) {
  const siteUrl = getSiteUrl()

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

  const articleIds = (await getAllArticles()).map((article) => article.slug)

  for (const id of articleIds) {
    const url = String(new URL(`/articles/${id}`, req.url))
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

    const publicUrl = `${siteUrl}/articles/${id}`
    const article = $('article').first()
    const title = article.find('h1').first().text()
    const date = article.find('time').first().attr('datetime')
    const content = article.find('[data-mdx-content]').first().html()

    assert(typeof title === 'string')
    assert(typeof date === 'string')
    assert(typeof content === 'string')

    feed.addItem({
      title,
      id: publicUrl,
      link: publicUrl,
      content,
      author: [author],
      contributor: [author],
      date: new Date(date),
    })
  }

  return new Response(feed.rss2(), {
    status: 200,
    headers: {
      'content-type': 'application/xml',
      'cache-control': 's-maxage=31556952',
    },
  })
}
