export const CMS_REVALIDATE = {
  articles: 300,
  articleDetail: 300,
  search: 1800,
  projects: 900,
  tech: 900,
  uses: 900,
  workHistory: 900,
  authors: 900,
  pages: 300,
  settings: 300,
  navigation: 300,
} as const

/**
 * The single cache-tag vocabulary. These MUST be the literal tag strings
 * the repo modules cache under — the values below are consumed by the
 * search cache, the `/api/revalidate` fallback list, and (indirectly) the
 * collection/global revalidation hooks.
 *
 * @remarks History (fresh-eyes review 2026-08, finding M3): this file
 * previously defined a parallel `cms:*` namespace nobody cached under, so
 * the search index was never purged by content edits and a default-body
 * `/api/revalidate` call was a near-no-op. One vocabulary, one source of
 * truth; `cache.test.ts` pins the mapping so the two sides cannot drift
 * apart silently again.
 */
export const CMS_TAGS = {
  articles: 'posts',
  projects: 'projects',
  tech: 'tech-stack',
  uses: 'uses',
  workHistory: 'work-history',
  pages: 'pages',
  settings: 'global_site-settings',
  navigation: 'global_navigation',
  identity: 'global_identity',
} as const
