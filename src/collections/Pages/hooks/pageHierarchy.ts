import { APIError } from 'payload'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'

import { revalidatePath } from 'next/cache'

import {
  MAX_ANCESTOR_WALK,
  assertNoCrossCollectionCollision,
  assertPathFreeInCollection,
  assertPathShapeServable,
  placementOf,
  readPageHierarchyRow,
  resolveChildPath,
} from '@/fields/slug/documentPath'
import {
  type SlugRoutedCollection,
  publicPathFor,
} from '@/fields/slug/slugPaths'
import { readPreviousPublishedStoredPath } from '@/hooks/capturePublishedSlug'
import type { Page } from '@/payload-types'

/**
 * Reject a `parent` that would make the tree cyclic.
 *
 * @param req - The in-flight Payload request.
 * @param docId - The document being written, or `null` on create.
 * @param parentId - Proposed parent id.
 *
 * @remarks Walks up from the proposed parent rather than down from the
 * document, so the cost is the ancestor depth (≤ `PATH_MAX_DEPTH` in
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
 * @remarks Three rules, all shared with Posts and none of them spelled here:
 * shape (malformed segments, depth, code-owned first segment) in
 * `assertPathShapeServable`, the same-collection read in
 * `assertPathFreeInCollection`, and the cross-collection read in
 * `assertNoCrossCollectionCollision` — which #153 made symmetric, since a
 * placed post now carries a `path` of its own for this check to see.
 */
const assertPathServable = async (
  req: PayloadRequest,
  docId: number | string | null,
  path: string,
): Promise<void> => {
  assertPathShapeServable(path)
  await assertPathFreeInCollection(req, 'pages', docId, path)
  await assertNoCrossCollectionCollision(req, 'pages', path)
}

/**
 * `beforeValidate` guard for the Pages hierarchy: rejects a write whose
 * placement would produce a path the site cannot serve.
 *
 * Rejects, each with a message written for the editor who sees it: a page made
 * its own parent, a parent inside the page's own subtree, a path deeper than
 * `PATH_MAX_DEPTH`, a first segment owned by code
 * (`CODE_OWNED_FIRST_SEGMENTS`), a path another page already serves, and a path
 * that collides with a Post's URL — placed or in the `/articles` namespace.
 * All four of those rules live in `@/fields/slug/documentPath`, shared with
 * Posts (#153), because a page and a placed post compete for one namespace.
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
  const path = await resolveChildPath(req, slug, parentId)
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
 * **This hook computes one document's path and nothing else.** Recomputing the
 * subtree beneath a moved page is {@link cascadePagePaths}' job, in
 * `afterChange` — it cannot happen here, because the descendants' new paths are
 * composed from a value this hook has not written yet.
 */
export const computePagePath: CollectionBeforeChangeHook<Page> = async ({
  data,
  originalDoc,
  req,
}) => {
  const { parentId, slug } = placementOf(data, originalDoc)
  if (!slug) return data
  return { ...data, path: await resolveChildPath(req, slug, parentId) }
}

/** A descendant found by the prefix read, reduced to what the cascade needs. */
type Descendant = {
  collection: SlugRoutedCollection
  id: number | string
  /** The stored path the document had BEFORE the move. */
  path: string
}

/**
 * Every Page and Post stored beneath `prefix`, shallowest first.
 *
 * @param req - The in-flight request, so the reads join the move's transaction.
 * @param prefix - The moved page's OLD stored path, e.g. `work`.
 * @returns Descendants ordered by depth ascending.
 *
 * @remarks **Two reads, one per collection, both on the indexed `path` column,
 * and neither is recursive.** A subtree is a string prefix in this schema —
 * that is the whole reason `path` is stored rather than walked (`documentPath.ts`)
 * — so "everything under `work`" is one `where`, not a tree traversal.
 *
 * **Why `like` and then a second filter in JS.** Payload's `like` compiles to
 * `ILIKE '%value%'` — a *contains*, not a prefix — so `work/` also matches
 * `homework/deep`. The read is still the right read (it is indexed and it is
 * one round trip); the exact predicate is re-applied here so the cascade cannot
 * renumber a document that merely shares a substring. The alternative,
 * hand-writing SQL to get `LIKE 'work/%'`, would put a second path vocabulary
 * next to Payload's own.
 *
 * **Shallowest first is load-bearing.** Each descendant is written through
 * `payload.update`, which re-runs {@link computePagePath} / `computePostPath`,
 * and those compose the child's path from its PARENT's stored path. Update a
 * grandchild before its parent and the recomputation reads a path that has not
 * moved yet, quietly writing the old prefix back. This ordering is the ONLY
 * thing that makes the recomputation correct, which is why the cascade never
 * supplies a path of its own — see the note on what this hook does not compute, below.
 */
const readSubtree = async (
  req: PayloadRequest,
  prefix: string,
): Promise<Descendant[]> => {
  const found: Descendant[] = []

  for (const collection of ['pages', 'posts'] as const) {
    const { docs } = await req.payload.find({
      collection,
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      req,
      select: { path: true },
      where: { path: { like: `${prefix}/` } },
    })
    for (const doc of docs as Array<{ id?: unknown; path?: unknown }>) {
      const path = typeof doc.path === 'string' ? doc.path : ''
      if (!path.startsWith(`${prefix}/`)) continue
      if (typeof doc.id !== 'number' && typeof doc.id !== 'string') continue
      found.push({ collection, id: doc.id, path })
    }
  }

  return found.sort(
    (a, b) => a.path.split('/').length - b.path.split('/').length,
  )
}

