import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

import type { CorvusCollectionSlug } from '@/lib/ai/chunking'
import {
  type CorvusEmbeddingsDb,
  deleteDocumentEmbeddings,
  syncDocumentEmbeddings,
} from '@/lib/ai/embeddingsStore'
import { refreshTechStackSummary } from '@/lib/ai/techStackSummarySync'
import {
  type Deadline,
  createDeadline,
  withDeadline,
} from '@/lib/ai/withDeadline'

/**
 * The one collection whose write also re-emits a derived summary chunk (#165).
 *
 * @remarks A per-row hook cannot refresh a summary of ALL rows — it is handed
 * one `doc` — so the summary gets its own step, which re-reads the collection.
 * Named here rather than inlined so the two hooks below agree about it and so
 * the condition is greppable from the summary's own module.
 */
const SUMMARY_SOURCE_COLLECTION: CorvusCollectionSlug = 'tech-stack'

/**
 * Wall-clock bound on the provider call a single content save may trigger.
 *
 * @remarks Shorter than the read path's budget: this one sits in the admin
 * editor's save request, and a hung provider must not wedge it (research §3.7,
 * non-negotiable 5). When the signal fires, the embed rejects, the hook logs,
 * and the save completes with a stale row that the backfill repairs.
 */
export const HOOK_EMBEDDING_TIMEOUT_MS = 8_000

/** The document shape both hooks read; deliberately structural, not per-collection. */
type HookDoc = Record<string, unknown> & { id?: unknown; _status?: unknown }

const isPublished = (doc: HookDoc | null | undefined): boolean =>
  doc?._status === 'published'

/**
 * Is this save an autosave tick?
 *
 * @remarks Posts run `versions.drafts.autosave` at a 100ms interval, so
 * `afterChange` fires constantly while someone types. Autosave writes a DRAFT
 * version, so the published-status guard below already catches the common
 * case; this is the explicit belt to that braces, and it keeps working if
 * Payload ever autosaves a published doc directly. Payload puts the flag on
 * `req.query.autosave`.
 *
 * @param req - The Payload request.
 * @returns `true` when the write came from autosave.
 */
export function isAutosaveRequest(req: unknown): boolean {
  const query = (req as { query?: Record<string, unknown> } | null)?.query
  const flag = query?.autosave
  return flag === true || flag === 'true'
}

/**
 * Is this draft write sitting on top of a document whose published version
 * still serves?
 *
 * @remarks "Save draft" on a published Post or Page (#208 review) fires
 * `afterChange` with `doc._status: 'draft'`, the same shape as an unpublish,
 * but Payload writes only a new version: the collection's own row stays
 * published and keeps serving. Treated as an unpublish, that save deleted the
 * live document's embeddings until its next publish or backfill.
 *
 * The flag that tells them apart, `?draft=true`, is not readable here: the
 * hook receives no `draft` argument, and a Local-API `draft: true` never
 * reaches `req.query` (docs/PAYLOAD.md § Local API gotchas). So it asks the
 * collection row directly, on this request's transaction (`req` is
 * forwarded): after a draft save that row is still `published`; after an
 * unpublish this same transaction has already set it to `draft`.
 *
 * It reads through the database adapter (`payload.db.findOne`), not
 * `payload.findByID`: the Local API operation calls `killTransaction(req)`
 * when it fails, which rolls back the save this hook is running inside and
 * lets it report success anyway (#208 review). The adapter call takes `req`
 * for the transaction and does nothing else on failure.
 *
 * A database error throws {@link DraftLookupError}, which the hook rethrows
 * instead of swallowing. The error happened inside the save's own
 * transaction, so the save cannot be trusted to commit; failing it loudly is
 * the honest outcome, where the hook's usual fail-open would report a save
 * that may not have happened.
 *
 * **Not raced against the hook's deadline**, deliberately (#208 re-review).
 * A read on the save's transaction cannot be abandoned: the save's COMMIT
 * queues behind it on the same connection, so a race would bound nothing,
 * and a failure arriving after the race had settled would be swallowed while
 * PostgreSQL turned the COMMIT into a ROLLBACK the caller never sees. It is a
 * primary-key read on the transaction the save is already using, so it is
 * bounded exactly as the save's own statements are.
 *
 * With no adapter `findOne` (not Postgres; a test double without one), it
 * answers `false`.
 *
 * @param req - The Payload request of the save.
 * @param collection - The collection the hook is wired onto.
 * @param id - The saved document's id.
 * @returns `true` only when the collection row is verifiably published.
 * @throws {@link DraftLookupError} when the lookup itself fails.
 */
