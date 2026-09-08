import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { Page, Post } from '@/payload-types'

/**
 * A document's layout blocks together with the id of the document they were
 * composed on.
 *
 * @typeParam T - The hosting document type (`Page` or `Post`).
 *
 * @remarks The id travels with the layout rather than being fetched again,
 * because it is the same row: the finder already selected the document, and
 * `docs[0]?.layout ?? null` was throwing away the identity half of what it had
 * just read. A block that wants to query for things belonging to its host
 * needs that id (#177), and a second round trip to recover it would be a
 * second cache entry to keep in step with this one.
 *
 * Widening the return type this way keeps the cached payload one number
 * larger, which matters because these reads live on the remote cache tier and
 * its 2 MB item ceiling is what `cacheTags.test.ts` polices.
 */
export type HostedLayout<T extends { id: number; layout?: unknown }> = {
  /** Id of the document the blocks were composed on. */
  id: number
  /** The document's published `layout` blocks. */
  layout: T['layout']
}

/**
 * Published `layout` blocks for a Pages doc — with the doc's id — cached under
 * the same `'pages'` tag the rest of the pages data uses.
 *
 * @param slug - Pages collection slug.
 * @returns The document's id and layout, or `null` when no published page has
 * that slug.
 *
 * @remarks Repo-layer home for the fetchers that previously lived inside
 * `CmsPageBlocks`/`CmsPostBlocks` (fresh-eyes review 2026-08, n2) —
 * components render, repos fetch (docs/STATE.md).
 *
 * `'use cache: remote'` so a `pages` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118). The cache key is the
 * function plus its arguments, and neither moved when the id joined the return
 * value: same name, same single `slug` argument, same `cacheTag(CMS_TAGS.pages)`,
 * same `cacheLife('cmsContent')`. Only the cached *value* grew, by one number.
 */
export const getPageLayoutBySlug = async (
  slug: string,
): Promise<HostedLayout<Page> | null> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.pages)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  const doc = docs[0]
  return doc ? { id: doc.id, layout: doc.layout } : null
}

/**
 * Post counterpart of {@link getPageLayoutBySlug}, tagged `'posts'`.
 *
 * @param slug - Post slug.
 * @returns The post's id and layout, or `null` when no published post has that
 * slug.
 *
 * @remarks `'use cache: remote'` so a `posts` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 */
export const getPostLayoutBySlug = async (
  slug: string,
): Promise<HostedLayout<Post> | null> => {
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
  const doc = docs[0]
  return doc ? { id: doc.id, layout: doc.layout } : null
}
