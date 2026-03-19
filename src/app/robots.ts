import { type MetadataRoute } from 'next'

import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    // Crawl/index controls live in robots directives. AI-discovery files
    // (e.g. llms.txt) are informational and not enforcement mechanisms.
    rules: {
      userAgent: '*',
      allow: '/',
    },
    host: siteUrl,
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
