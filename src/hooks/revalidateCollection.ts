import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

import { containRevalidation } from '@/hooks/containRevalidation'

/**
 * Resolve the extra paths a collection write must purge, on top of the static
 * list its hook was built with.
 *
 * @remarks Declared HERE, in the generic module, and imported by the
 * collection-specific ones. The dependency runs one way on purpose: this module
 * is the seam every collection's hooks are built from, and a seam that imports
 * a type from one of its own consumers (`workHistorySurfaces.ts`) is a cycle
 * waiting for the second consumer.
 *
 * Deliberately `(args) => Promise<string[]>` and not a bare `Promise<string[]>`:
 * the afterChange and afterDelete sides need the SAME shape but resolve from
 * different places — a live query on one, a `beforeDelete` capture on the other
 * — and the builders below should not have to know which.
 *
 * A resolver **should not** throw or reject; it returns `[]` when it cannot
 * answer. That is a contract, and {@link resolveThenPurge} does not rely on it:
 * a rejecting resolver is caught there and the static paths are purged anyway.
 * A contract nobody can enforce is a comment; the `catch` is the guarantee.
 */
export type SurfacePathResolver = (args: {
  /** The document id the write is about. */
  id: unknown
  /** The in-flight request, for its Payload instance and logger. */
  req: PayloadRequest
}) => Promise<string[]>

/**
 * The whole purge for one collection: its data-cache tag, then every consumer
 * route's shell.
 *
 * @remarks Named and shared for the same reason `purgePostSurfaces` is one
 * collection over: the afterChange and afterDelete hooks below need the
 * identical group, and a copy that purged the tag but not the paths would be a
 * silent staleness bug of exactly the kind the `@remarks` above
 * {@link revalidateCollectionTag} records. It is also the unit of containment —
 * see {@link collectionSurfaces}.
 */
const purgeCollectionSurfaces = (tag: string, paths: string[]) => () => {
  revalidateTag(tag, { expire: 0 })
  for (const path of paths) {
    revalidatePath(path)
  }
}

/** What {@link purgeCollectionSurfaces} covers, for the containment log line. */
const collectionSurfaces = (tag: string, paths: string[]) =>
  `the ${tag} tag and the paths ${paths.join(', ') || '(none)'}`

/**
 * The static path list plus whatever a {@link SurfacePathResolver} derived,
 * with duplicates collapsed.
 *
 * @remarks Order is static-first so a log line still opens with the surfaces a
 * reader can find by reading the collection config. The dedupe is not cosmetic:
 * a `workHistoryCard` block on the ROOT page derives `/`, which is also the
 * static entry, and `revalidatePath` twice for one path is a wasted purge in
 * the middle of a transaction.
 */
const mergePaths = (paths: string[], derived: string[]) => [
  ...new Set([...paths, ...derived]),
]

/**
 * The resolver half of both builders: no resolver ⇒ purge the static paths
 * synchronously; a resolver ⇒ purge static + derived once it settles, and purge
 * the static paths alone if it does not.
 *
 * @param resolvePaths - The optional resolver, or `undefined`.
 * @param args - What the resolver is called with (`id` and the request).
 * @param paths - The static path list, purged in every branch.
 * @param purge - Runs the contained purge for a final path list.
 * @param payload - For the logger, on the rejection branch.
 * @returns `undefined` on the synchronous branch, a promise on the resolver
 *   branch — the caller returns `doc` either way, so Payload awaits or does not
 *   as appropriate.
 *
 * @remarks **Why one helper and not the shape twice.** The two builders had the
 * identical `if (!resolvePaths) … else …then(…)` body, which is the shape that
 * drifts: one side gaining a `.catch` while the other does not would make the
 * fail-open guarantee one-and-a-half guarantees. `containRevalidation`'s own
 * docblock makes exactly this argument for exactly this reason, one layer down.
 *
 * **Why the `catch` exists even though resolvers promise not to reject.**
 * {@link SurfacePathResolver} says a resolver returns `[]` rather than throwing,
 * and the one shipped resolver honours it. That is a contract, and a contract
 * is enforced by whoever depends on it: a rejection here would escape into
 * Payload's `afterChange`/`afterDelete`, reach `killTransaction`, and roll back
 * the very document the purge was for — the #156 failure, arriving through the
 * one door #156's containment does not cover. Structural beats contractual. The
 * static paths still purge, so a broken resolver costs the DERIVED surfaces and
 * nothing more.
 */
