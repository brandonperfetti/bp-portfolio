import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { CmsAuthor, CmsAuthorProfile } from '@/lib/cms/types'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import type { Author } from '@/payload-types'
import {
  PERSON_IMAGE_URL,
  SITE_OWNER_JOB_TITLE,
  SITE_OWNER_NAME,
  SITE_OWNER_SOCIAL_LINKS,
} from '@/lib/identity'

/**
 * Default site author (single-author fallback), sourced from identity
 * constants. Used when the `authors` collection is empty or unreachable — e.g.
 * before the seeding migration runs.
 */
export const DEFAULT_CMS_AUTHOR: CmsAuthorProfile = {
  id: 'site-owner',
  slug: 'brandon-perfetti',
  name: SITE_OWNER_NAME,
  href: '/about',
  role: SITE_OWNER_JOB_TITLE,
  image: PERSON_IMAGE_URL,
  sameAs: SITE_OWNER_SOCIAL_LINKS,
  primary: true,
  order: 0,
}

/** The site owner routes to /about; guest authors have no route yet. */
const authorHref = (name: string): string | undefined =>
  name.trim().toLowerCase() === SITE_OWNER_NAME.toLowerCase()
    ? '/about'
    : undefined

const toProfile = (author: Author, index: number): CmsAuthorProfile => {
  const sameAs = (author.socials ?? [])
    .map((social) => social?.url?.trim())
    .filter((url): url is string => Boolean(url))
  return {
    id: String(author.id),
    slug: author.slug || String(author.id),
    name: author.name,
    role: author.role || undefined,
    image: mediaUrl(author.avatar) || undefined,
    bio: author.bio || undefined,
    email: author.email || undefined,
    href: authorHref(author.name),
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    primary: index === 0,
    order: index,
  }
}

/**
 * Authors from the Payload `authors` collection, mapped to
 * {@link CmsAuthorProfile}. Falls back to the single-author default while the
 * collection is empty.
 *
 * @remarks The live article byline does NOT flow through here — it is resolved
 * from the populated `authors` relation in {@link articlesRepo} (the rendering
 * path). This repo backs author-directory / API surfaces and future consumers.
 *
 * `'use cache: remote'` so a `authors` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118).
 */
export const getCmsAuthors = async (): Promise<CmsAuthorProfile[]> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.authors)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'authors',
    depth: 1,
    limit: 200,
    overrideAccess: false,
    sort: 'name',
  })
  if (!docs.length) return [DEFAULT_CMS_AUTHOR]
  return docs.map(toProfile)
}

/** The site's default (primary) author. */
export async function getCmsDefaultAuthor(): Promise<CmsAuthor> {
  const authors = await getCmsAuthors()
  return (
    authors.find((author) => author.primary) ?? authors[0] ?? DEFAULT_CMS_AUTHOR
  )
}
