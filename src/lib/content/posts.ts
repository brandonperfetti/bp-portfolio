import { unstable_cache } from 'next/cache'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { Post } from '@/payload-types'

/**
 * Data access for articles (Posts) via the Payload Local API — no HTTP hop.
 *
 * @remarks Published lists are cached under the `posts` tag, which the
 * Posts `afterChange` hook revalidates on publish/unpublish. Draft reads
 * bypass the cache (draft preview must always be fresh).
 */

/** All published posts, newest first. Cached under the `posts` tag. */
export const getPublishedPosts = unstable_cache(
  async (): Promise<Post[]> => {
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
  },
  ['published-posts'],
  { tags: ['posts'] },
)

/** Published slugs for `generateStaticParams`. */
export const getPublishedPostSlugs = unstable_cache(
  async (): Promise<string[]> => {
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
  },
  ['published-post-slugs'],
  { tags: ['posts'] },
)

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
