/**
 * Completeness guard for the backfill's destructive `--drop-orphans` mode
 * (#123, CodeRabbit wave 1).
 *
 * `scripts/backfill-corvus-embeddings.ts` promises in its own docblock that
 * "a partial content read should never be allowed to silently empty the
 * index". `deleteOrphans` deletes every row whose `doc_id` is absent from the
 * ids the run observed, so an incomplete walk is indistinguishable from a
 * corpus that genuinely shrank — the promise needed enforcing, not restating.
 *
 * The rule lives in its own module for the same reason `scripts/lib/page-diff`
 * does: the backfill script ends in a top-level `await run()` and cannot be
 * imported without executing, so a rule that decides whether to DELETE
 * production rows would otherwise be the one rule in the script with no test.
 * (Guarding the entry point instead was measured and rejected: under
 * `payload run`, `process.argv[1]` is `payload/bin.js` and `import.meta.url`
 * carries a `?tsx-namespace=` suffix, so the `import.meta.url === argv[1]`
 * idiom used by `check-migrations-rls.mjs` is false there and would silently
 * turn the backfill into a no-op.)
 *
 * @module
 */

/**
 * May this run delete the collection's orphaned rows?
 *
 * @remarks Refuses in three cases, each a way the read can be incomplete
 * while looking ordinary:
 *
 * - **No total reported.** Nothing to check the read against — a malformed or
 *   failed response rather than a real answer.
 * - **The read disagrees with the reported total.**
 * - **The collection reads as empty.** An empty id list would leave the
 *   DELETE's `NOT IN` matching every row — one statement away from erasing a
 *   whole collection's index. A genuinely empty collection is refused too,
 *   deliberately: an empty read is far more often a broken read than a real
 *   emptying, and an operator who truly means it can delete the rows directly.
 *   {@link orphanDeleteBounds} refuses the same case again downstream; this is
 *   the one refusal worth stating twice.
 *
 * What changed under the single-read walk (#123, CodeRabbit wave 2), stated
 * plainly because the second refusal now carries less than it reads like it
 * does: the caller asks Payload for the whole collection in ONE `find`, and
 * Payload derives `totalDocs` from the returned row count whenever pagination
 * is off. So `seenCount !== reportedTotal` can no longer fire on a real
 * response — it is a tautology on that path, kept because it costs nothing and
 * still catches a caller that goes back to walking pages. The refusal doing
 * the work against a partial read is now **empty-read**, plus the structural
 * `updated_at` bound in {@link orphanDeleteBounds}.
 *
 * @param seenCount - How many documents this run actually read.
 * @param reportedTotal - `totalDocs` from the response, or `null` when no read
 * completed.
 * @returns `{ drop, reason }` — `reason` is `null` when `drop` is true, and
 * otherwise names the refusal for the operator-facing log line.
 */
export function canDropOrphans(seenCount, reportedTotal) {
  if (reportedTotal === null || !Number.isFinite(reportedTotal)) {
    return { drop: false, reason: 'no-total' }
  }
  if (seenCount !== reportedTotal) {
    return { drop: false, reason: 'incomplete-read' }
  }
  if (seenCount === 0) {
    return { drop: false, reason: 'empty-read' }
  }
  return { drop: true, reason: null }
}

/**
 * The bounds the orphan DELETE must carry, or a refusal to run it.
 *
 * @remarks Two independent bounds, for two different ways the delete can eat
 * live rows.
 *
 * **The id list** answers "which documents did this run account for". It is
 * interpolated with `sql.raw` — parameter binding is not expressible for a
 * variable-length `NOT IN` in one drizzle fragment — so every id must be
 * provably an integer before it reaches the statement. A non-integer id is
 * REFUSED rather than filtered out: silently dropping one from the list turns
 * a document the run walked perfectly well into an orphan, and deletes its
 * live rows. Refusing loses nothing but a run.
 *
 * **The timestamp** answers "which rows existed before this run looked". It
 * closes the create-during-run race that no completeness check can see: a
 * document created AFTER the read has hook-written rows and a doc_id that was
 * never in the read, so the id list alone would delete a live document's rows
 * within seconds of it being written. Every write path stamps `updated_at =
 * now()` (insert, upsert conflict, and the metadata update), so requiring
 * `updated_at < snapshotAt` — a value read from the DATABASE clock before the
 * read, never the application's — excludes exactly the rows written after the
 * run began.
 *
 * The trade is deliberate and one-directional: an orphan whose rows happened
 * to be touched between the snapshot and its document's deletion survives this
 * run and is collected by the next one. Leaving a dead row for one cycle is
 * recoverable; deleting a live document's rows is what this whole module
 * exists to prevent.
 *
 * @param seenIds - Document ids this run accounted for.
 * @param snapshotAt - Database-clock timestamp read BEFORE the document read,
 * as an ISO-8601 string.
 * @returns `{ ok, reason, idList, notTouchedSince }` — on `ok`, `idList` is
 * the comma-joined integer list and `notTouchedSince` the timestamp to bound
 * on; otherwise both are `null` and `reason` names the refusal.
 */
export function orphanDeleteBounds(seenIds, snapshotAt) {
  const refuse = (reason) => ({
    ok: false,
    reason,
    idList: null,
    notTouchedSince: null,
  })

  if (typeof snapshotAt !== 'string' || snapshotAt.trim() === '') {
    return refuse('no-snapshot')
  }
  if (!Array.isArray(seenIds)) {
    return refuse('no-ids')
  }
  if (!seenIds.every((id) => Number.isInteger(id))) {
    return refuse('non-integer-id')
  }
  if (seenIds.length === 0) {
    return refuse('empty-id-list')
  }
  return {
    ok: true,
    reason: null,
    idList: seenIds.join(','),
    notTouchedSince: snapshotAt,
  }
}
