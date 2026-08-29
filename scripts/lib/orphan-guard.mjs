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
 * @remarks Refuses in three cases, each a way the walk can be incomplete
 * while looking ordinary:
 *
 * - **No total reported.** Nothing to check the walk against.
 * - **The walk disagrees with the reported total.** A concurrent write can
 *   shift pagination mid-loop so an eligible document is never returned on
 *   any page; its rows would then be dropped while the document still exists.
 * - **The collection reads as empty.** `deleteOrphans` turns an empty id list
 *   into `NOT IN (-1)`, which matches every row — one statement away from
 *   erasing a whole collection's index. A genuinely empty collection is
 *   refused too, deliberately: an empty read is far more often a broken read
 *   than a real emptying, and an operator who truly means it can delete the
 *   rows directly.
 *
 * @param seenCount - How many documents this run actually walked.
 * @param reportedTotal - `totalDocs` from the final pagination response, or
 * `null` when no page was read.
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
