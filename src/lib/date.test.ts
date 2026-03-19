import { describe, expect, it } from 'vitest'

import { toValidDate } from './date'

describe('toValidDate', () => {
  it('returns undefined for out-of-range YYYY-MM-DD values', () => {
    expect(toValidDate('2026-02-31')).toBeUndefined()
    expect(toValidDate('2026-13-01')).toBeUndefined()
    expect(toValidDate('2026-00-10')).toBeUndefined()
  })

  it('parses date-only strings at local midnight', () => {
    const parsed = toValidDate('2026-03-19')
    expect(parsed).toBeDefined()
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(2)
    expect(parsed?.getDate()).toBe(19)
    expect(parsed?.getHours()).toBe(0)
    expect(parsed?.getMinutes()).toBe(0)
    expect(parsed?.getSeconds()).toBe(0)
  })
})
