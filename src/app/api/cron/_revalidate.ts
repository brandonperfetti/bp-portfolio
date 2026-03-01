import { revalidatePath, revalidateTag } from 'next/cache'

import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * Revalidate article-facing cache tags/paths after cron jobs mutate article data.
 * This keeps /articles, home highlights, and search payloads fresh without hard refresh.
 */
export function revalidateArticleSurfaces() {
  revalidateTag(CMS_TAGS.articles, 'max')
  revalidatePath('/')
  revalidatePath('/articles')
}
