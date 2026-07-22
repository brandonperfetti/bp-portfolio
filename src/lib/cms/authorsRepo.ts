import type { CmsAuthor } from '@/lib/cms/types'
import {
  PERSON_IMAGE_URL,
  SITE_OWNER_JOB_TITLE,
  SITE_OWNER_NAME,
} from '@/lib/identity'

/** Default site author (single-author site), sourced from identity constants. */
export const DEFAULT_CMS_AUTHOR: CmsAuthor = {
  name: SITE_OWNER_NAME,
  href: '/about',
  role: SITE_OWNER_JOB_TITLE,
  image: PERSON_IMAGE_URL,
}

export const FALLBACK_AUTHOR: CmsAuthor = { ...DEFAULT_CMS_AUTHOR }

/**
 * Article authors. v4 keeps the single-author fallback; Posts relate authors
 * to Payload users (populateAuthors hook), so a separate surface is
 * unnecessary. TODO(brandon): source image from the Identity global's Media
 * upload once migrated off Cloudinary.
 */
export async function getCmsAuthors(): Promise<CmsAuthor[]> {
  return [FALLBACK_AUTHOR]
}

/** The site's default (and only) author. */
export async function getCmsDefaultAuthor(): Promise<CmsAuthor> {
  return FALLBACK_AUTHOR
}