async function isDraftOverPublished(
  req: unknown,
  collection: CorvusCollectionSlug,
  id: number,
): Promise<boolean> {
  const db = (req as { payload?: { db?: { findOne?: unknown } } } | null)
    ?.payload?.db
  if (typeof db?.findOne !== 'function') return false
  let row: HookDoc | null
  try {
    row = (await (
      db.findOne as (args: Record<string, unknown>) => Promise<unknown>
    ).call(db, {
      collection,
      where: { id: { equals: id } },
      select: { _status: true },
      req,
    })) as HookDoc | null
  } catch (error) {
    throw new DraftLookupError(collection, id, error)
  }
  return isPublished(row)
}

/**
 * The draft-over-published lookup failed inside the save's transaction.
 *
 * @remarks The one error the afterChange hook does not swallow; see
 * {@link isDraftOverPublished}.
 */
class DraftLookupError extends Error {
  constructor(collection: string, id: number, cause: unknown) {
    super(
      `[corvus] could not read ${collection}#${id}'s published status; ` +
        `failing the save rather than reporting one that may not commit`,
      { cause },
    )
    this.name = 'DraftLookupError'
  }
}

/**
 * Payload's drizzle handle, or `null` when the adapter is not Postgres.
 *
 * @param payload - The Payload instance from `req`.
 * @returns The drizzle instance, or `null`.
 */
function drizzleOf(payload: unknown): CorvusEmbeddingsDb | null {
  const db = (payload as { db?: { drizzle?: unknown } } | null)?.db?.drizzle
  return db && typeof (db as CorvusEmbeddingsDb).execute === 'function'
    ? (db as CorvusEmbeddingsDb)
    : null
}

/**
 * afterChange hook keeping one collection's Corvus embeddings fresh (#82).
 *
 * @remarks Refresh is hook-driven, not scheduled, which is what discharges
 * #82's "published-content edits reflect in retrieval without a redeploy" AC.
 * Five behaviors are load-bearing, and each one exists because of a specific
 * failure it prevents:
 *
 * - **`context.disableRevalidate` is honoured**, exactly as the revalidation
 *   hooks beside this one do. The e2e seed and any bulk import set it, so a
 *   seed run spends no provider dollars and takes no provider latency.
 * - **Drafts, unpublished docs, and autosave ticks are skipped.** Without
 *   this, a 100ms autosave interval would embed on every keystroke batch. The
 *   autosave guard runs BEFORE the unpublish branch: an autosave on a
 *   published document presents exactly the published → draft shape that
 *   branch deletes on, so checking it second deleted a live document's
 *   embeddings on an ordinary keystroke.
 * - **Unchanged content is skipped before the provider is called**, by
 *   `content_hash` comparison inside `syncDocumentEmbeddings`. The common save
 *   is one indexed SELECT and nothing else. The one thing that skip must NOT
 *   swallow is a change to `visibility` or `published_at`: those are stored
 *   per-row and are what retrieval filters on, so the store repairs them with a
 *   plain UPDATE (still no provider call) and reports `metadataUpdated`, which
 *   is logged distinctly below.
 * - **A published → draft transition DELETES the document's rows**, detected
 *   the same way `revalidatePost` detects it — a previously published doc
 *   arriving with a non-published `_status`. Unpublishing must remove
 *   content from retrieval, not merely stop refreshing it — otherwise
 *   unpublishing an article leaves Corvus still quoting it.
 * - **It never throws.** A provider outage must not fail a content save. The
 *   error is logged through `req.payload.logger` and the stale row is left in
 *   place; `scripts/backfill-corvus-embeddings.ts` is the repair path. This is
 *   the same "the index is derived and rebuildable" stance the migration takes
 *   by keeping the table out of the Payload config. The one exception is a
 *   failed draft-status lookup (#208), which fails inside the save's own
 *   transaction and is rethrown; see `isDraftOverPublished`.
 * - **A draft saved over a published document deletes nothing** (#208): the
 *   collection row is still published and still serving.
 *
 * - **On `tech-stack` only, the daily-driver summary is re-emitted** after the
 *   per-row sync and inside the same `try` (#165). A per-row hook cannot
 *   refresh a summary of all rows, so this step re-reads the collection and
 *   re-composes one chunk carrying the whole `daily` tier. It is inside the
 *   existing `try` on purpose: a failure logs and leaves the stale summary,
 *   and never fails the save. The re-read forwards `req`, so it runs inside
 *   the save's transaction and sees the save — the repo's convention for a
 *   hook-side Local API read. Without it the summary would be composed from
 *   pre-save rows.
 *
 * The provider call is awaited rather than fired and forgotten, bounded by
 * {@link HOOK_EMBEDDING_TIMEOUT_MS}: a floating promise in a serverless
 * function is not guaranteed to run at all, and an awaited-but-bounded call
 * has a knowable worst case.
 *
 * **ONE deadline, for the sync and summary steps.** The bound above is a
 * property of the SAVE, not of each step, so a single
 * {@link createDeadline} call is made once, after the draft-status read and
 * the unpublish delete (neither is under it: see `isDraftOverPublished`),
 * cancelled in a `finally`, and shared by the per-row sync and the summary
 * re-emit. Giving
 * the summary step a second, independent timeout would silently double a
 * `tech-stack` save's worst case while this docblock went on naming one
 * constant. Each step gets the signal AND is raced against it through
 * {@link withDeadline}, because the signal alone only reaches `embedChunks` —
 * the drizzle statements and `refreshTechStackSummary`'s `payload.find` over
 * the whole collection take no signal, and on a slow database the `find` is
 * the likelier stall than the provider. So the worst case of a `tech-stack`
 * save is {@link HOOK_EMBEDDING_TIMEOUT_MS}, once, whatever the step count.
 *
 * @param collection - Which embedded collection this hook is wired onto.
 * @returns An `afterChange` hook.
 */
