import { APIError } from 'payload'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'payload'

import {
  assertNoCrossCollectionCollision,
  assertPathFreeInCollection,
  assertPathShapeServable,
  placementOf,
  postSlugCollidingWith,
  resolveChildPath,
} from '@/fields/slug/documentPath'
import { publicPathFor } from '@/fields/slug/slugPaths'
import type { Post } from '@/payload-types'

/**
 * Post placement (#153): an optional single-valued parent Page, and the
 * computed `path` that placement produces.
 *
 * @remarks **Placement is opt-in, and that is the whole design.** A post with
 * no `parent` stores `path: null` and `publicPathFor` answers
 * `/articles/<slug>` — byte for byte the v3 URL the tree has always served.
 * M2 writes no backfill, so every post that exists today is in exactly that
 * state and no existing URL moves. A post only leaves `/articles` when an
 * editor deliberately picks a parent page, which is a visible act with an
 * obvious URL consequence (D5, Brandon: no unlock is required for it — the
 * redirect is what preserves the contract).
 *
 * The composition rules, the depth cap, the code-owned segments and the
 * cross-collection collision guard are not re-derived here: they live in
 * `@/fields/slug/documentPath`, shared with the Pages hierarchy, because a page
 * and a placed post compete for the *same* URL namespace and a second copy of
 * any of those rules is a second chance for both to think they own
 * `/work/brytecore`.
 */

/**
 * Reject a placement that would put a post back inside the `/articles`
 * namespace it was placed out of.
 *
 * @param path - The computed root-relative path.
 *
 * @remarks A post placed under a page whose path is `articles` would compute
 * `articles/<slug>` — a path that is simultaneously its placed URL and the URL
 * every *unplaced* post with that slug already serves. The two are
 * indistinguishable to a reader, and `/articles/[slug]`'s early check would
 * compare a path to itself and never redirect. Rejecting it at save keeps the
 * placed and unplaced namespaces disjoint, which is what makes that check a
 * reliable signal.
 */
const assertNotInArticlesNamespace = (path: string): void => {
  if (postSlugCollidingWith(path)) {
    throw new APIError(
      `${publicPathFor('pages', { path })} is inside the article archive, which every unplaced article already shares. Pick a section page outside /articles as the parent.`,
      400,
    )
  }
}

/**
 * `beforeValidate` guard for post placement: rejects a write whose parent page
 * would produce a path the site cannot serve.
 *
 * Rejects, each with a message written for the editor who sees it: a parent
 * page that does not resolve, a path deeper than the shared cap, a first
 * segment owned by code, a path inside the `/articles` archive, a path another
 * article already serves, and a path a Page already serves.
 *
 * @remarks Runs before `beforeChange`, so {@link computePostPath} only ever
 * stores a path this hook has already accepted. It recomputes the path rather
 * than reading one off `data`: `path` is admin-read-only and hook-owned, so a
 * client-supplied value must never be what gets validated.
 *
 * **No cycle guard is needed and none exists.** A post's parent is a *Page*,
 * and a Page can never have a Post as an ancestor, so the parent chain cannot
 * come back around — the whole class of failure `validatePageHierarchy`'s
 * `assertAcyclic` exists for is structurally impossible here.
 */
export const validatePostPlacement: CollectionBeforeValidateHook<
  Post
> = async ({ data, originalDoc, req }) => {
  const { parentId, slug } = placementOf(data, originalDoc)
  // Unplaced is the default and needs no check at all: the post keeps
  // `/articles/<slug>`, which the slug field's own guards already own.
  if (parentId === null) return data
  // No slug yet (a create still deriving one from the title) means no path to
  // check. The slug field's own `required`/format hooks own that case.
  if (!slug) return data

  const docId = originalDoc?.id ?? data?.id ?? null
  const path = await resolveChildPath(req, slug, parentId)
  assertPathShapeServable(path)
  assertNotInArticlesNamespace(path)
  await assertPathFreeInCollection(req, 'posts', docId, path)
  await assertNoCrossCollectionCollision(req, 'posts', path)

  return data
}

/**
 * `beforeChange` hook that computes and stores a post's `path`.
 *
 * `path = parentPage.path + '/' + slug` when placed, and **`null` when not** —
 * with the site root contributing no segment, so a post placed directly under
 * the root serves `/<slug>`.
 *
 * @remarks Writing `null` on the unplaced branch is the load-bearing half. It
 * is what makes un-placing a post a real operation rather than a no-op, and it
 * is what keeps `publicPathFor`'s "has a path ⇒ has been placed" test honest:
 * if this hook ever wrote `path = slug` for an unplaced post, every article on
 * the site would move from `/articles/hello` to `/hello` in one deploy.
 *
 * **This hook does not cascade.** Moving the *parent page* leaves a placed
 * post's stored path stale until the post is itself saved — the same
 * deliberate limit `computePagePath` records, for the same reason: the cascade
 * needs the subtree redirect fan-out that is #150's ground, and landing one
 * without the other moves live URLs with nothing preserving the old ones.
 */
export const computePostPath: CollectionBeforeChangeHook<Post> = async ({
  data,
  originalDoc,
  req,
}) => {
  const { parentId, slug } = placementOf(data, originalDoc)
  if (parentId === null) return { ...data, path: null }
  if (!slug) return data
  return { ...data, path: await resolveChildPath(req, slug, parentId) }
}
