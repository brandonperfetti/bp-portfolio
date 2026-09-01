import type { PayloadRequest } from 'payload'

import type { SlugRoutedCollection } from './slugPaths'

/**
 * Ask the database which slug the *published* version of a document is
 * currently serving.
 *
 * @param req - The in-flight request, forwarded so the lookup joins the same
 * transaction as the write that triggered it.
 * @param collectionSlug - A slug-routed collection (`slugPaths.ts`).
 * @param id - The document id.
 * @returns The live slug, or `null` when the document has never been
 * published.
 *
 * @remarks This is the authoritative answer to "does a public URL exist for
 * this document, and what is it?". For a drafts-enabled collection Payload
 * writes the main table row on publish and keeps unpublished edits in the `_v`
 * versions table, so a row matching `_status: 'published'` is exactly the live
 * URL — and `originalDoc` is not, because after any autosave it is the draft
 * (see {@link capturePublishedSlug} for the measured version of that trap).
 *
 * **Why it is shared.** The two hooks that need it — `enforceSlugFreeze`
 * (should this slug be allowed to move?) and `capturePublishedSlug` (what was
 * it before this write?) — are opposite ends of the same #120 URL contract,
 * and each had its own copy of this query. Two copies of the query that
 * *defines* what "the live URL" means is exactly the thing that drifts: a
 * future `where` clause added to one (a locale filter, a tenant scope) and not
 * the other would let the freeze protect one slug while the redirect recorded
 * another.
 *
 * **Cost.** A single indexed lookup, selecting only `slug` at `depth: 0`. Both
 * callers reach it only on the paths that actually need it — a locked
 * published document whose slug is moving, and a publish that follows a draft.
 */
export const findPublishedSlug = async (
  req: PayloadRequest,
  collectionSlug: SlugRoutedCollection,
  id: number | string,
): Promise<null | string> => {
  const { docs } = await req.payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { slug: true },
    where: {
      and: [{ id: { equals: id } }, { _status: { equals: 'published' } }],
    },
  })
  const slug = (docs[0] as undefined | { slug?: unknown })?.slug
  return typeof slug === 'string' && slug.length > 0 ? slug : null
}
