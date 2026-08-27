import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import {
  PERSON_IMAGE_URL,
  SITE_OWNER_JOB_TITLE,
  SITE_OWNER_NAME,
  SITE_OWNER_SOCIAL_LINKS,
} from '@/lib/identity'

/** Resolved person identity for JSON-LD and the Resume card. */
export interface CmsIdentity {
  name: string
  jobTitle?: string
  /**
   * Public contact address, or `undefined` when the global has none.
   *
   * @remarks Deliberately without a constant fallback, unlike every other
   * field here: an address that is merely plausible sends real mail into a
   * void, so surfaces that show one (the social-links block's divider row)
   * hide themselves instead of guessing.
   */
  email?: string
  /** Avatar URL for the Person schema `image`. */
  image?: string
  /** Social profile URLs for the Person schema `sameAs` list. */
  sameAs: string[]
  /** Uploaded CV file URL; `undefined` falls back to the static asset. */
  resumeUrl?: string
}

/**
 * Person identity from the Payload `identity` global, with the v3
 * `src/lib/identity.ts` constants as field-level fallbacks so pages render
 * correctly before the global is ever saved in admin.
 *
 * @remarks Cache tag `global_identity` matches `revalidateGlobal('identity')`
 * on the global's afterChange hook, so admin edits go live without a deploy.
 */
export const getCmsIdentity = async (): Promise<CmsIdentity> => {
  'use cache'
  cacheTag(CMS_TAGS.identity)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  // A missing/empty global returns an object whose fields fall through to the
  // constants below. Any real failure (transient Payload/DB error) must
  // propagate rather than be caught: inside `'use cache'` a caught error would
  // be stored — and prerendered — as "no identity" (incl. the static CV link in
  // Resume) for the whole `cmsContent` lifetime, recoverable only by a
  // `revalidateTag` purge. Mirrors the un-caught read in `getCmsSiteSettings`.
  const identity = await payload.findGlobal({
    slug: 'identity',
    depth: 1,
    overrideAccess: false,
  })
  const sameAs = (identity?.sameAs ?? [])
    .map((entry) => entry.url)
    .filter((url): url is string => Boolean(url))
  return {
    name: identity?.name || SITE_OWNER_NAME,
    jobTitle: identity?.jobTitle || SITE_OWNER_JOB_TITLE,
    email: identity?.email?.trim() || undefined,
    image: mediaUrl(identity?.image) || PERSON_IMAGE_URL,
    sameAs: sameAs.length ? sameAs : SITE_OWNER_SOCIAL_LINKS,
    resumeUrl: mediaUrl(identity?.resume),
  }
}
