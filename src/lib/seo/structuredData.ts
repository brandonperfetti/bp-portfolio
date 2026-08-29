import {
  PERSON_IMAGE_URL,
  SITE_OWNER_JOB_TITLE,
  SITE_OWNER_NAME,
  SITE_OWNER_SOCIAL_LINKS,
} from '@/lib/identity'

/**
 * Shared WebSite JSON-LD for site-level discoverability and sitelink search.
 */
export function buildWebsiteSchema(
  siteName: string,
  siteDescription: string,
  siteUrl: string,
) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: normalizedSiteUrl,
    description: siteDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${normalizedSiteUrl}/articles?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

/**
 * Shared Person JSON-LD for Brandon Perfetti.
 * Keeps identity metadata consistent across pages that embed person schema.
 *
 * @param siteUrl - Canonical site origin.
 * @param identity - CMS identity (from `getCmsIdentity`); when omitted the
 * hard-coded v3 constants apply, keeping the builder pure and testable.
 */
export function buildPersonSchema(
  siteUrl: string,
  identity?: {
    name: string
    jobTitle?: string
    image?: string
    sameAs: string[]
  },
) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${normalizedSiteUrl}/about#person`,
    name: identity?.name || SITE_OWNER_NAME,
    url: `${normalizedSiteUrl}/about`,
    image: identity?.image || PERSON_IMAGE_URL,
    sameAs: identity?.sameAs?.length
      ? identity.sameAs
      : SITE_OWNER_SOCIAL_LINKS,
    jobTitle: identity?.jobTitle || SITE_OWNER_JOB_TITLE,
  }
}
