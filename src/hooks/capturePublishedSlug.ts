import type { CollectionBeforeChangeHook, RequestContext } from 'payload'

import { findPublishedSlug } from '@/fields/slug/findPublishedSlug'
import { isSlugRoutedCollection } from '@/fields/slug/slugPaths'

/** `req.context` key holding the pre-write published slug, keyed per document. */
const CONTEXT_KEY = 'previousPublishedSlugs'

const contextKey = (collectionSlug: string, id: unknown): string =>
  `${collectionSlug}:${String(id)}`

/**
 * Read the slug a document was published under *before* the write currently in
 * flight, as captured by {@link capturePublishedSlug}.
 *
 * @param context - Prefer `req.context`; the `context` hook argument is
 * equivalent only where no nested Local API call has run since it was handed
 * over (see {@link capturePublishedSlug} for why).
 * @param collectionSlug - Payload collection slug.
 * @param id - The document id.
 * @returns The previous published slug, or `undefined` when the document had no
 * published version (a first publish) or the capture hook did not run.
 *
 * @remarks The stash is typed `unknown` and narrowed at runtime, not asserted.
 * It previously carried `as Record<string, string> | undefined | unknown`,
 * which is an inert union — every member absorbs into `unknown`, so the
 * annotation read like a contract while asserting nothing, and the two
 * runtime guards below were doing all the real work. `req.context` is a shared
 * bag any hook in the request may have written to, so guarding is the correct
 * posture; the fix is to say `unknown` honestly rather than dress it up.
 */
export const readPreviousPublishedSlug = (
  context: RequestContext | undefined,
  collectionSlug: string,
  id: unknown,
): string | undefined => {
  const store: unknown = context?.[CONTEXT_KEY]
  if (!store || typeof store !== 'object') return undefined
  const value = (store as Record<string, unknown>)[
    contextKey(collectionSlug, id)
  ]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * `beforeChange` hook that records the slug a document is *currently published
 * under*, so `createSlugRedirect` can build the old public path from it.
 *
 * @remarks **Why this exists — `previousDoc` is not the published document.**
 * Posts and Pages both run `versions.drafts.autosave.interval: 100`. Payload's
 * update operation resolves `originalDoc` from
 * `getLatestCollectionVersion(...)` (`collections/operations/updateByID.js`)
 * and passes it to `afterChange` as `previousDoc`
 * (`collections/operations/utilities/update.js:324`). After *any* autosave that
 * latest version is the DRAFT. So on the real admin rename path — unlock, type
 * a new slug, autosave fires, click Publish — `previousDoc` at publish time is
 * the autosaved draft: its `_status` is `'draft'` and its `slug` is already the
 * NEW one. A redirect hook reading `previousDoc.slug` sees `from === to` and
 * writes nothing, and a first publish is indistinguishable from a renamed
 * autosaved draft. That was a real defect in the first cut of this batch.
 *
 * The reliable old public URL is the **main table row** before this write: a
 * draft save never touches it (`update.js:253`, `if (!isSavingDraft)` guards
 * `db.updateOne`), so it still holds the slug the site is serving. This hook
 * reads it and stashes it on `req.context`, which `afterChange` receives as its
 * own `context` (both are `req.context`).
 *
 * **Keyed per document** because a bulk `payload.update({ where })` runs many
 * documents through one shared `req.context`; an unkeyed value would leak one
 * document's old slug onto another's redirect.
 *
 * **The handoff is written to `req.context`, never to the `context` argument.**
 * `createLocalReq` reassigns `req.context = getRequestContext(req, context)`
 * (`utilities/createLocalReq.js:86`), and `getRequestContext` returns a NEW
 * shallow-spread object whenever the existing context is non-empty. So every
 * nested Local API call that forwards `req` — including this hook's own
 * `payload.find({ req })` — swaps `req.context` for a fresh object and leaves
 * the `context` argument this hook was handed pointing at a detached one.
 * Writing there is silently discarded; writing to the current `req.context`
 * after the awaits survives, because each later spread copies the key forward.
 * Measured against a real Postgres — it is exactly why the first cut of this
 * hook worked for a one-shot rename (fast path, no nested call) and did
 * nothing on the admin path (fallback branch, nested `find`).
 *
 * **Cost.** Explicit draft saves return immediately, so admin autosave pays
 * nothing. When `originalDoc` is itself the published row (a one-shot publish
 * with no intervening draft) its slug is used directly — still no query. Only a
 * publish that follows a draft costs one indexed `depth: 0`,
 * `select: { slug: true }` lookup, on the same request transaction.
 *
 * Scheduled publish is covered: `versions/schedule/job.js` publishes through
 * `payload.update({ data: { _status: 'published' } })`, the same update path,
 * so this hook sees it like any other publish.
 */
export const capturePublishedSlug: CollectionBeforeChangeHook = async ({
  collection,
  context,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update') return data

  // An explicit draft save cannot move a public URL — and this is the admin
  // autosave path, so it must stay free.
  if (data?._status === 'draft') return data

  const collectionSlug = collection?.slug
  if (!collectionSlug || !isSlugRoutedCollection(collectionSlug)) return data

  const id = originalDoc?.id
  if (id === undefined || id === null) return data

  let publishedSlug: string | undefined

  if (
    originalDoc?._status === 'published' &&
    typeof originalDoc.slug === 'string' &&
    originalDoc.slug.length > 0
  ) {
    // No draft exists, so `originalDoc` IS the published row.
    publishedSlug = originalDoc.slug
  } else {
    publishedSlug =
      (await findPublishedSlug(req, collectionSlug, id)) ?? undefined
  }

  // No published version => a first publish => nothing to redirect from.
  if (!publishedSlug) return data

  // MUST be `req.context`, re-dereferenced here, AFTER every await above — see
  // the note on nested Local API calls in this hook's docblock. `context` may
  // already be detached at this point.
  const target = (req.context ?? context) as Record<string, unknown>
  const store = (target[CONTEXT_KEY] ??= {}) as Record<string, string>
  store[contextKey(collectionSlug, id)] = publishedSlug

  return data
}
