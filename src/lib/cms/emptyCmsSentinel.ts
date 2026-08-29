/**
 * Sentinel slug for the empty-CMS `generateStaticParams` guard (#76 B2).
 *
 * @remarks
 * Cache Components hard-errors when `generateStaticParams` returns an empty
 * array for a dynamic-param route, so the article/page routes return a single
 * throwaway param with this slug when the CMS has no published content. The
 * value must be one no real slug can collide with. Shared by both dynamic
 * `[slug]` routes so the two guards can never drift.
 */
export const EMPTY_CMS_SENTINEL = '__empty-cms-guard__'
