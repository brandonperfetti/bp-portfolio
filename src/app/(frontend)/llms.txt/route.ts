import { getAllArticles } from '@/lib/articles'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import {
  getPublicSortedArticles,
  sanitizeInlineMarkdown,
} from '@/lib/llms/helpers'
import { PRIMARY_NAV_LINKS } from '@/lib/navigation'
import { getSiteUrl } from '@/lib/site'

const MAX_ARTICLES = 50
export const revalidate = 3600

export async function GET() {
  const siteUrl = getSiteUrl()
  const [settings, allArticles] = await Promise.all([
    getCmsSiteSettings(),
    getAllArticles(),
  ])

  const canonicalSiteUrl = (settings.canonicalUrl || siteUrl).replace(
    /\/+$/,
    '',
  )
  const publicArticles = getPublicSortedArticles(allArticles, MAX_ARTICLES)
  const primaryPageLinks = [
    `- [Home](${canonicalSiteUrl}/)`,
    ...PRIMARY_NAV_LINKS.map(
      (item) => `- [${item.label}](${canonicalSiteUrl}${item.href})`,
    ),
  ]

  const lines = [
    `# ${sanitizeInlineMarkdown(settings.siteName)}`,
    `> ${sanitizeInlineMarkdown(settings.siteDescription)}`,
    '',
    '## Canonical',
    `- Base: ${canonicalSiteUrl}`,
    `- Sitemap: ${canonicalSiteUrl}/sitemap.xml`,
    `- Robots: ${canonicalSiteUrl}/robots.txt`,
    `- RSS: ${canonicalSiteUrl}/feed.xml`,
    `- Full Index: ${canonicalSiteUrl}/llms-full.txt`,
    '',
    '## Primary Pages',
    ...primaryPageLinks,
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
          return `- [${title}](${canonicalSiteUrl}/articles/${article.slug}) - ${description}`
        })),
    '',
    `Generated from live CMS data at ${canonicalSiteUrl}.`,
  ]

  return new Response(`${lines.join('\n')}\n`, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
