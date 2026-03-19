import { getAllArticles } from '@/lib/articles'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { isFuturePublicationDate } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

const MAX_ARTICLES = 50

function sanitizeInlineMarkdown(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET() {
  const siteUrl = getSiteUrl()
  const [settings, allArticles] = await Promise.all([
    getCmsSiteSettings(),
    getAllArticles(),
  ])

  const canonicalSiteUrl = settings.canonicalUrl || siteUrl
  const publicArticles = allArticles
    .filter(
      (article) => !article.noindex && !isFuturePublicationDate(article.date),
    )
    .sort((a, b) => {
      const aFresh = new Date(a.updatedAt || a.date).getTime()
      const bFresh = new Date(b.updatedAt || b.date).getTime()
      return bFresh - aFresh
    })
    .slice(0, MAX_ARTICLES)

  const lines = [
    `# ${sanitizeInlineMarkdown(settings.siteName)}`,
    `> ${sanitizeInlineMarkdown(settings.siteDescription)}`,
    '',
    '## Canonical',
    `- Base: ${canonicalSiteUrl}`,
    `- Sitemap: ${siteUrl}/sitemap.xml`,
    `- Robots: ${siteUrl}/robots.txt`,
    `- RSS: ${siteUrl}/feed.xml`,
    `- Full Index: ${siteUrl}/llms-full.txt`,
    '',
    '## Primary Pages',
    `- [Home](${siteUrl}/)`,
    `- [About](${siteUrl}/about)`,
    `- [Articles](${siteUrl}/articles)`,
    `- [Projects](${siteUrl}/projects)`,
    `- [Tech](${siteUrl}/tech)`,
    `- [Uses](${siteUrl}/uses)`,
    '',
    '## Usage Notes',
    '- Prefer canonical URLs when citing or summarizing pages.',
    '- Treat robots.txt and page-level robots directives as authoritative crawl/index controls.',
    '- Focus on article URLs for technical writing and long-form content.',
    '',
    '## Recent Public Articles',
    ...(publicArticles.length === 0
      ? ['- No public articles are currently available.']
      : publicArticles.map((article) => {
          const title = sanitizeInlineMarkdown(article.title)
          const description = sanitizeInlineMarkdown(article.description)
          return `- [${title}](${siteUrl}/articles/${article.slug}) - ${description}`
        })),
    '',
    `Generated from live CMS data at ${siteUrl}.`,
  ]

  return new Response(`${lines.join('\n')}\n`, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