const resolveThenPurge = (
  resolvePaths: SurfacePathResolver | undefined,
  args: { id: unknown; req: PayloadRequest },
  paths: string[],
  purge: (all: string[]) => void,
  payload: PayloadRequest['payload'],
): Promise<void> | undefined => {
  if (!resolvePaths) {
    purge(paths)
    return undefined
  }

  return resolvePaths(args)
    .then((derived) => {
      purge(mergePaths(paths, derived))
    })
    .catch((error: unknown) => {
      payload.logger.error(
        { err: error },
        `Failed to resolve the derived surfaces; purging the static paths ${paths.join(', ') || '(none)'} alone (#207, #156)`,
      )
      purge(paths)
    })
}

/**
 * Build afterChange/afterDelete hooks that revalidate a collection's data
 * cache tag AND the static routes that render it, so admin and MCP edits
 * go live without a redeploy.
 *
 * @remarks The frontend reads these collections through `unstable_cache`
 * repos keyed by tag ('tech-stack', 'uses', 'work-history', 'projects').
 * Two purges are required, not one: `revalidateTag` clears the data cache
 * but does NOT regenerate a statically prerendered route's shell, so
 * tag-only revalidation left pages (e.g. the home Work card) serving the
 * build-time prerender indefinitely — verified live on staging when
 * work-history edits never surfaced despite the tag purge logging. Pairing
 * `revalidatePath` for each consumer route matches the proven Pages hook
 * pattern (`revalidatePage.ts`).
 *
 * Limitation, and how far it now reaches: a layout-builder page that embeds a
 * collection-driven block is not in the static `paths` list, so it used to
 * refresh only when that page was next edited or deployed. That is #207, and
 * for `work-history` it is closed — `resolvePaths` below derives those pages
 * from the block relationship. Every OTHER collection here still passes a
 * static list only, so the limitation stands for them: a block that renders
 * `projects`, `uses` or `tech-stack` on an arbitrary page is still outside the
 * purge. `workHistorySurfaces.ts` is the pattern to copy when one of those
 * gains a second surface.
 *
 * `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so a save keeps
 * serving old content until a background refresh happens to land AND
 * re-caches that stale render into the CDN in the meantime. `{ expire: 0 }`
 * expires the entry outright instead, so the first post-edit regeneration
 * blocks for fresh data rather than serve-stale-then-refresh.
 *
 * That is an EXPIRATION profile, not read-your-writes. `updateTag` is the
 * read-your-writes API and it is Server-Action-only; this hook runs in a
 * Route Handler, where `revalidateTag(tag, { expire: 0 })` is the documented
 * way to expire immediately (Next 16.3.0 docs, `revalidateTag` /
 * `updateTag`).
 *
 * **A revalidation failure never fails the write (#156).** The purge goes
 * through `containRevalidation` (`src/hooks/containRevalidation.ts`) for the
 * reason that module's docblock argues once for every hook that shares it:
 * Payload runs `afterChange` INSIDE the operation's transaction, so a purge
 * that throws does not cost a cache entry — it rolls back the Categories or
 * WorkHistory row that was just written. `revalidateTag`/`revalidatePath`
 * throw `Invariant: static generation store missing` outside a Next request
 * scope, which is every Local-API script, seed and job-driven write, and these
 * collections are exactly what such writers touch. The `disableRevalidate` fast
 * path is unchanged and still short-circuits the whole hook before any purge is
 * attempted; it is not a substitute, because it only helps callers who set it.
 *
 * **Derived surfaces (#207).** The `paths` list above is *static*, and a static
 * list is exactly what went stale when #137 gave `work-history` a second
 * rendering surface: an edit purged `/` and left the `/work/<slug>` page that
 * renders the same row serving a build-time prerender. `resolvePaths` is the
 * answer — an optional resolver that computes the rest of the list from the
 * data (`workHistorySurfaces.ts` derives it from the `workHistoryCard` block's
 * `entry` relationship), so the coupling that decides which pages render a row
 * is also the thing that decides which pages get purged, and the list cannot
 * drift again.
 *
 * The hook stays **synchronous when no resolver is passed**, which is every
 * other collection using it (Categories, Tags, Media, Authors, Projects, Uses,
 * TechStack). Payload awaits its collection hooks either way, so both shapes
 * are legal; keeping the resolver-free path sync is what makes this change a
 * pure addition for those seven call sites rather than a timing change to all
 * of them.
 *
 * @param tag - The cache tag the collection's repo caches under.
 * @param paths - Route paths whose prerenders render this collection.
 * @param resolvePaths - Optional resolver for paths that can only be known by
 *   looking at the data. It should not reject (see {@link SurfacePathResolver}),
 *   and {@link resolveThenPurge} does not take its word for it: a rejection is
 *   caught there and the static `paths` purge anyway.
 */
