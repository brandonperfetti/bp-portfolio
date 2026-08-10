import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import type { CmsPageContent } from '@/lib/cms/types'
import type { Page } from '@/payload-types'

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

/**
 * Image URLs of the layout's first `photoStrip` block. The home route
 * consumes this for its hero-slot gallery (and excludes the block from its
 * end-of-page CMS region so it doesn't render twice).
 */
function photoStripImagesFromLayout(
  layout: Page['layout'] | null | undefined,
): string[] | undefined {
  const strip = layout?.find((block) => block.blockType === 'photoStrip')
  if (!strip || strip.blockType !== 'photoStrip') return undefined
  const urls = (strip.images ?? [])
    .map((image) => mediaUrl(image))
    .filter((url): url is string => Boolean(url))
  return urls.length ? urls : undefined
}

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
      photoStripImages: photoStripImagesFromLayout(page.layout),
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

/**
 * Slugs owned by dedicated route components. The `[slug]` catch-all must
 * never render or emit these, and the sitemap must not double-list them.
 */
export const RESERVED_PAGE_SLUGS = new Set([
  'home',
  'about',
  'account',
  'articles',
  'hermes',
  'projects',
  'sign-in',
  'sign-up',
  'speaking',
  'tech',
  'thank-you',
  'uses',
])

/**
 * Draft-aware single-page query for the page-builder catch-all route.
 * Draft mode (admin Live Preview) reads the newest draft with authenticated
 * access; visitors only ever see published documents.
 *
 * @remarks Lives here (not in the route file) per docs/STATE.md — pages
 * never call `getPayload()` directly (fresh-eyes review 2026-08, m5).
 */
export const getPageBySlugDraftAware = async (
  slug: string,
): Promise<Page | null> => {
  const { draftMode } = await import('next/headers')
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] ?? null
}

/**
 * Published, non-reserved page-builder slugs — the set of pages the
 * `[slug]` catch-all serves. Feeds `generateStaticParams` and the sitemap
 * (fresh-eyes review 2026-08, M5: builder pages were missing from the
 * sitemap entirely).
 */
export const getPublishedPageSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'pages',
      draft: false,
      limit: 500,
      overrideAccess: false,
      pagination: false,
      select: { slug: true },
      where: { _status: { equals: 'published' } },
    })
    return docs
      .map((doc) => doc.slug)
      .filter((s): s is string => Boolean(s) && !RESERVED_PAGE_SLUGS.has(s!))
  },
  ['published-page-slugs'],
  { tags: ['pages'] },
)
