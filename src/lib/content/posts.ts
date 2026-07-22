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
