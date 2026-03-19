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
 */
export function buildPersonSchema(siteUrl: string) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${normalizedSiteUrl}/about#person`,
    name: SITE_OWNER_NAME,
    url: `${normalizedSiteUrl}/about`,
    image: PERSON_IMAGE_URL,
    sameAs: SITE_OWNER_SOCIAL_LINKS,
    jobTitle: SITE_OWNER_JOB_TITLE,
  }
}
