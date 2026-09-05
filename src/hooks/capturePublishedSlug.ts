import type {
  CollectionBeforeChangeHook,
  PayloadRequest,
  RequestContext,
} from 'payload'

import { findPublishedRow } from '@/fields/slug/findPublishedSlug'
import { isSlugRoutedCollection, publicPathFor } from '@/fields/slug/slugPaths'

/** `req.context` key holding the pre-write published slug, keyed per document. */
const CONTEXT_KEY = 'previousPublishedSlugs'

/** `req.context` key holding the pre-write published public PATH (#155). */
const PATH_CONTEXT_KEY = 'previousPublishedPaths'

const contextKey = (collectionSlug: string, id: unknown): string =>
  `${collectionSlug}:${String(id)}`

/**
 * Is the write in flight a **draft save** — an autosave or an explicit "Save
 * draft" — rather than a publish or an unpublish?
 *
 * @param req - The in-flight request.
 * @param data - The incoming payload, for the `_status` clause Payload itself
 * applies (see the correction below).
 * @returns `true` when the write is a draft save, which is the one shape that
 * provably cannot move or remove a public URL.
 *
 * @remarks **This is the #155 signal, and it is measured, not inferred.** The
 * ticket's premise was that this tree has no way to tell an unpublish from an
 * autosave draft save, because both arrive at `beforeChange` with
 * `data._status === 'draft'` and `operation === 'update'`. That is true of the
 * *hook argument object* and false of `req`, which Payload forwards into the
 * hook untouched.
 *
 * [measured, 2026-09-04, Payload 3.86.0, PostgreSQL 16.13, full committed
 * migration set] A harness that appended instrumented `beforeChange`/
 * `afterChange` hooks to Posts and Pages and drove publish → autosaved rename →
 * unpublish → publish recorded, for BOTH collections:
 *
 * | transition | `data._status` | `originalDoc` | `previousDoc` | `req.query` |
 * | --- | --- | --- | --- | --- |
 * | autosave draft save | `'draft'` | the published row, then the draft | same | `{ draft: 'true', autosave: 'true' }` |
 * | unpublish | `'draft'` | the autosaved DRAFT | the autosaved DRAFT | `{ depth, fallback-locale }` — **no `draft`** |
 * | publish | `'published'` | the autosaved DRAFT | the autosaved DRAFT | `{ depth }` — no `draft` |
 *
 * So `data`, `originalDoc`, `previousDoc` and `operation` genuinely cannot
 * separate row 1 from row 2 — the ticket was right about that — and `req.query`
 * separates them cleanly.
 *
 * **Why the query string is the honest signal and not a guess.** It is the
 * value Payload itself branches on. `parseParams(req.query)` yields `draft`,
 * which the REST handler passes straight through as `draftArg`
 * (`payload/dist/collections/endpoints/updateByID.js:8,11` →
 * `collections/operations/updateByID.js:34,122`), and `draftArg` feeds
 * `isSavingDraft` (`collections/operations/utilities/update.js:29`), which is
 * what decides whether the main table is written at all (`update.js:253`,
 * `if (!isSavingDraft)` guards `db.updateOne`). Mirroring that predicate asks
 * exactly the question this hook needs — "will this write touch the row the
 * site is serving?" — rather than approximating it.
 *
 * **Correction (2026-09-04, review of the first cut).** An earlier revision of
 * this docblock said `draftArg` was the SOLE input to `isSavingDraft`, and the
 * guard below tested `req.query.draft` alone. That was wrong, and it was a live
 * defect, not a documentation slip. `update.js:29` ANDs three terms, not one:
 * `draftArg && hasDraftsEnabled(...)`, then `data._status !== 'published'`,
 * then `!publishAllLocales` — so a REST `PATCH ?draft=true` carrying
 * `{ _status: 'published' }` is a **real publish**: `isSavingDraft` is false and
 * the main table is written. The old guard read it as a draft save, returned
 * early, and stashed nothing, so a rename made that way wrote no redirect row
 * and purged no old path. The guard now checks `data._status !== 'published'`
 * first, which is the same clause Payload uses. (The third conjunct needs no
 * mirror: `publishAllLocales` is `!draftArg && …` at `update.js:27`, so it is
 * always false whenever `draftArg` is truthy.)
 *
 * `[measured, @payloadcms/ui 3.86.0 dist]` The admin sends what that implies:
 * autosave `?autosave=true&…&draft=true` (`elements/Autosave/index.js:88-91`),
 * "Save draft" `?…&draft=true` (`elements/PublishButton/index.js:94-96`,
 * `elements/SaveDraftButton/index.js:49`), publish `?depth=0&locale=…` with no
 * `draft` (`elements/PublishButton/index.js:144-150`), and unpublish
 * `?depth=0&fallback-locale=null&locale=…&unpublishAllLocales=…` with no `draft`
 * and a `{ _status: 'draft' }` body (`elements/UnpublishButton/index.js:78-105`).
 *
 * **The one residual, stated rather than hidden.** `createLocalReq` does
 * `req.query = req?.query || {}` (`payload/dist/utilities/createLocalReq.js:102`)
 * — it does **not** mirror the Local API's own `draft` option into `req.query`.
 * So a Local-API *explicit draft save* — `payload.update` with `draft: true`
 * and a draft `_status` body — reads here as an unpublish and costs one extra
 * `find`, plus a redundant purge of a path that is still live. That is a wasted
 * refresh, never a lost purge and never a lost write, and it is not the path the
 * acceptance criterion protects: the 100ms admin autosave is REST and carries
 * `draft=true`, so it still returns before any query. A Local-API caller that
 * wants the fast path can pass `req: { query: { draft: 'true' } }`.
 */
