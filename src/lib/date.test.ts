import { describe, expect, it } from 'vitest'

import { toValidDate } from './date'

describe('toValidDate', () => {
  it('returns undefined for empty input', () => {
    expect(toValidDate(undefined)).toBeUndefined()
    expect(toValidDate('')).toBeUndefined()
  })

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

  it('parses datetime strings with explicit UTC offsets', () => {
    const parsed = toValidDate('2026-03-19T10:30:00Z')
    expect(parsed).toBeDefined()
    expect(parsed?.toISOString()).toBe('2026-03-19T10:30:00.000Z')
  })

  it('accepts leap-day in leap years and rejects non-leap years', () => {
    const leapYear = toValidDate('2024-02-29')
    const nonLeapYear = toValidDate('2025-02-29')

    expect(leapYear).toBeDefined()
    expect(leapYear?.getFullYear()).toBe(2024)
    expect(leapYear?.getMonth()).toBe(1)
    expect(leapYear?.getDate()).toBe(29)
    expect(nonLeapYear).toBeUndefined()
  })
})
