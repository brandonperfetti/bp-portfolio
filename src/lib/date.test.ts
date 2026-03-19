import { describe, expect, it } from 'vitest'

import { toValidDate } from './date'

describe('toValidDate', () => {
  it('returns undefined for out-of-range YYYY-MM-DD values', () => {
    expect(toValidDate('2026-02-31')).toBeUndefined()
    expect(toValidDate('2026-13-01')).toBeUndefined()
    expect(toValidDate('2026-00-10')).toBeUndefined()
  })

  it('parses date-only strings at local midnight', () => {
    expect(toValidDate('2026-03-19')).toEqual(new Date(2026, 2, 19, 0, 0, 0, 0))
  })
})
