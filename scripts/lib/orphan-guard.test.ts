// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { canDropOrphans } from './orphan-guard.mjs'

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
   * The catastrophic case. `deleteOrphans` renders an empty id list as
   * `NOT IN (-1)`, which matches every row — so a collection that reads as
   * empty is one statement away from losing its entire index.
   */
  it('REFUSES a zero-document read rather than dropping every row', () => {
    expect(canDropOrphans(0, 0)).toEqual({ drop: false, reason: 'empty-read' })
  })

  /**
   * Pagination drift: a concurrent write reorders the underlying set while
   * the loop runs, so an eligible document is never returned on any page.
   * Its rows are orphans by the walk's reckoning and live content in fact.
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
})
