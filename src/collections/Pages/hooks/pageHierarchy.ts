import { APIError } from 'payload'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'

import { ROOT_PAGE_SLUG, publicPathFor } from '@/fields/slug/slugPaths'
import type { Page } from '@/payload-types'

/**
 * Maximum number of segments a page path may carry — `/a/b/c` (Brandon, D3 on
 * #148).
 *
 * @remarks A cap, not a technical limit: the catch-all resolves any depth in
 * one indexed read. Three segments is the depth past which a URL stops being
 * navigable and a breadcrumb stops fitting, and holding the line here is what
 * keeps `generateStaticParams`' param arrays a predictable shape.
 */
export const PAGE_PATH_MAX_DEPTH = 3

/**
 * First path segments owned by code, which a Pages document may therefore never
 * occupy at any depth beneath them.
 *
 * @remarks **This is a different set from `RESERVED_PAGE_SLUGS`, and the
 * difference is load-bearing (#148 premise clarification).**
 *
 * `RESERVED_PAGE_SLUGS` (`src/lib/cms/pagesRepo.ts`) lists slugs whose *root*
 * path is rendered by a dedicated Next route — `about`, `tech`, `projects`,
 * `uses`, `corvus`, `articles`. A Pages document is not merely allowed to exist
 * at those paths, it is how they get their copy: `/about`, `/tech`, `/uses`,
 * `/projects`, `/corvus` and `/articles` each read a Pages doc through
 * `getCmsPageByPath` `[measured, c973b54]`. Reserving them at *validation*
 * would make the live `about` and `articles` documents unsaveable. What
 * `RESERVED_PAGE_SLUGS` actually buys is an *emit* exclusion — those paths must
 * not be produced by the catch-all, `generateStaticParams`, or the sitemap,
 * because a dedicated route already serves them — and under hierarchy that
 * exclusion narrows to the **first segment**, which is what lets `/tech/ai`
 * resolve while `/tech` stays the dedicated route (Brandon, D1).
 *
 * The set below is the genuinely hard reservation: paths under Next's own
 * route tree and the metadata routes. Nothing behind these can ever render a
 * Pages document, and unlike the dedicated routes there is no doc-behind-the-
 * route pattern that would make one useful. Saving a page there is always a
 * silent mistake, so it is rejected at validation instead.
 *
 * `api`, `admin` and `next` are matched as **first segments** because Next owns
 * their whole subtree (`/api/*`, `/admin/*`, `/next/*`); the file-shaped
 * entries can only ever be exact single-segment paths anyway.
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

/** How far the cycle guard will walk before declaring the chain broken. */
const MAX_ANCESTOR_WALK = 32

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

