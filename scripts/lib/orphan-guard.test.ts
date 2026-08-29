// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { canDropOrphans, orphanDeleteBounds } from './orphan-guard.mjs'

/**
 * The gate on the backfill's only destructive mode.
 *
 * Each refusal below corresponds to a way `--drop-orphans` could have deleted
 * rows for documents that still exist. The happy path matters just as much:
 * a guard that never lets the deletion run would quietly turn `--drop-orphans`
 * into a no-op and leave the index accumulating dead rows forever.
 */
describe('canDropOrphans', () => {
  it('ALLOWS the drop when the walk matches the reported total', () => {
    expect(canDropOrphans(50, 50)).toEqual({ drop: true, reason: null })
  })

  /**
   * The catastrophic case. An empty id list leaves the DELETE's `NOT IN`
   * matching every row, so a collection that reads as empty is one statement
   * away from losing its entire index. This is the refusal that still does
   * real work on the single-read path, and `orphanDeleteBounds` refuses the
   * same shape again before the statement is built.
   */
  it('REFUSES a zero-document read rather than dropping every row', () => {
    expect(canDropOrphans(0, 0)).toEqual({ drop: false, reason: 'empty-read' })
  })

  /**
   * Pagination drift: a concurrent write reorders the underlying set while a
   * page walk runs, so an eligible document is never returned on any page.
   * Its rows are orphans by the walk's reckoning and live content in fact.
   * The single read closed this structurally; the check is kept for a caller
   * that goes back to walking pages.
   */
  it('REFUSES when the walk saw fewer documents than the collection holds', () => {
    expect(canDropOrphans(49, 50)).toEqual({
      drop: false,
      reason: 'incomplete-read',
    })
  })

  it('REFUSES when the walk saw MORE than reported — the count is untrustworthy', () => {
    expect(canDropOrphans(51, 50)).toEqual({
      drop: false,
      reason: 'incomplete-read',
    })
  })

  it('REFUSES when no page was ever read, so there is no total to check', () => {
    expect(canDropOrphans(0, null)).toEqual({ drop: false, reason: 'no-total' })
  })

  it('REFUSES a non-finite total rather than comparing against NaN', () => {
    // `Number(undefined)` is NaN, and `n !== NaN` is always true — without the
    // finiteness check that would read as "incomplete" by luck, not by rule.
    expect(canDropOrphans(50, Number.NaN)).toEqual({
      drop: false,
      reason: 'no-total',
    })
  })

  it('allows a single-document collection', () => {
    expect(canDropOrphans(1, 1)).toEqual({ drop: true, reason: null })
  })

  /**
   * Honest about what the single-read walk left this refusal doing. Payload
   * derives `totalDocs` from the returned row count when pagination is off, so
   * a real response can no longer disagree with itself. The case is kept
   * because it costs nothing and still catches a caller that goes back to
   * walking pages — but the refusal actually standing between a partial read
   * and a destructive DELETE is `empty-read`, plus the `updated_at` bound in
   * `orphanDeleteBounds`.
   */
  it('is a tautology on the single-read path, where the total IS the count', () => {
    const docsRead = 7

    expect(canDropOrphans(docsRead, docsRead)).toEqual({
      drop: true,
      reason: null,
    })
  })
})

/**
 * The second gate: what the DELETE is allowed to say.
 *
 * `canDropOrphans` asks whether the READ can be trusted. These cases ask
 * whether the resulting statement is safely bounded — the id list that decides
 * which documents are spared, and the timestamp that spares rows written after
 * the run started looking.
 */
describe('orphanDeleteBounds', () => {
  const snapshot = '2026-08-29T12:00:00.000Z'

  it('returns the joined id list and the timestamp to bound on', () => {
    expect(orphanDeleteBounds([3, 1, 2], snapshot)).toEqual({
      ok: true,
      reason: null,
      idList: '3,1,2',
      notTouchedSince: snapshot,
    })
  })

  /**
   * The create-during-run race the completeness check cannot see. Without a
   * timestamp there is nothing separating "row for a document that is gone"
   * from "row for a document created a second ago", so the statement must not
   * be built at all.
   */
  it('REFUSES without a snapshot timestamp rather than deleting unbounded', () => {
    expect(orphanDeleteBounds([1, 2], undefined)).toEqual({
      ok: false,
      reason: 'no-snapshot',
      idList: null,
      notTouchedSince: null,
    })
    expect(orphanDeleteBounds([1, 2], '  ')).toMatchObject({
      ok: false,
      reason: 'no-snapshot',
    })
  })

  /**
   * The ids are interpolated with `sql.raw`, so anything non-numeric is both
   * an injection surface and a correctness bug. Filtering the bad id OUT would
   * be worse than refusing: the document it names was read successfully, and
   * dropping it from the spare-list turns it into an orphan whose live rows
   * get deleted.
   */
  it('REFUSES a non-integer id rather than filtering it out of the spare-list', () => {
    expect(orphanDeleteBounds([1, Number.NaN, 3], snapshot)).toMatchObject({
      ok: false,
      reason: 'non-integer-id',
    })
    expect(orphanDeleteBounds([1, '2) OR true --', 3], snapshot)).toMatchObject(
      { ok: false, reason: 'non-integer-id' },
    )
    expect(orphanDeleteBounds([1, 2.5], snapshot)).toMatchObject({
      ok: false,
      reason: 'non-integer-id',
    })
  })

  /**
   * The catastrophic case, refused a second time. An empty list previously
   * rendered as `NOT IN (-1)`, which matches every row in the collection.
   */
  it('REFUSES an empty id list instead of rendering a match-everything NOT IN', () => {
    expect(orphanDeleteBounds([], snapshot)).toMatchObject({
      ok: false,
      reason: 'empty-id-list',
    })
  })

  it('REFUSES when the ids are not a list at all', () => {
    expect(orphanDeleteBounds(null, snapshot)).toMatchObject({
      ok: false,
      reason: 'no-ids',
    })
  })

  it('accepts a single id and negative ids', () => {
    expect(orphanDeleteBounds([42], snapshot)).toMatchObject({
      ok: true,
      idList: '42',
    })
    expect(orphanDeleteBounds([-7, 8], snapshot)).toMatchObject({
      ok: true,
      idList: '-7,8',
    })
  })
})
