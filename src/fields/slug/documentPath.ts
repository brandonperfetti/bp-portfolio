import { APIError } from 'payload'
import type { PayloadRequest } from 'payload'

import {
  ROOT_PAGE_SLUG,
  SLUG_ROUTED_COLLECTIONS,
  publicPathFor,
} from './slugPaths'
import type { Page } from '@/payload-types'

/**
 * Placement primitives shared by every collection whose documents compose a URL
 * out of a parent Page's path plus their own slug.
 *
 * @remarks Extracted from `src/collections/Pages/hooks/pageHierarchy.ts` when
 * #153 gave Posts the same `parent` → `path` composition. The extraction is not
 * tidiness: the depth cap, the code-owned first segments, the ancestor read and
 * the cross-collection collision rule are all statements about **one URL
 * namespace** that Pages and Posts now share. Two copies of any of them is two
 * chances for a page and a placed post to end up agreeing that they both serve
 * `/work/brytecore`. This module lives beside `publicPathFor` for the same
 * reason that function does: it is the one place that knows how a public path
 * is built, and the collections call in rather than re-deriving.
 */

/**
 * Maximum number of segments a composed path may carry — `/a/b/c` (Brandon, D3
 * on #148).
 *
 * @remarks A cap, not a technical limit: the catch-all resolves any depth in
 * one indexed read. Three segments is the depth past which a URL stops being
 * navigable and a breadcrumb stops fitting.
 */
export const PATH_MAX_DEPTH = 3

/**
 * First path segments owned by code, which no CMS document may occupy at any
 * depth beneath them.
 *
 * @remarks **A different set from `RESERVED_PAGE_SLUGS`, and the difference is
 * load-bearing (#148).** `RESERVED_PAGE_SLUGS` (`src/lib/cms/pagesRepo.ts`)
 * lists slugs whose *root* path is rendered by a dedicated Next route —
 * `about`, `tech`, `projects`, `uses`, `corvus`, `articles`. A document is not
 * merely allowed to exist at those paths, it is how they get their copy:
 * `/about`, `/tech`, `/uses`, `/projects`, `/corvus` and `/articles` each read
 * a Pages doc through `getCmsPageByPath`. Reserving them at *validation* would
 * make the live `about` and `articles` documents unsaveable. What
 * `RESERVED_PAGE_SLUGS` buys is an *emit* exclusion, narrowed under hierarchy
 * to the **first segment** — which is what lets `/tech/ai` resolve while
 * `/tech` stays the dedicated route (Brandon, D1).
 *
 * The set below is the genuinely hard reservation: paths under Next's own route
 * tree and the metadata routes. Nothing behind these can ever render a CMS
 * document, so saving one there is always a silent mistake.
 *
 * `api`, `admin` and `next` are matched as **first segments** because Next owns
 * their whole subtree; the file-shaped entries can only ever be exact
 * single-segment paths anyway.
 */
export const CODE_OWNED_FIRST_SEGMENTS = new Set([
  'admin',
  'api',
  'feed.xml',
  'llms-full.txt',
  'llms.txt',
  'manifest.webmanifest',
  'next',
  'robots.txt',
  'sitemap.xml',
])

/**
 * How far the cycle guard will walk before it refuses to keep looking.
 *
 * @remarks Far beyond {@link PATH_MAX_DEPTH}, so a healthy tree never
 * approaches it. Reaching it means the stored parent chain is longer than any
 * legal one — itself evidence the data is malformed — so the write is rejected
 * rather than accepted on the strength of a search that gave up.
 */
export const MAX_ANCESTOR_WALK = 32

/**
 * The id inside a Payload relationship value, which arrives as a bare id from
 * the API and as a populated document from a `depth > 0` read.
 *
 * @param value - Raw `parent` value from `data`, `originalDoc`, or a doc.
 * @returns The related document's id, or `null` when unset.
 */
