/**
 * The collections whose `slug` is a public URL segment, and the path prefix
 * each one is served under.
 *
 * @remarks Deliberately just two entries. `slugField()` is shared by Posts,
 * Pages, Projects, Categories, Tags and Authors, but only Posts and Pages are
 * slug-routed in `src/app/(frontend)` (`/articles/[slug]` and `/[slug]`) — the
 * other four carry a slug for admin/API convenience and no public URL depends
 * on it. Scoping the freeze + auto-redirect machinery to this map is what keeps
 * a taxonomy rename from paying for a URL contract it does not have. It is also
 * exactly the collection set `redirectsPlugin` is configured for
 * (`src/plugins/index.ts`), so a redirect row can always be written for a
 * freeze-protected rename.
 */
export const SLUG_ROUTED_COLLECTIONS = {
  posts: '/articles',
  pages: '',
} as const

/** A collection slug that appears in a public URL. */
export type SlugRoutedCollection = keyof typeof SLUG_ROUTED_COLLECTIONS

/** Type guard for {@link SLUG_ROUTED_COLLECTIONS} membership. */
export const isSlugRoutedCollection = (
  collectionSlug: string,
): collectionSlug is SlugRoutedCollection =>
  Object.prototype.hasOwnProperty.call(SLUG_ROUTED_COLLECTIONS, collectionSlug)

/**
 * The public path a document's slug is served at, or `null` when the
 * collection is not slug-routed or the slug is missing.
 *
 * @param collectionSlug - Payload collection slug (e.g. `posts`).
 * @param slug - The document's slug value.
 */
export const publicPathForSlug = (
  collectionSlug: string,
  slug: unknown,
): string | null => {
  if (!isSlugRoutedCollection(collectionSlug)) return null
  if (typeof slug !== 'string' || slug.length === 0) return null
  return `${SLUG_ROUTED_COLLECTIONS[collectionSlug]}/${slug}`
}
