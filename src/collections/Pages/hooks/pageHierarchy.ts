import { APIError } from 'payload'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'

import {
  CODE_OWNED_FIRST_SEGMENTS,
  MAX_ANCESTOR_WALK,
  PATH_MAX_DEPTH,
  assertNoCrossCollectionCollision,
  assertPathShapeServable,
  parentIdOf,
  readPageHierarchyRow,
  resolveChildPath,
} from '@/fields/slug/documentPath'
import { publicPathFor } from '@/fields/slug/slugPaths'
import type { Page } from '@/payload-types'

/**
 * Maximum number of segments a page path may carry — `/a/b/c` (Brandon, D3 on
 * #148).
 *
 * @remarks Re-exported from `@/fields/slug/documentPath`, which owns it now
 * that Posts compose paths the same way (#153). One cap, one namespace.
 */
export const PAGE_PATH_MAX_DEPTH = PATH_MAX_DEPTH

export { CODE_OWNED_FIRST_SEGMENTS, parentIdOf }

/**
 * The path a page will be stored at: its ancestors' segments plus its own slug.
 *
 * @param req - The in-flight Payload request.
 * @param slug - The page's own slug.
 * @param parentId - Proposed parent id, or `null`.
 * @returns The root-relative path, with no leading or trailing slash.
 */
export const resolvePagePath = resolveChildPath

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
 * cannot hang a save — and hitting that bound **rejects**. A guard that ran out
 * of budget has not proved the write is safe, and silently accepting on an
 * exhausted search is how a cycle guard comes to certify a cycle.
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

  for (let step = 0; step < MAX_ANCESTOR_WALK; step += 1) {
    if (cursor === null) return
    const key = String(cursor)
    if (seen.has(key)) {
      throw new APIError(
        'That parent is a descendant of this page, which would create a loop. Pick a page outside this page’s own subtree.',
        400,
      )
    }
    seen.add(key)
    const row = await readPageHierarchyRow(req, cursor)
    cursor = row?.parent ?? null
  }

  throw new APIError(
    `That parent sits under more than ${MAX_ANCESTOR_WALK} ancestors, which no valid page tree has. The parent chain is broken — fix it before reparenting this page.`,
    400,
  )
}

/**
 * Reject a computed path that cannot be served, or that would shadow or be
 * shadowed by something already at that URL.
 *
 * @param req - The in-flight Payload request.
 * @param docId - The document being written, or `null` on create.
 * @param path - The computed root-relative path.
 *
 * @remarks Shape (malformed segments, depth, code-owned first segment) is the
 * pure half and lives in `assertPathShapeServable`; the two collision reads are
 * here and in `assertNoCrossCollectionCollision`, which #153 made symmetric —
 * a placed post now carries a `path` of its own, so this check has to see one.
 */
const assertPathServable = async (
  req: PayloadRequest,
  docId: number | string | null,
  path: string,
): Promise<void> => {
  assertPathShapeServable(path)

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

  await assertNoCrossCollectionCollision(req, 'pages', docId, path)
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
