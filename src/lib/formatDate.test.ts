import { describe, expect, it } from 'vitest'

import { formatDate } from './formatDate'

describe('formatDate', () => {
  it('formats bare YYYY-MM-DD dates (v3 content)', () => {
    expect(formatDate('2025-01-05')).toBe('January 5, 2025')
  })

  it('formats full ISO timestamps (Payload publishedAt)', () => {
    // Regression: appending T00:00:00Z to a timestamp rendered
    // "Invalid Date" on every CMS-sourced article card.
    expect(formatDate('2025-01-05T16:00:00.000Z')).toBe('January 5, 2025')
  })

  it('returns an empty string for unparseable input', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
})
