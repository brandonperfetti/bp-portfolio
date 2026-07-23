import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import {
  PERSON_IMAGE_URL,
  SITE_OWNER_JOB_TITLE,
  SITE_OWNER_NAME,
  SITE_OWNER_SOCIAL_LINKS,
} from '@/lib/identity'
import type { Media } from '@/payload-types'

/** Resolved person identity for JSON-LD and the Resume card. */
export interface CmsIdentity {
  name: string
  jobTitle?: string
  /** Avatar URL for the Person schema `image`. */
  image?: string
  /** Social profile URLs for the Person schema `sameAs` list. */
  sameAs: string[]
  /** Uploaded CV file URL; `undefined` falls back to the static asset. */
  resumeUrl?: string
}

const mediaUrl = (m: unknown): string | undefined =>
  m && typeof m === 'object' ? (m as Media).url || undefined : undefined

/**
 * Person identity from the Payload `identity` global, with the v3
 * `src/lib/identity.ts` constants as field-level fallbacks so pages render
 * correctly before the global is ever saved in admin.
 *
 * @remarks Cache tag `global_identity` matches `revalidateGlobal('identity')`
 * on the global's afterChange hook, so admin edits go live without a deploy.
 */
export const getCmsIdentity = unstable_cache(
  async (): Promise<CmsIdentity> => {
    const payload = await getPayload({ config: configPromise })
    const identity = await payload
      .findGlobal({ slug: 'identity', depth: 1, overrideAccess: false })
      .catch(() => null)
    const sameAs = (identity?.sameAs ?? [])
      .map((entry) => entry.url)
      .filter((url): url is string => Boolean(url))
    return {
      name: identity?.name || SITE_OWNER_NAME,
      jobTitle: identity?.jobTitle || SITE_OWNER_JOB_TITLE,
      image: mediaUrl(identity?.image) || PERSON_IMAGE_URL,
      sameAs: sameAs.length ? sameAs : SITE_OWNER_SOCIAL_LINKS,
      resumeUrl: mediaUrl(identity?.resume),
    }
  },
  ['identity'],
  { tags: ['global_identity'] },
)
