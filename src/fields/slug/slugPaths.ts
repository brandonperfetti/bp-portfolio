/**
 * The collections whose `slug` is a public URL segment, and the path prefix
 * each one is served under.
 *
 * @remarks Deliberately just two entries. `slugField()` is shared by Posts,
 * Pages, Projects, Categories, Tags and Authors, but only Posts and Pages are
 * slug-routed in `src/app/(frontend)` (`/articles/[slug]` and
 * `/[...segments]`) — the other four carry a slug for admin/API convenience and
 * no public URL depends on it. Scoping the freeze + auto-redirect machinery to
 * this map is what keeps a taxonomy rename from paying for a URL contract it
 * does not have. It is also exactly the collection set `redirectsPlugin` is
 * configured for (`src/plugins/index.ts`), so a redirect row can always be
 * written for a freeze-protected rename.
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
 * The Pages slug that designates the site root — the document served at `/`.
 *
 * @remarks **The root-page contract (#148, Brandon 2026-09-02).** The root is a
 * designated page, not a slug with special meaning scattered through the code.
 * This module owns the designation and the `→ /` mapping; no other module
 * compares a slug to `'home'`. Two designations were considered:
 *
 * 1. **A reserved `home` slug** (chosen) — the root is whichever top-level
 *    Pages document carries this slug.
 * 2. **A `rootPage` relationship on the `site-settings` global** — the root is
 *    whichever document the global points at.
 *
 * (1) wins on four counts, all measured against the tree at `c973b54`:
 *
 * - **`publicPathFor` must stay synchronous and pure.** It is called from
 *   `beforeValidate`/`beforeChange` field hooks, from `CMSLink` during a server
 *   render, from `revalidatePage` inside an `afterChange` hook, and from unit
 *   tests with Payload never booted. A global pointer makes the root a *read*,
 *   which forces every one of those call sites to become async or to thread a
 *   resolved pointer through — the seam stops being a function and becomes a
 *   dependency.
 * - **The deploy layer already hard-codes this designation.** `next.config.mjs`
 *   carries a permanent `/home → /` redirect so the catch-all can never serve a
 *   second copy of the root. A global pointer would let an editor move the root
 *   to a document that redirect does not describe, silently producing two live
 *   URLs for one page — the exact failure #120 exists to prevent.
 * - **No data migration and no new failure mode.** The root already *is* the
 *   `home` Pages document; a pointer would need a backfill, and an unset or
 *   dangling pointer is a state in which the site has no root at all.
 * - **`site-settings` has no natural home for it.** Its fields are presentation
 *   and SEO defaults (`siteName`, `canonicalUrl`, `defaultSeo`, `socialLinks`,
 *   share/OG toggles); a routing pointer there would be the only structural
 *   field in a global about appearance.
 *
 * The cost of (1) is that the root's *slug* is load-bearing, which is why it is
 * named once here and read from here everywhere else.
 */
export const ROOT_PAGE_SLUG = 'home'

/**
 * As much of a document as {@link publicPathFor} needs to place it.
 *
 * @remarks Structurally typed rather than `Page | Post` so a `select`ed
 * projection (`{ slug: true, path: true }`), a form-state snapshot in the admin
 * UI, and a full document all satisfy it. Every member is `unknown` because
 * callers include hook payloads Payload types loosely.
 */
export type PathableDoc = {
  /** The document's own slug. */
  slug?: unknown
  /** Pages: the computed, stored, root-relative path (no leading slash). */
  path?: unknown
}

/**
 * The public path a document is served at, or `null` when it has none.
 *
 * The single owner of "what is this document's URL" — the #120 redirect writer,
 * the not-found readers, the sitemap, `CMSLink`, the SEO plugin, the preview
 * builder and the revalidation hooks all resolve through here, so a path can
 * never be spelled two ways in two places (#132).
 *
 * @param collectionSlug - Payload collection slug (e.g. `posts`).
 * @param doc - The document, or any projection carrying `slug`/`path`.
 * @returns A site-relative path with a leading slash and no trailing slash
 *   (`/`, `/about`, `/work/brytecore`, `/articles/hello`), or `null`.
 *
 * @remarks The contract, case by case:
 *
 * | Case | Result |
 * |---|---|
 * | `pages`, resolved path is {@link ROOT_PAGE_SLUG} | `/` |
 * | `pages`, `path` set | `/` + `path` |
 * | `pages`, no `path` (pre-migration row, or a slug-only caller) | `/` + `slug` |
 * | `posts` | `/articles/` + `slug` — the preserved v3 URL shape |
 * | a collection outside {@link SLUG_ROUTED_COLLECTIONS} | `null` |
 * | missing/empty `slug` **and** missing/empty `path` | `null` |
 *
 * Falling back from `path` to `slug` is what makes this safe to deploy ahead of
 * M1's backfill and safe to call with a slug-only projection: before hierarchy,
 * every page's path *is* its slug, so both branches agree.
 */
export const publicPathFor = (
  collectionSlug: string,
  doc: PathableDoc | null | undefined,
): string | null => {
  if (!isSlugRoutedCollection(collectionSlug)) return null

  const slug = typeof doc?.slug === 'string' && doc.slug ? doc.slug : null

  if (collectionSlug === 'posts') {
    return slug ? `${SLUG_ROUTED_COLLECTIONS.posts}/${slug}` : null
  }

  const path = typeof doc?.path === 'string' && doc.path ? doc.path : null
  const resolved = path ?? slug
  if (!resolved) return null
  return resolved === ROOT_PAGE_SLUG ? '/' : `/${resolved}`
}

/**
 * The public path a document's slug is served at, or `null` when the collection
 * is not slug-routed or the slug is missing.
 *
 * @param collectionSlug - Payload collection slug (e.g. `posts`).
 * @param slug - The document's slug value.
 *
 * @remarks A thin wrapper over {@link publicPathFor} for callers that hold only
 * a slug. It is **not** a legacy alias with legacy behaviour: routing it through
 * the same function is what closed the vocabulary conflict #132 recorded, where
 * this function said `/home` while `revalidatePage` said `/`. Both now say `/`.
 * For a *placed* page the wrapper is necessarily wrong — a slug alone cannot
 * name `/work/brytecore` — so prefer {@link publicPathFor} wherever the document
 * is in hand.
 */
export const publicPathForSlug = (
  collectionSlug: string,
  slug: unknown,
): string | null => publicPathFor(collectionSlug, { slug })
