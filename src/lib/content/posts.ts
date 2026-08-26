import { cacheLife, cacheTag } from 'next/cache'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { Post } from '@/payload-types'

/**
 * Data access for articles (Posts) via the Payload Local API — no HTTP hop.
 *
 * @remarks Published lists are cached under the `posts` tag, which the
 * Posts `afterChange` hook revalidates on publish/unpublish. Draft reads
 * bypass the cache (draft preview must always be fresh).
 */

/**
 * The list-card fields the article-summary mapper reads. Deliberately excludes
 * the heavy `content` (Lexical body), `layout`, and `relatedPosts` fields, so
 * the cached list payload cannot grow with article body size.
 *
 * @remarks #76 Phase 0: `getPublishedPosts` cached the full `Post[]` — measured
 * 2,352,427 bytes, over Next's 2 MB data-cache per-item ceiling, which silently
 * un-cached the hottest query (double DB fetch/render per request). The list
 * surfaces (`/`, `/articles`) only need these summary fields, so they now read
 * {@link getPublishedPostSummaries} instead. The search index keeps the
 * full-body {@link getPublishedPosts} fetch (its `searchText` needs the
 * flattened body). Timestamps must be listed explicitly — a `select` allowlist
 * only auto-returns `id`.
 */
export const PUBLISHED_POST_SUMMARY_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  heroImage: true,
  meta: true,
  categories: true,
  tags: true,
  ogImageMode: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  authors: true,
  populatedAuthors: true,
} as const

/** The summary-shaped projection of a published post (no Lexical body). */
export type PublishedPostSummary = Pick<
  Post,
  | 'id'
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'heroImage'
  | 'meta'
  | 'categories'
  | 'tags'
  | 'ogImageMode'
  | 'publishedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'authors'
  | 'populatedAuthors'
>

/**
 * All published posts as summary-shaped docs (no `content`), newest first.
 * Cached under the `posts` tag. Feeds the `/` + `/articles` list surfaces.
 */
export const getPublishedPostSummaries = async (): Promise<
  PublishedPostSummary[]
> => {
  'use cache'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    select: PUBLISHED_POST_SUMMARY_SELECT,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' } },
  })
  return docs as PublishedPostSummary[]
}

/**
 * All published posts with full bodies, newest first. Cached under the `posts`
 * tag.
 *
 * @remarks Retained for the search index only ({@link getCmsSearchArticles}),
 * whose `searchText` needs the flattened Lexical body. The list surfaces read
 * {@link getPublishedPostSummaries} instead so they no longer serialize the
 * full Lexical `content` into the cache entry (#76 Phase 0). This full-body
 * fetch stays on `unstable_cache` for now — the `'use cache'` conversion that
 * escapes the 2 MB ceiling is Phase 1.
 */
export const getPublishedPosts = async (): Promise<Post[]> => {
  'use cache'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' } },
  })
  return docs
}

/** Published slugs for `generateStaticParams`. */
export const getPublishedPostSlugs = async (): Promise<string[]> => {
  'use cache'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    select: { slug: true },
    where: { _status: { equals: 'published' } },
  })
  return docs.map((d) => d.slug).filter((s): s is string => Boolean(s))
}

/**
 * One post by slug. When Next draft mode is active (admin preview), reads the
 * latest draft with authenticated access; otherwise only published content.
 */
export const getPostBySlug = async (slug: string): Promise<Post | null> => {
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] || null
}

/**
 * Trusted fetch of a gated post's `content` field, bypassing field-level
 * access.
 *
 * @remarks The Posts `content` field carries field-level read access that
 * hides gated bodies from every unauthenticated Payload read — including
 * this app's own Local API calls, which run without a Payload user. Callers
 * MUST have already authorized the viewer via `canAccess()` (Clerk-side);
 * this function is the deliberate, single point where that app-layer
 * decision is allowed to override the data-layer gate. Never call it before
 * the gate. (Fresh-eyes review 2026-08, finding B2.)
 */
export const getGatedPostContent = async (
  id: number,
): Promise<Post['content'] | null> => {
  const payload = await getPayload({ config: configPromise })
  const doc = await payload.findByID({
    collection: 'posts',
    id,
    depth: 2,
    overrideAccess: true,
    select: { content: true },
  })
  return doc?.content ?? null
}
