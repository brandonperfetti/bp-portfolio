import { getAllArticles } from '@/lib/articles'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { isFuturePublicationDate } from '@/lib/date'
import { getSiteUrl } from '@/lib/site'

const MAX_ARTICLES = 200

function sanitizeInlineMarkdown(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatOptionalList(label: string, values?: string[]) {
  if (!values || values.length === 0) return null
  return `${label}: ${values.map((value) => sanitizeInlineMarkdown(value)).join(', ')}`
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

  const articleBlocks =
    publicArticles.length === 0
      ? ['No public articles are currently available.']
      : publicArticles.flatMap((article) => {
          const title = sanitizeInlineMarkdown(article.title)
          const description = sanitizeInlineMarkdown(article.description)
          const published = sanitizeInlineMarkdown(article.date)
          const updated = sanitizeInlineMarkdown(
            article.updatedAt || article.date,
          )
          const url = `${siteUrl}/articles/${article.slug}`
          const topics = formatOptionalList('Topics', article.topics)
          const keywords = formatOptionalList('Keywords', article.keywords)
          const tech = formatOptionalList('Tech', article.tech)
          const detailLines = [topics, keywords, tech].filter(
            (line): line is string => Boolean(line),
          )

          return [
            `## ${title}`,
            `- URL: ${url}`,
            `- Published: ${published}`,
            `- Updated: ${updated}`,
            `- Summary: ${description}`,
            ...detailLines.map((line) => `- ${line}`),
            '',
          ]
        })

  const lines = [
    `# ${sanitizeInlineMarkdown(settings.siteName)} - Full LLM Index`,
    `> ${sanitizeInlineMarkdown(settings.siteDescription)}`,
    '',
    `Base: ${canonicalSiteUrl}`,
    `Primary index: ${siteUrl}/llms.txt`,
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
    '## Content Corpus',
    ...articleBlocks,
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
