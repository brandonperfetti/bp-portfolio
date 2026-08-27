import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { Page, Post } from '@/payload-types'

/**
 * Published `layout` blocks for a Pages doc, cached under the same
 * `'pages'` tag the rest of the pages data uses.
 *
 * @remarks Repo-layer home for the fetchers that previously lived inside
 * `CmsPageBlocks`/`CmsPostBlocks` (fresh-eyes review 2026-08, n2) —
 * components render, repos fetch (docs/STATE.md).
 */
export const getPageLayoutBySlug = async (
  slug: string,
): Promise<Page['layout'] | null> => {
  'use cache'
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
  return docs[0]?.layout ?? null
}

/** Post counterpart of {@link getPageLayoutBySlug}, tagged `'posts'`. */
export const getPostLayoutBySlug = async (
  slug: string,
): Promise<Post['layout'] | null> => {
  'use cache'
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
  return docs[0]?.layout ?? null
}
