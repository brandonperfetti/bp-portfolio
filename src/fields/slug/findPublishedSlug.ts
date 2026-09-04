import type { PayloadRequest } from 'payload'

import type { SlugRoutedCollection } from './slugPaths'

/**
 * As much of the published row as a caller can need to name its public URL.
 *
 * @remarks `path` is the computed, stored, root-relative path. Pages always
 * carry one; Posts carry one only when placed (#153). Both members are optional
 * because this is a `select`ed projection, not a full document.
 */
export type PublishedRow = {
  /** The computed public path, or `null`/absent when the document is unplaced. */
  path?: unknown
  /** The slug the document is published under. */
  slug?: unknown
}

/**
 * Ask the database which row the *published* version of a document is currently
 * serving, projected to just the fields that name its URL.
 *
 * @param req - The in-flight request, forwarded so the lookup joins the same
 * transaction as the write that triggered it.
 * @param collectionSlug - A slug-routed collection (`slugPaths.ts`).
 * @param id - The document id.
 * @returns The published row's `{ slug, path }`, or `null` when the document has
 * never been published.
 *
 * @remarks **This function owns the `where` clause that defines "the live
 * URL".** That is the whole point of it living here: for a drafts-enabled
 * collection Payload writes the main table row on publish and keeps unpublished
 * edits in the `_v` versions table, so a row matching `_status: 'published'` is
 * exactly the live URL — and `originalDoc` is not, because after any autosave it
 * is the draft (see {@link capturePublishedSlug} for the measured version of
 * that trap).
 *
 * A second copy of this query elsewhere is the thing that drifts: a future
 * `where` clause added to one and not the other (a locale filter, a tenant
 * scope) would let one caller protect a slug while another recorded a different
 * one. #155 briefly had exactly that — a `findPublishedRow` inside
 * `capturePublishedSlug` that needed `path` as well as `slug` — and it is folded
 * back here instead, with {@link findPublishedSlug} kept as the thin slug-only
 * wrapper the other three callers already use.
 *
 * **Cost.** A single indexed lookup at `depth: 0` selecting two columns. Every
 * caller reaches it only on the paths that actually need it.
 */
export const findPublishedRow = async (
  req: PayloadRequest,
  collectionSlug: SlugRoutedCollection,
  id: number | string,
): Promise<null | PublishedRow> => {
  const { docs } = await req.payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { path: true, slug: true },
    where: {
      and: [{ id: { equals: id } }, { _status: { equals: 'published' } }],
    },
  })
  return (docs[0] as PublishedRow | undefined) ?? null
}

/**
 * Ask the database which slug the *published* version of a document is
 * currently serving.
 *
 * @param req - The in-flight request, forwarded so the lookup joins the same
 * transaction as the write that triggered it.
 * @param collectionSlug - A slug-routed collection (`slugPaths.ts`).
 * @param id - The document id.
 * @returns The live slug, or `null` when the document has never been published.
 *
 * @remarks The slug-only face of {@link findPublishedRow}, kept because most
 * callers genuinely only ask "does a public URL exist for this document, and
 * what is its slug?" — `enforceSlugFreeze` (should this slug be allowed to
 * move?), `refuseNestedSlugRename` and `refusePlacedSlugRename` (has this ever
 * been published?). Callers that must name a *placed* document's URL need the
 * row, because a slug alone cannot produce `/work/brytecore` (#148).
 *
 * It delegates rather than issuing its own query, so the `where` that decides
 * what "published" means exists exactly once.
 */
export const findPublishedSlug = async (
  req: PayloadRequest,
  collectionSlug: SlugRoutedCollection,
  id: number | string,
): Promise<null | string> => {
  const slug = (await findPublishedRow(req, collectionSlug, id))?.slug
  return typeof slug === 'string' && slug.length > 0 ? slug : null
}
