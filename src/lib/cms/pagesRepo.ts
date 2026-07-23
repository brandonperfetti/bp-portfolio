import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import type { CmsPageContent } from '@/lib/cms/types'
import type { Media } from '@/payload-types'

function normalizePath(path: string) {
  if (!path || path === '/') {
    return '/'
  }
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  return withLeadingSlash.replace(/\/+$/, '')
}

/** Route path → Pages collection slug (`home` renders at `/`). */
const pathToSlug = (path: string): string => {
  const normalized = normalizePath(path)
  return normalized === '/' ? 'home' : normalized.replace(/^\//, '')
}

const mediaUrl = (m: unknown): string | undefined =>
  m && typeof m === 'object' ? (m as Media).url || undefined : undefined

/**
 * Page content by route path from the Payload `pages` collection (was Notion).
 *
 * @param path - Route path to resolve (for example `/` or `/about`).
 * @returns v3-shaped page content, or `null` when no published page exists —
 * callers already treat `null` as "use hard-coded copy", which preserves the
 * boots-with-empty-CMS behavior.
 */
export const getCmsPageByPath = unstable_cache(
  async (
    path: string,
    options?: { includeBody?: boolean },
  ): Promise<CmsPageContent | null> => {
    const payload = await getPayload({ config: configPromise })
    const slug = pathToSlug(path)
    const { docs } = await payload.find({
      collection: 'pages',
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: { slug: { equals: slug } },
    })
    const page = docs[0]
    if (!page) return null

    const content: CmsPageContent = {
      pageId: String(page.id),
      routeKey: normalizePath(path),
      slug: page.slug || slug,
      title: page.title,
      subtitle: page.subtitle || page.meta?.description || undefined,
      seoTitle: page.meta?.title || undefined,
      seoDescription: page.meta?.description || undefined,
      heroImage: mediaUrl(page.hero?.media),
      ogImage: mediaUrl(page.meta?.image),
      homeImages: (page.homeImages ?? [])
        .map((image) => mediaUrl(image))
        .filter((url): url is string => Boolean(url)),
      updatedAt: page.updatedAt,
    }

    if (options?.includeBody) {
      content.bodyBlocks = page.hero?.richText
        ? lexicalToBlocks(page.hero.richText)
        : []
    }

    return content
  },
  ['page-by-path'],
  { tags: ['pages'] },
)