/**
 * `afterChange` hook that moves a page's whole subtree with it (#150).
 *
 * Recomputes every descendant Page's and placed Post's stored `path` by
 * swapping the moved page's old path prefix for its new one, and purges each
 * descendant's old URL so it stops serving a prerendered shell.
 *
 * @remarks **What it does NOT do: write one redirect row per descendant.**
 * Inbound coverage for the subtree is one `matchDescendants` prefix row on the
 * moved page itself (D4, Brandon 2026-09-02) — O(1) rows per move rather than
 * O(subtree), which matters because `getCmsRedirects` reads at most
 * `REDIRECT_LIMIT = 500` rows and a handful of reorganisations on a site with a
 * few hundred articles walks toward that ceiling. So each descendant update
 * carries `disableSlugRedirect: true`: without it every descendant would write
 * its own row and the prefix row would be decoration.
 *
 * **What it does NOT suppress: `refreshCorvusEmbeddings`.** A placed post under
 * a moved page has genuinely changed its `sourceUrl`, so its embeddings must be
 * re-derived — the cascade flag is `disablePathCascade` and nothing else reads
 * it. The cost is real and is stated here rather than discovered later: a
 * section rename triggers an embedding refresh proportional to the subtree
 * size. That is correct behaviour, not a bug.
 *
 * **What this hook does not compute: the new paths.** Each descendant is
 * updated with an EMPTY `data`, and its own collection's `beforeChange`
 * (`computePagePath` / `computePostPath`) recomputes the path from the parent's
 * stored path plus the document's own slug. That is the single authority on how
 * a path is composed, and there is deliberately no second copy of it here.
 *
 * An earlier cut passed `data: { path: <prefix-swapped> }` as well. It was
 * dead in the ordinary case — `beforeChange` overwrote it with the same value —
 * and actively misleading in the interesting one: the two expressions can only
 * ever disagree when something is wrong (a stale parent, a slug changed in the
 * same request), and in exactly that case the hand-computed value would be the
 * one silently discarded, so the field looked authoritative while proving
 * nothing. Passing nothing makes the recomputation's authority a fact rather
 * than a coincidence. The prefix swap survives only where it is genuinely
 * needed: {@link readSubtree}'s ordering and the purge of the path each
 * descendant vacated, both of which use the descendant's OLD path.
 *
 * **Recursion control.** Each descendant `payload.update` fires this same hook
 * for that descendant, which would then re-read ITS subtree — a depth-3 move
 * would be quadratic. `context: { disablePathCascade: true }` is the stop, and
 * the update count is pinned by a test rather than left to inspection.
 *
 * **The old prefix comes from `capturePublishedSlug`'s stash, not from
 * `previousDoc`.** Same measured trap as the redirect writer: with autosave on,
 * `previousDoc` is the autosaved draft, whose `path` this collection's own
 * `beforeChange` already recomputed to the NEW value. Reading it here would
 * compute `oldPath === newPath` and cascade nothing, on exactly the admin path
 * this hook exists for.
 *
 * **Failure posture is deliberately asymmetric, and different from the redirect
 * writer's.** `createPathRedirect` swallows its own failure because a missing
 * redirect row must never fail an editor's publish. A half-cascaded subtree is
 * not a missing redirect, it is a set of documents whose stored paths disagree
 * with where they are served — so these writes are NOT wrapped: they run on the
 * caller's transaction and are allowed to roll the move back. A move that
 * cannot take its children with it should not happen at all.
 */
export const cascadePagePaths: CollectionAfterChangeHook<Page> = async ({
  context,
  doc,
  operation,
  req,
}) => {
  if (operation !== 'update') return doc
  if (context?.disablePathCascade) return doc

  // `req.context` first, for the same reason the redirect writer reads it
  // there: a nested Local API call swaps it and detaches the argument.
  const previousContext = req.context ?? context
  const oldPath = readPreviousPublishedStoredPath(
    previousContext,
    'pages',
    doc.id,
  )
  const newPath =
    typeof doc.path === 'string' && doc.path.length > 0 ? doc.path : null
  if (!oldPath || !newPath || oldPath === newPath) return doc

  const descendants = await readSubtree(req, oldPath)
  if (descendants.length === 0) return doc

  for (const descendant of descendants) {
    await req.payload.update({
      collection: descendant.collection,
      context: {
        // NOT a spread of the caller's context: the only flags that should
        // travel are the two named here plus the editor's own revalidate
        // switch. Carrying the whole bag would forward this move's captured
        // paths onto every descendant's own redirect logic.
        disablePathCascade: true,
        disableRevalidate: context?.disableRevalidate === true,
        disableSlugRedirect: true,
      },
      // EMPTY, deliberately — see "What this hook does not compute" above.
      data: {},
      id: descendant.id,
      overrideAccess: true,
      req,
    })

    // The vacated URL, purged in the same expression that moved the document —
    // the ownership rule `createPathRedirect` states for a renamed row applies
    // here too: whoever moves a path purges the path it moved off. Each
    // descendant's own revalidation hook purges its NEW path.
    if (!context?.disableRevalidate) {
      const vacated = publicPathFor(descendant.collection, {
        path: descendant.path,
      })
      if (vacated) revalidatePath(vacated)
    }
  }

  req.payload.logger.info(
    `Subtree moved: ${oldPath} -> ${newPath} (${descendants.length} descendant${
      descendants.length === 1 ? '' : 's'
    })`,
  )

  return doc
}
