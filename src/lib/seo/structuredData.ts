const PERSON_IMAGE_URL =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142617/bp-spotlight/images/avatar_jeycju.jpg'

/**
 * Shared Person JSON-LD for Brandon Perfetti.
 * Keeps identity metadata consistent across pages that embed person schema.
 */
export function buildPersonSchema(siteUrl: string) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Brandon Perfetti',
    url: `${normalizedSiteUrl}/about`,
    image: PERSON_IMAGE_URL,
    sameAs: [
      'https://x.com/brandonperfetti',
      'https://github.com/brandonperfetti',
      'https://www.linkedin.com/in/brandonperfetti/',
    ],
    jobTitle: 'Technical PM + Software Engineer',
  }
}