/** A page reduced to what the hierarchy needs: its identity and its placement. */
type HierarchyRow = {
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
const readHierarchyRow = async (
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
 * The path prefix a parent contributes to its children, without a trailing
 * slash.
 *
 * @param req - The in-flight Payload request.
 * @param parentId - Proposed parent id, or `null` for a top-level page.
 * @returns `''` for a top-level page **and for a child of the site root**, else
 *   the parent's own path.
 *
 * @remarks The root contributes no segment, which is the storage half of the
 * root-page contract: the root serves `/`, so its children serve `/<child>`,
 * not `/home/<child>`. `publicPathFor` owns the read half. Falling back to the
 * parent's `slug` covers a parent row written before M1's backfill.
 */
const parentPathPrefix = async (
  req: PayloadRequest,
  parentId: number | string | null,
): Promise<string> => {
  if (parentId === null) return ''
  const parent = await readHierarchyRow(req, parentId)
  if (!parent) {
    throw new APIError(
      'Parent page not found. Pick an existing page as the parent, or clear the field to place this page at the top level.',
      400,
    )
  }
  const parentPath = parent.path ?? parent.slug
  if (!parentPath || parentPath === ROOT_PAGE_SLUG) return ''
  return parentPath
}

/**
 * The path a page will be stored at: its ancestors' segments plus its own slug.
 *
 * @param req - The in-flight Payload request.
 * @param slug - The page's own slug.
 * @param parentId - Proposed parent id, or `null`.
 * @returns The root-relative path, with no leading or trailing slash.
 */
export const resolvePagePath = async (
  req: PayloadRequest,
  slug: string,
  parentId: number | string | null,
): Promise<string> => {
  const prefix = await parentPathPrefix(req, parentId)
  return prefix ? `${prefix}/${slug}` : slug
}

/**
 * The `slug` and `parent` a write will land, merging the incoming partial over
 * the stored document — a PATCH that sends only `title` must still compute the
 * same path the document already has.
 *
 * @param data - Incoming write payload.
 * @param originalDoc - The stored document, when this is an update.
 */
const placementOf = (
  data: Partial<Page> | undefined,
  originalDoc: Partial<Page> | undefined,
): { slug: string | null; parentId: number | string | null } => {
  const rawSlug = data?.slug ?? originalDoc?.slug
  return {
    parentId: parentIdOf(
      data && 'parent' in data ? data.parent : originalDoc?.parent,
    ),
    slug: typeof rawSlug === 'string' && rawSlug ? rawSlug : null,
  }
}

/**
 * Reject a `parent` that would make the tree cyclic.
 *
 * @param req - The in-flight Payload request.
 * @param docId - The document being written, or `null` on create.
 * @param parentId - Proposed parent id.
 *
 * @remarks Walks up from the proposed parent rather than down from the
 * document, so the cost is the ancestor depth (≤ {@link PAGE_PATH_MAX_DEPTH} in
 * a healthy tree) and never the subtree size. The walk is bounded independently
 * at {@link MAX_ANCESTOR_WALK} so a chain already corrupted in the database
 * cannot hang a save.
 */
const assertAcyclic = async (
  req: PayloadRequest,
  docId: number | string | null,
  parentId: number | string | null,
): Promise<void> => {
  if (parentId === null || docId === null) return

  if (String(parentId) === String(docId)) {
    throw new APIError('A page cannot be its own parent.', 400)
  }

  const seen = new Set<string>([String(docId)])
  let cursor: number | string | null = parentId

  for (let step = 0; step < MAX_ANCESTOR_WALK && cursor !== null; step += 1) {
    const key = String(cursor)
    if (seen.has(key)) {
      throw new APIError(
        'That parent is a descendant of this page, which would create a loop. Pick a page outside this page’s own subtree.',
        400,
      )
    }
    seen.add(key)
    const row: HierarchyRow | null = await readHierarchyRow(req, cursor)
    cursor = row?.parent ?? null
  }
}

/**
 * Reject a computed path that cannot be served, or that would shadow or be
 * shadowed by something already at that URL.
 *
 * @param req - The in-flight Payload request.
 * @param docId - The document being written, or `null` on create.
 * @param path - The computed root-relative path.
 */
const assertPathServable = async (
  req: PayloadRequest,
  docId: number | string | null,
  path: string,
): Promise<void> => {
  const segments = path.split('/')

  if (segments.some((segment) => segment.length === 0)) {
    throw new APIError(
      `“${path}” is not a valid page path: every segment needs a slug.`,
      400,
    )
  }

  if (segments.length > PAGE_PATH_MAX_DEPTH) {
    throw new APIError(
      `Page paths go at most ${PAGE_PATH_MAX_DEPTH} levels deep, and “/${path}” is ${segments.length}. Move this page to a shallower parent.`,
      400,
    )
  }

  if (CODE_OWNED_FIRST_SEGMENTS.has(segments[0])) {
    throw new APIError(
      `“/${segments[0]}” is owned by the application, so a page saved under it could never be served. Pick a different first segment.`,
      400,
    )
  }

  const publicPath = publicPathFor('pages', { path })

  // Same-collection collision. The unique index on `path` is the real
  // enforcement; this read exists to answer with a sentence an editor can act
  // on instead of a Postgres constraint name.
  const { docs: pageClashes } = await req.payload.find({
    collection: 'pages',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { slug: true },
    where: { path: { equals: path } },
  })
  const pageClash = pageClashes[0]
  if (pageClash && String(pageClash.id) !== String(docId)) {
    throw new APIError(
      `Another page already serves ${publicPath}. Change this page’s slug or its parent.`,
      400,
    )
  }

  // Cross-collection collision. Pages and Posts are separate tables, so no
  // unique index can span them — a page at `articles/<x>` and the post served
  // at `/articles/<x>` are both legal to their own table and only one can win.
  // Posts are read-only to this hook: nothing here changes their schema (#153
  // owns post placement).
  const articlePrefix = '/articles/'
  if (publicPath?.startsWith(articlePrefix)) {
    const postSlug = publicPath.slice(articlePrefix.length)
    if (postSlug && !postSlug.includes('/')) {
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
  }
}

/**
 * `beforeValidate` guard for the Pages hierarchy: rejects a write whose
 * placement would produce a path the site cannot serve.
 *
 * Rejects, each with a message written for the editor who sees it: a page made
 * its own parent, a parent inside the page's own subtree, a path deeper than
 * {@link PAGE_PATH_MAX_DEPTH}, a first segment owned by code
 * ({@link CODE_OWNED_FIRST_SEGMENTS}), a path another page already serves, and
 * a path that collides with a Post's `/articles/…` URL.
 *
 * @remarks Runs before `beforeChange`, so {@link computePagePath} only ever
 * stores a path this hook has already accepted. It deliberately recomputes the
 * path rather than reading one off `data`: `path` is admin-read-only and
 * hook-owned, so a client-supplied value must never be what gets validated.
 */
export const validatePageHierarchy: CollectionBeforeValidateHook<
  Page
> = async ({ data, originalDoc, req }) => {
  const { parentId, slug } = placementOf(data, originalDoc)
  // No slug yet (a create still deriving one from the title) means no path to
  // check. The slug field's own `required`/format hooks own that case.
  if (!slug) return data

  const docId = originalDoc?.id ?? data?.id ?? null
  await assertAcyclic(req, docId, parentId)
  const path = await resolvePagePath(req, slug, parentId)
  await assertPathServable(req, docId, path)

  return data
}

/**
 * `beforeChange` hook that computes and stores a page's `path`.
 *
 * `path = parent ? parent.path + '/' + slug : slug`, with the site root
 * contributing no segment so its children serve `/<child>`.
 *
 * @remarks The stored path is what makes resolution one indexed equality read
 * instead of a per-request ancestor walk, and what makes `path` uniquely
 * indexable — the two properties the whole routing design rests on.
 *
 * **This hook does not cascade to descendants.** Moving a parent leaves its
 * children's stored paths stale until they are themselves saved. That is
 * deliberate for this change: the cascade and the redirect fan-out that must
 * accompany it are #150's ground (the #120 machinery extension), and a cascade
 * landing here without the matching redirect rows would move a subtree of live
 * URLs with nothing preserving the old ones — the exact failure #120 exists to
 * prevent. Named in `docs/NAVIGATION.md`.
 */
export const computePagePath: CollectionBeforeChangeHook<Page> = async ({
  data,
  originalDoc,
  req,
}) => {
  const { parentId, slug } = placementOf(data, originalDoc)
  if (!slug) return data
  return { ...data, path: await resolvePagePath(req, slug, parentId) }
}