export const refreshCorvusEmbeddings = (
  collection: CorvusCollectionSlug,
): CollectionAfterChangeHook => {
  return async ({ doc, previousDoc, req }) => {
    const { payload, context } = req
    if (context?.disableRevalidate) return doc

    // Declared out here so the `finally` can cancel the timer on EVERY exit —
    // including the early returns inside the `try` — rather than leaving it
    // pending for the rest of the budget in a serverless function.
    let deadline: Deadline | null = null
    try {
      const db = drizzleOf(payload)
      if (!db) return doc

      const current = doc as HookDoc
      const previous = previousDoc as HookDoc | undefined
      const docId = Number(current?.id)
      if (!Number.isFinite(docId)) return doc

      // FIRST — before the unpublish branch, not after it. Payload autosave
      // writes a DRAFT version of a still-PUBLISHED document and fires
      // `afterChange` with `doc._status: 'draft'` against a
      // `previousDoc._status: 'published'`, which is byte-identical to a real
      // unpublish. With this guard second, every autosave tick on a published
      // post ran the delete branch below and wiped the live document's
      // embeddings while the published version was still serving them. The
      // ordering is the fix, so it is load-bearing: do not move this back.
      if (isAutosaveRequest(req)) return doc

      // A draft saved over a still-published document changes nothing a
      // reader can see, so it must not reach the unpublish branch or the
      // store's draft rule below, both of which delete the live rows.
      if (
        current?._status === 'draft' &&
        (await isDraftOverPublished(req, collection, docId))
      ) {
        return doc
      }

      // Unpublish (published → draft), detected exactly as revalidatePost
      // detects it. Delete first and return: an unpublished doc is not
      // embeddable, so falling through would only re-derive the same delete.
      if (isPublished(previous) && !isPublished(current)) {
        await deleteDocumentEmbeddings(db, collection, docId)
        payload.logger.info(
          `[corvus] unpublished ${collection}#${docId}: embeddings deleted`,
        )
        return doc
      }

      // ONE deadline for the whole hook, created here and shared by every
      // step below — see the docblock. `withDeadline` is what extends it over
      // the work the signal cannot reach (drizzle statements; the summary's
      // `find`); the signal itself is still passed in so the provider call
      // aborts at the source rather than merely being abandoned.
      deadline = createDeadline(HOOK_EMBEDDING_TIMEOUT_MS)

      const result = await withDeadline(
        syncDocumentEmbeddings({
          db,
          collection,
          doc: current,
          abortSignal: deadline.signal,
        }),
        deadline.signal,
      )

      if (result.metadataUpdated > 0) {
        // Logged distinctly from a re-embed: this path spends NO provider
        // dollars and is how a public → gated flip (or a re-date) takes effect
        // immediately rather than waiting for an unrelated body edit.
        payload.logger.info(
          `[corvus] embedding metadata corrected for ${collection}#${docId}: ` +
            `rows=${result.metadataUpdated} (visibility/published_at, no re-embed)`,
        )
      } else if (!result.skipped) {
        payload.logger.info(
          `[corvus] embeddings refreshed for ${collection}#${docId}: ` +
            `written=${result.written} deleted=${result.deleted}`,
        )
      }

      // #165 — the daily-driver summary, AFTER the per-row sync and INSIDE
      // this same `try`. Both halves of that placement are load-bearing:
      //
      // - After, because the summary is a view of the collection this save
      //   just changed; composing it first would embed the previous tier.
      // - Inside, and NOT in a second try/catch of its own, because this
      //   hook's whole contract is that it never throws. A failure to rebuild
      //   the summary therefore lands in the `catch` below, logs, and leaves
      //   the STALE summary row in place — a content save can never fail on
      //   it, and the backfill is the repair path exactly as it is for every
      //   other failure here.
      //
      // `context.disableRevalidate` is honoured by the guard at the top of the
      // hook, so the e2e seed and bulk imports still spend nothing. And the
      // ordinary save spends nothing either: `isContentUnchanged` compares
      // `content_hash` before the provider is called, so editing a
      // technology's `notes` re-composes the same line of names and makes zero
      // embedding calls. The cost of this step on a no-op save is one `find`
      // over ~50 rows plus one indexed SELECT — and that `find` runs on THIS
      // request's transaction, because `req` is forwarded below.
      //
      // It shares `deadline` with the per-row sync above rather than starting
      // its own: the bound is a property of the save, so whatever the per-row
      // step already spent comes out of this step's budget. Note the two
      // returns UPSTREAM of here — the autosave guard and the unpublish branch
      // — skip this step entirely. Inert today, because `tech-stack` is
      // draft-free and neither fires for it; if the collection ever gains
      // drafts, the summary would stop refreshing on unpublish, which is the
      // same tier-shrinks direction the `afterDelete` mirror exists to cover.
      if (collection === SUMMARY_SOURCE_COLLECTION) {
        await withDeadline(
          refreshTechStackSummary({
            payload,
            db,
            // `req` so the summary's `find` joins THIS save's transaction —
            // without it the read takes its own connection and composes the
            // summary from pre-save rows. See `readTechStackSummaryRows`.
            req,
            abortSignal: deadline.signal,
          }),
          deadline.signal,
        )
      }
    } catch (error) {
      // The one exception to the rule below: see `isDraftOverPublished`.
      if (error instanceof DraftLookupError) throw error
      // NEVER throw: a provider outage or a database hiccup must not fail the
      // content save. The stale row stays; the backfill script repairs it.
      payload.logger.error(
        `[corvus] embedding refresh failed for ${collection}; leaving the ` +
          `existing rows in place (payload run scripts/backfill-corvus-embeddings.ts repairs it): ${String(error)}`,
      )
    } finally {
      deadline?.done()
    }

    return doc
  }
}