const isDraftSaveRequest = (
  req: PayloadRequest | undefined,
  data: Record<string, unknown> | undefined,
): boolean => {
  // A `_status: 'published'` payload is a PUBLISH however the request is
  // flagged — Payload clears `isSavingDraft` on exactly this clause, and the
  // main table IS written. Checking it first is what keeps a
  // `?draft=true` + `{_status:'published'}` PATCH from being read as a draft
  // save and silently skipping the capture.
  if (data?._status === 'published') return false

  const query = req?.query as Record<string, unknown> | undefined
  const flag = query?.draft ?? query?.autosave
  return flag === true || flag === 'true'
}

/**
 * Read the public path a document was being served at *before* the write
 * currently in flight, as captured by {@link capturePublishedSlug}.
 *
 * @param context - Prefer `req.context`; see {@link readPreviousPublishedSlug}
 * for why the `context` hook argument can be a detached object.
 * @param collectionSlug - Payload collection slug.
 * @param id - The document id.
 * @returns The served path (`/articles/hello`, `/work/brytecore`, `/`), or
 * `undefined` when the document had no published version or the capture hook
 * did not run.
 *
 * @remarks Separate from {@link readPreviousPublishedSlug} rather than replacing
 * it because the two answer different questions for different callers.
 * `createPathRedirect` needs the **slug** to build a redirect row's `from`; the
 * revalidation hooks need the **path**, and under #148 a slug cannot produce one
 * for a placed document (`/work/brytecore` is not `/` + any slug). Both are
 * stashed from the same single lookup, so the second reader costs no extra
 * query.
 */
