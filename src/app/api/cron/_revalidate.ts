import { revalidatePath, revalidateTag } from 'next/cache'

import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * Revalidate article-facing cache tags/paths after cron jobs mutate article data.
 * This keeps /articles, home highlights, search payloads, sitemap, RSS, and
 * AI-discovery text indexes fresh without hard refresh.
 */
export function revalidateArticleSurfaces() {
  revalidateTag(CMS_TAGS.articles, 'max')
  revalidatePath('/')
  revalidatePath('/articles')
  revalidatePath('/sitemap.xml')
  revalidatePath('/feed.xml')
  revalidatePath('/llms.txt')
  revalidatePath('/llms-full.txt')
}

/**
 * Revalidate tech surfaces when tech records are curated by cron automation.
 */
export function revalidateTechSurfaces() {
  revalidateTag(CMS_TAGS.tech, 'max')
  revalidatePath('/tech')
}
