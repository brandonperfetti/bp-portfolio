import type {
  CollectionAfterOperationHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from 'payload'

/**
 * Local-API draft-save intent: what an update's own `draft` argument said,
 * carried from `beforeOperation` to the Pages unpublish guard
 * (`refuseUnpublishWithServedDescendants`) in `beforeChange` (#197).
 *
 * **Read by that guard alone, deliberately.** The guard lets a Local-API draft
 * save through only when it does not move the page; a draft that would move a
 * page with served descendants is refused. So `capturePublishedSlug` and the
 * subtree cascade never see a Local-API draft move they could mistake for a
 * real one, and they keep their query-only behaviour. Teaching them the intent
 * was tried first; three review rounds found harm there (#197 review: a draft
 * rename cascading children; a page intent leaking to a post's capture; a
 * stale stash on a reused request), and option A (Brandon, 2026-11-25) narrowed
 * the claim instead.
 *
 * @remarks **Why this exists.** By `beforeChange` a Local-API draft save and a
 * Local-API unpublish are the same write. A `draft: true` update arrives with
 * `data._status: 'draft'` because `updateDocument` stamps it
 * (`payload/dist/collections/operations/utilities/update.js`, `isSavingDraft`),
 * and `payload.update({ data: { _status: 'draft' } })` arrives with the same
 * value because the caller sent it. The `beforeChange` arguments carry no
 * `draft` flag, and `createLocalReq` does not copy the Local API's `draft`
 * option into `req.query` (`payload/dist/utilities/createLocalReq.js`), which
 * is the only place the hooks here used to look. The admin and REST carry
 * `?draft=true`, so they never had the gap; scripts, seeds and the MCP write
 * tools did.
 *
 * The operation's own arguments do carry it, and `beforeOperation` is the one
 * hook that runs before `beforeChange` and is handed them (`buildBeforeOperation.js` passes `args`;
 * `updateByID.js` and `update.js` destructure `draft` from them right after).
 * So the intent is read from the call itself: no caller has to say anything
 * new, and a caller that omits `draft` is still asking for a main-table write.
 * The ticket's two caller-side options (pass `req: { query: { draft: 'true' } }`,
 * still honoured; or a `req.context` flag) put the burden on every caller, and
 * the MCP tools are callers this repo does not write. Skipping the guard on
 * `req.payloadAPI === 'local'` separates Local from REST, not the two Local-API
 * intents, and would stop guarding script-driven unpublishes.
 *
 * **Per document, per operation in flight, and failing closed.** `req.context`
 * is shared by every operation on the request: nested ones (the cascade hooks
 * run nested updates on the same `req`), other collections' (a page script that
 * also unpublishes a post), and, for a caller that reuses a `req`, sequential
 * and overlapping ones. So an entry is keyed by collection and document id, so
 * a page's draft save never reads as a post's with the same id, counts the
 * updates of that document in flight, and is released in `afterOperation`.
 * Payload names the operation `'update'` going into a by-id update and
 * `'updateByID'` coming out of it (`updateByID.js`), and `'update'` both ways
 * for a bulk one, so the release accepts both names. Two updates
 * of one document in flight at once mark the entry conflicting, and a
 * conflicting entry never reads as a draft save, whatever either update asked:
 * a draft save that started after an unpublish cannot excuse it. A bulk
 * (`where`) update does not know its ids before it runs, so while one is in
 * flight no entry reads as a draft save. An operation that throws skips
 * `afterOperation`, which leaves its entry in flight; any later update of that
 * document on the same `req` then reads as conflicting. Every one of these
 * falls back to what the hooks did before #197 (the query string alone), the
 * safe direction: a draft save may be refused or pay a wasted lookup; an
 * unpublish is never let through.
 */
const DRAFT_SAVE_INTENT = 'draftSaveIntent'

/** One document's entry: the last update's `draft`, and how many are running. */
type IntentEntry = { conflict: boolean; draft: boolean; inflight: number }

/**
 * The per-request store under {@link DRAFT_SAVE_INTENT}: bulk updates in flight
 * per collection, and entries keyed by {@link keyOf}.
 */
type IntentStore = {
  bulkInflight: Record<string, number>
  byId: Record<string, IntentEntry>
}

/**
 * The request's intent store, created on first use.
 *
 * @param req - The in-flight request.
 * @returns The store, attached to `req.context`.
 */
const storeOf = (req: PayloadRequest): IntentStore => {
  const context = req.context as Record<string, unknown>
  const existing = context[DRAFT_SAVE_INTENT] as IntentStore | undefined
  if (existing) return existing
  const created: IntentStore = { bulkInflight: {}, byId: {} }
  context[DRAFT_SAVE_INTENT] = created
  return created
}

/**
 * The document id an update operation targets, or `null` for a bulk update.
 *
 * @param args - The operation's arguments.
 */
const idOf = (args: unknown): null | string => {
  const id = (args as { id?: unknown }).id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

/**
 * An entry's key: collection and document id, so two collections' documents
 * with the same numeric id never share one.
 *
 * @param collection - The collection slug.
 * @param id - The document id.
 */
const keyOf = (collection: string, id: number | string): string =>
  `${collection}:${String(id)}`

/**
 * `beforeOperation` hook: record that an update is starting, and whether it
 * was asked to save a draft.
 *
 * @param args - Payload's `beforeOperation` arguments.
 * @returns Nothing; the operation's arguments are left as they are.
 */
export const recordDraftSaveIntent: CollectionBeforeOperationHook = ({
  args,
  collection,
  operation,
  req,
}) => {
  if (operation !== 'update') return
  const store = storeOf(req)
  const id = idOf(args)
  if (id === null) {
    store.bulkInflight[collection.slug] =
      (store.bulkInflight[collection.slug] ?? 0) + 1
    return
  }
  const { draft } = args as { draft?: unknown }
  const key = keyOf(collection.slug, id)
  const previous = store.byId[key]
  store.byId[key] = {
    conflict:
      Boolean(previous && previous.inflight > 0) || !!previous?.conflict,
    draft: draft === true || draft === 'true',
    inflight: (previous?.inflight ?? 0) + 1,
  }
}

/**
 * `afterOperation` hook: release what {@link recordDraftSaveIntent} recorded
 * for an update that finished.
 *
 * @param args - Payload's `afterOperation` arguments.
 * @returns Nothing; the operation's result is left as it is.
 */
export const releaseDraftSaveIntent: CollectionAfterOperationHook = ({
  args,
  collection,
  operation,
  req,
}) => {
  if (operation !== 'update' && operation !== 'updateByID') return
  const store = storeOf(req)
  const id = idOf(args)
  if (id === null) {
    store.bulkInflight[collection.slug] = Math.max(
      0,
      (store.bulkInflight[collection.slug] ?? 0) - 1,
    )
    return
  }
  const key = keyOf(collection.slug, id)
  const entry = store.byId[key]
  if (!entry) return
  entry.inflight -= 1
  if (entry.inflight <= 0) delete store.byId[key]
}

/**
 * Did the update in flight for this document ask to save a draft, by its own
 * `draft` argument?
 *
 * @param req - The in-flight request.
 * @param data - The incoming payload: a `_status: 'published'` body is a
 *   publish however the call is flagged, the clause Payload's own
 *   `isSavingDraft` ANDs in.
 * @param collection - The slug of the collection being written; a collection
 *   that does not register the hooks never has an entry.
 * @param id - The document being written.
 * @returns `true` only for an unconflicted by-id update that passed
 *   `draft: true`, with no bulk update of that collection in flight.
 */
export const hasDraftSaveIntent = (
  req: PayloadRequest | undefined,
  data: Record<string, unknown> | undefined,
  collection: string | undefined,
  id: unknown,
): boolean => {
  if (data?._status === 'published') return false
  if (!collection) return false
  if (typeof id !== 'number' && typeof id !== 'string') return false
  const store = (req?.context as Record<string, unknown> | undefined)?.[
    DRAFT_SAVE_INTENT
  ] as IntentStore | undefined
  if (!store || (store.bulkInflight[collection] ?? 0) > 0) return false
  const entry = store.byId[keyOf(collection, id)]
  return Boolean(entry && entry.draft && !entry.conflict && entry.inflight > 0)
}