export const readPreviousPublishedPath = (
  context: RequestContext | undefined,
  collectionSlug: string,
  id: unknown,
): string | undefined => {
  const store: unknown = context?.[PATH_CONTEXT_KEY]
  if (!store || typeof store !== 'object') return undefined
  const value = (store as Record<string, unknown>)[
    contextKey(collectionSlug, id)
  ]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

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
 * `beforeChange` hook that records the slug **and the served public path** a
 * document is *currently published under*, so `createPathRedirect` can build the
 * old public path from the slug and the revalidation hooks can purge the path.
 *
 * @remarks **What it captures, and for whom.** One lookup fills two stashes on
 * `req.context`, read back by {@link readPreviousPublishedSlug} (the redirect
 * row's `from`) and {@link readPreviousPublishedPath} (the URL to purge). They
 * are separate because a slug cannot name a placed document's path (#148).
 *
 * **It now fires on unpublish, which is the #155 fix.** The guard used to be
 * `data._status === 'draft'`, chosen to keep the 100ms autosave free — but an
 * unpublish sends that identical body, so it was swallowed too, and unpublishing
 * a document with a pending autosaved rename purged nothing at all: the served
 * URL kept its prerendered shell after the document was gone. The guard is now
 * {@link isDraftSaveRequest}, which asks whether the *request* is a draft save
 * rather than whether the *payload* mentions drafts. Autosave still returns
 * before any query — pinned by a call-count test — and the unpublish now falls
 * through and captures. Read `isDraftSaveRequest`'s docblock for the measured
 * table of what Payload passes on each transition; every claim there came from a
 * running harness against PostgreSQL 16.13, not from reading types.
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
 * **Cost, and it did not go up on the autosave path (#155 AC).** A draft-save
 * request returns immediately, so admin autosave still pays nothing — the
 * discriminator is a `req.query` read, not a database read. When `originalDoc`
 * is itself the published row (a one-shot publish with no intervening draft) its
 * slug and path are used directly — still no query. What newly costs a query is
 * the transition that was previously broken: an **unpublish** after a draft
 * exists, one indexed `depth: 0`, `select: { path: true, slug: true }` lookup on
 * the same request transaction — the same shape a publish-after-draft already
 * paid, and it happens once per unpublish, not once per keystroke.
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

  // A DRAFT SAVE — autosave or explicit — never touches the main table
  // (`update.js:253`), so it cannot move or remove a public URL, and this is the
  // 100ms admin autosave path, so it must stay free. This used to test
  // `data._status === 'draft'`, which ALSO swallowed the unpublish (#155): an
  // unpublish sends exactly that body. See {@link isDraftSaveRequest} for the
  // measurement that separates the two.
  if (isDraftSaveRequest(req, data)) return data

  const collectionSlug = collection?.slug
  if (!collectionSlug || !isSlugRoutedCollection(collectionSlug)) return data

  const id = originalDoc?.id
  if (id === undefined || id === null) return data

  let publishedRow: null | { path?: unknown; slug?: unknown }

  if (
    originalDoc?._status === 'published' &&
    typeof originalDoc.slug === 'string' &&
    originalDoc.slug.length > 0
  ) {
    // No draft exists, so `originalDoc` IS the published row.
    publishedRow = { path: originalDoc.path, slug: originalDoc.slug }
  } else {
    publishedRow = await findPublishedRow(req, collectionSlug, id)
  }

  const publishedSlug =
    typeof publishedRow?.slug === 'string' && publishedRow.slug.length > 0
      ? publishedRow.slug
      : undefined

  // No published version => a first publish => nothing to redirect from and
  // nothing that was being served.
  if (!publishedSlug) return data

  // MUST be `req.context`, re-dereferenced here, AFTER every await above — see
  // the note on nested Local API calls in this hook's docblock. `context` may
  // already be detached at this point.
  const target = (req.context ?? context) as Record<string, unknown>
  const key = contextKey(collectionSlug, id)

  const slugStore = (target[CONTEXT_KEY] ??= {}) as Record<string, string>
  slugStore[key] = publishedSlug

  // The served PATH, resolved through the single owner of public URLs so a
  // placed post or a nested page stashes `/work/brytecore` rather than a string
  // no route answers (#148). `publicPathFor` is pure and synchronous, so this
  // costs nothing beyond the lookup already made above.
  const publishedPath = publicPathFor(collectionSlug, publishedRow)
  if (publishedPath) {
    const pathStore = (target[PATH_CONTEXT_KEY] ??= {}) as Record<
      string,
      string
    >
    pathStore[key] = publishedPath
  }

  return data
}