export const revalidateCollectionTag = (
  tag: string,
  paths: string[] = [],
  resolvePaths?: SurfacePathResolver,
): CollectionAfterChangeHook => {
  return (args) => {
    const {
      doc,
      req,
      req: { payload, context },
    } = args
    if (context.disableRevalidate) return doc

    const purge = (all: string[]) => {
      payload.logger.info(
        `Revalidating tag: ${tag} (paths: ${all.join(', ') || 'none'})`,
      )
      containRevalidation(
        payload,
        'collection write',
        collectionSurfaces(tag, all),
        purgeCollectionSurfaces(tag, all),
      )
    }

    const settled = resolveThenPurge(
      resolvePaths,
      { id: (doc as { id?: unknown })?.id, req },
      paths,
      purge,
      payload,
    )
    return settled ? settled.then(() => doc) : doc
  }
}

/**
 * afterDelete companion to {@link revalidateCollectionTag}.
 *
 * @remarks Same `{ expire: 0 }` immediate-expiration reasoning as
 * {@link revalidateCollectionTag} — a delete must stop serving the removed
 * doc's data as fast as a save surfaces new data (#118).
 *
 * Containment (#156) applies here for a reason that is not weaker than on the
 * afterChange side but stronger: `afterDelete` also runs inside the operation's
 * transaction, so an uncontained purge throw resurrects the row the caller
 * asked to delete.
 *
 * `resolvePaths` mirrors the afterChange side (#207) with one difference that
 * is not a detail: on the delete path the resolver must READ a capture taken in
 * `beforeDelete`, because the relationship it would derive from is already gone
 * by the time this hook runs — see `captureWorkHistorySurfaces`
 * (`src/hooks/workHistorySurfaces.ts`).
 */
export const revalidateCollectionTagDelete = (
  tag: string,
  paths: string[] = [],
  resolvePaths?: SurfacePathResolver,
): CollectionAfterDeleteHook => {
  return (args) => {
    const {
      doc,
      id,
      req,
      req: { payload, context },
    } = args
    if (context.disableRevalidate) return doc

    const purge = (all: string[]) => {
      containRevalidation(
        payload,
        'collection write',
        collectionSurfaces(tag, all),
        purgeCollectionSurfaces(tag, all),
      )
    }

    const settled = resolveThenPurge(
      resolvePaths,
      { id, req },
      paths,
      purge,
      payload,
    )
    return settled ? settled.then(() => doc) : doc
  }
}
