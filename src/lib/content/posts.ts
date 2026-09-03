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
  // `path` is what tells a summary consumer that this post has been placed
  // under a section page (#153). Without it every card, feed item, sitemap
  // entry and search hit would resolve a placed post through `publicPathFor`
  // with no path in hand and link at `/articles/<slug>`, which then 308s.
  path: true,
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
  | 'path'
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
 *
 * @remarks `'use cache: remote'` so a `posts` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118). Measured
 * 43,381 bytes at the current corpus, 838,561 at the 1000-post query ceiling —
 * both under the 2 MB Runtime Cache item limit.
 */
export const getPublishedPostSummaries = async (): Promise<
  PublishedPostSummary[]
> => {
  'use cache: remote'
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
 * fetch uses plain `'use cache'` (in-memory, no 2 MB per-item ceiling — the
 * #76 B1 conversion) so the large search-index payload caches without the
 * `unstable_cache` 2 MB rejection.
 *
 * The documented exception to #118's `'use cache: remote'` move: at 2,358,733
 * measured bytes over the 52-post corpus it is above Vercel's 2 MB Runtime
 * Cache item ceiling, so `:remote` would silently reject the write and re-query
 * Postgres on every read — the exact failure #76 Phase 0 removed. It therefore
 * stays on the per-process in-memory tier and keeps that tier's known defect:
 * a `posts` purge only reaches the instance that issued it, so the search index
 * converges on the `cmsContent` cadence rather than on the edit. Search is the
 * least freshness-critical surface; shrinking this read (a `{slug, content}`
 * projection or a precomputed `searchText` column) is what would remove the
 * exception.
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

/**
 * Published slugs for `generateStaticParams`.
 *
 * @remarks `'use cache: remote'` so a `posts` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 */
export const getPublishedPostSlugs = async (): Promise<string[]> => {
  'use cache: remote'
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
 * Published **placed** post paths — the posts the `[...segments]` catch-all
 * serves (#153).
 *
 * @remarks Only placed posts appear: an unplaced post has `path: null` and is
 * served by `/articles/[slug]`, so listing it here would make the catch-all
 * prerender a second URL for it. The count is therefore zero on a corpus where
 * nothing has been placed — which is every corpus the day M2 lands — and the
 * catch-all's static profile is unchanged until an editor places something.
 *
 * `'use cache: remote'` so a `posts` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118).
 */
export const getPublishedPostPaths = async (): Promise<string[]> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    select: { path: true },
    where: {
      _status: { equals: 'published' },
      path: { exists: true },
    },
  })
  return docs.map((d) => d.path).filter((p): p is string => Boolean(p))
}

/**
 * Cached published post by slug — the prerender path (#76 B2 draft-split).
 * `'use cache: remote'` + `cacheTag(CMS_TAGS.articles)` so the signed-out
 * article shell prerenders static and publishes/edits purge it. Reads NO
 * `draftMode()` (a dynamic-API read here would block prerender). The draft
 * branch is {@link getDraftPostBySlug}.
 *
 * @remarks `:remote` so a `posts` tag purge reaches every serverless instance,
 * not only the one that ran the hook (#118) — this per-slug entry is the one
 * the detail-page staleness incident landed on. Measured 45,356 bytes for one
 * post, far under the 2 MB Runtime Cache item limit.
 */
const getPublishedPostBySlug = async (slug: string): Promise<Post | null> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] || null
}

/**
 * Cached published post by its placed `path` — the catch-all's resolution read
 * (#153).
 *
 * @remarks One indexed equality read on the unique `path` column, the same
 * shape `getPublishedPageByPath` uses, so a placed post costs the catch-all
 * exactly what a page costs it. An unplaced post has `path: null` and can never
 * match — which is what keeps `/articles/<slug>` the only URL for the rest of
 * the corpus.
 */
const getPublishedPostByPath = async (path: string): Promise<Post | null> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: { path: { equals: path } },
  })
  return docs[0] || null
}

/**
 * Uncached draft post by its placed `path` — admin Live Preview only.
 */
const getDraftPostByPath = async (path: string): Promise<Post | null> => {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { path: { equals: path } },
  })
  return docs[0] || null
}

/**
 * Uncached draft post by slug — admin Live Preview only (draft preview must be
 * live). Reached solely when Next draft mode is enabled (#76 B2).
 */
const getDraftPostBySlug = async (slug: string): Promise<Post | null> => {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] || null
}

/**
 * One post by slug. A thin `draftMode()` selector over a split read: published
 * visitors + the build take the cached {@link getPublishedPostBySlug} branch
 * (→ static prerender, #76 B2); admins in Live Preview take the uncached
 * {@link getDraftPostBySlug} branch. Behavior-preserving.
 */
export const getPostBySlug = async (slug: string): Promise<Post | null> => {
  const { isEnabled } = await draftMode()
  return isEnabled ? getDraftPostBySlug(slug) : getPublishedPostBySlug(slug)
}

/**
 * One **placed** post by its path, draft-aware. The catch-all's reader (#153),
 * mirroring {@link getPostBySlug}'s published/draft split exactly.
 */
export const getPostByPath = async (path: string): Promise<Post | null> => {
  const { isEnabled } = await draftMode()
  return isEnabled ? getDraftPostByPath(path) : getPublishedPostByPath(path)
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