/**
 * afterDelete companion to {@link refreshCorvusEmbeddings}.
 *
 * @remarks Same never-throw contract, for the same reason: a failure here must
 * not fail the delete. The asymmetry with the afterChange path is that a
 * failed delete leaves content in the index that no longer exists on the site,
 * so it logs at error level and names the repair path explicitly.
 *
 * Also one deadline for the whole hook, for the reason
 * {@link refreshCorvusEmbeddings} gives: the summary re-emit shares the delete's
 * own {@link HOOK_EMBEDDING_TIMEOUT_MS} rather than starting a second one.
 *
 * @param collection - Which embedded collection this hook is wired onto.
 * @returns An `afterDelete` hook.
 */
export const deleteCorvusEmbeddings = (
  collection: CorvusCollectionSlug,
): CollectionAfterDeleteHook => {
  return async ({ doc, req }) => {
    const { payload, context } = req
    if (context?.disableRevalidate) return doc

    let deadline: Deadline | null = null
    try {
      const db = drizzleOf(payload)
      if (!db) return doc

      const docId = Number((doc as HookDoc)?.id)
      if (!Number.isFinite(docId)) return doc

      // One deadline for this hook too, shared by the delete and the re-emit.
      deadline = createDeadline(HOOK_EMBEDDING_TIMEOUT_MS)

      await withDeadline(
        deleteDocumentEmbeddings(db, collection, docId),
        deadline.signal,
      )
      payload.logger.info(
        `[corvus] embeddings deleted for ${collection}#${docId}`,
      )

      // #165 — a deleted technology can SHRINK the daily-driver tier, and a
      // summary that still names it is worse than a stale one: Corvus would
      // cite `/tech` for a technology the page no longer lists. So the
      // re-emit runs here too, after the row's own delete and inside the same
      // never-throw `try`. When the last daily driver goes, the composer
      // returns no chunk and the sync DELETES the summary row rather than
      // embedding an empty tier — see `syncTechStackSummaryEmbeddings`.
      if (collection === SUMMARY_SOURCE_COLLECTION) {
        await withDeadline(
          refreshTechStackSummary({
            payload,
            db,
            // `req` so the summary's `find` joins THIS delete's transaction —
            // without it the read takes its own connection and still sees the
            // row that was just deleted. See `readTechStackSummaryRows`.
            req,
            abortSignal: deadline.signal,
          }),
          deadline.signal,
        )
      }
    } catch (error) {
      payload.logger.error(
        `[corvus] embedding delete failed for ${collection}; stale rows may ` +
          `remain (payload run scripts/backfill-corvus-embeddings.ts -- --drop-orphans ` +
          `repairs it): ${String(error)}`,
      )
    } finally {
      deadline?.done()
    }

    return doc
  }
}