export const parentIdOf = (value: unknown): number | string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in value) {
    const { id } = value as { id?: unknown }
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

/** A page reduced to what placement needs: its identity and its own placement. */
export type HierarchyRow = {
  id: number | string
  slug: string | null
  path: string | null
  parent: number | string | null
}

/**
 * Read one page's hierarchy row on the caller's transaction.
 *
 * @param req - The in-flight Payload request, so the read joins the same
 *   transaction the write is happening in.
 * @param id - Page id to read.
 * @returns The row, or `null` when the id does not resolve.
 */
export const readPageHierarchyRow = async (
  req: PayloadRequest,
  id: number | string,
): Promise<HierarchyRow | null> => {
  const doc = (await req.payload
    .findByID({
      collection: 'pages',
      depth: 0,
      disableErrors: true,
      id,
      overrideAccess: true,
      req,
      select: { parent: true, path: true, slug: true },
    })
    .catch(() => null)) as Partial<Page> | null

  if (!doc) return null
  return {
    id,
    parent: parentIdOf(doc.parent),
    path: typeof doc.path === 'string' ? doc.path : null,
    slug: typeof doc.slug === 'string' ? doc.slug : null,
  }
}

/**
 * The path prefix a parent page contributes to its children, without a trailing
 * slash.
 *
 * @param req - The in-flight Payload request.
 * @param parentId - Proposed parent page id, or `null` for no parent.
 * @returns `''` for an unparented document **and for a child of the site
 *   root**, else the parent's own path.
 *
 * @remarks The root contributes no segment, which is the storage half of the
 * root-page contract: the root serves `/`, so its children serve `/<child>`,
 * not `/home/<child>`. `publicPathFor` owns the read half. Falling back to the
 * parent's `slug` covers a parent row written before M1's backfill.
 */
export const parentPathPrefix = async (
  req: PayloadRequest,
  parentId: number | string | null,
): Promise<string> => {
  if (parentId === null) return ''
  const parent = await readPageHierarchyRow(req, parentId)
  if (!parent) {
    throw new APIError(
      'Parent page not found. Pick an existing page as the parent, or clear the field to place this document at the top level.',
      400,
    )
  }
  const parentPath = parent.path ?? parent.slug
  if (!parentPath || parentPath === ROOT_PAGE_SLUG) return ''
  return parentPath
}

/**
 * The path a document will be stored at: its ancestors' segments plus its own
 * slug.
 *
 * @param req - The in-flight Payload request.
 * @param slug - The document's own slug.
 * @param parentId - Proposed parent page id, or `null`.
 * @returns The root-relative path, with no leading or trailing slash.
 */
export const resolveChildPath = async (
  req: PayloadRequest,
  slug: string,
  parentId: number | string | null,
): Promise<string> => {
  const prefix = await parentPathPrefix(req, parentId)
  return prefix ? `${prefix}/${slug}` : slug
}

/**
 * Reject a composed path whose *shape* the site could never serve — malformed
 * segments, too deep, or under a first segment code owns.
 *
 * @param path - The computed root-relative path.
 *
 * @remarks Deliberately separate from the collision checks below: this half is
 * pure and needs no database, which is what lets it be unit-tested exhaustively
 * and what makes it the first thing every placement guard runs.
 */
export const assertPathShapeServable = (path: string): void => {
  const segments = path.split('/')

  if (segments.some((segment) => segment.length === 0)) {
    throw new APIError(
      `“${path}” is not a valid path: every segment needs a slug.`,
      400,
    )
  }

  if (segments.length > PATH_MAX_DEPTH) {
    throw new APIError(
      `Paths go at most ${PATH_MAX_DEPTH} levels deep, and “/${path}” is ${segments.length}. Move this document to a shallower parent.`,
      400,
    )
  }

  if (CODE_OWNED_FIRST_SEGMENTS.has(segments[0])) {
    throw new APIError(
      `“/${segments[0]}” is owned by the application, so a document saved under it could never be served. Pick a different first segment.`,
      400,
    )
  }
}

/**
 * Reject a composed path that a document in the *other* slug-routed collection
 * already serves.
 *
 * @param req - The in-flight Payload request.
 * @param collection - The collection being written.
 * @param docId - The document being written, or `null` on create.
 * @param path - The computed root-relative path.
 *
 * @remarks **Pages and Posts are separate tables, so no unique index can span
 * them.** A page at `work/brytecore` and a post placed at `work/brytecore` are
 * each legal to their own table and only one of them can win the URL — so the
 * rule has to live in code, and it has to be symmetric or the loser is simply
 * whichever document was saved second.
 *
 * Two shapes of collision exist, and both are checked:
 *
 * 1. **Path against path.** Since #153 a post can carry a `path`, so a page
 *    saving at `work/brytecore` must see a post already placed there, and vice
 *    versa.
 * 2. **Path against the `/articles/<slug>` namespace.** An *unplaced* post has
 *    no `path` at all, yet it still occupies `/articles/<slug>`. A page whose
 *    computed path is exactly `articles/<something>` therefore collides with a
 *    post that has no row to match on. The `/articles` prefix is read out of
 *    `SLUG_ROUTED_COLLECTIONS` rather than spelled here, so the check follows
 *    the map if that prefix ever moves.
 */
export const assertNoCrossCollectionCollision = async (
  req: PayloadRequest,
  collection: 'pages' | 'posts',
  docId: number | string | null,
  path: string,
): Promise<void> => {
  const other = collection === 'pages' ? 'posts' : 'pages'
  const publicPath = publicPathFor('pages', { path })

  const { docs } = await req.payload.find({
    collection: other,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { slug: true },
    where: { path: { equals: path } },
  })
  if (docs.length > 0) {
    throw new APIError(
      other === 'posts'
        ? `${publicPath} is already the article “${docs[0].slug}”. Two documents cannot share one URL.`
        : `${publicPath} is already the page “${docs[0].slug}”. Two documents cannot share one URL.`,
      400,
    )
  }

  // The `/articles/<slug>` namespace, which unplaced posts occupy without
  // carrying a `path`. Only a page can land in it — a placed post's path is
  // rejected by the Posts placement guard before it can ever be stored.
  if (collection !== 'pages') return
  const postSlug = postSlugCollidingWith(path)
  if (!postSlug) return
  const { docs: postClashes } = await req.payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { slug: true },
    where: { slug: { equals: postSlug } },
  })
  if (postClashes.length > 0) {
    throw new APIError(
      `${publicPath} is already the article “${postSlug}”. Two documents cannot share one URL.`,
      400,
    )
  }
}

/**
 * The Post slug that would be served at the same URL as this path, if any.
 *
 * @param path - A stored root-relative path, e.g. `articles/hello-world`.
 * @returns The colliding post's slug, or `null` when no unplaced-post URL can
 *   occupy this path.
 *
 * @remarks Derived from `SLUG_ROUTED_COLLECTIONS`' own prefix and compared
 * segment-wise, rather than by string-slicing a `publicPathFor` result. The
 * difference matters if the posts prefix ever changes: this follows the map,
 * where a hard-coded `'/articles/'.length` slice would quietly recover the
 * wrong slug and stop detecting real collisions.
 */
export const postSlugCollidingWith = (path: string): string | null => {
  const prefix = SLUG_ROUTED_COLLECTIONS.posts.replace(/^\//, '')
  const segments = path.split('/')
  // An unplaced post's URL is exactly the prefix plus one slug segment.
  if (segments.length !== 2 || segments[0] !== prefix) return null
  return segments[1] || null
}
