import { describe, expect, it } from 'vitest'

import {
  hasMailingListOptIn,
  MAILING_LIST_OPT_IN_KEY,
} from './mailingListOptIn'

describe('hasMailingListOptIn (#362)', () => {
  it('is true only for an object whose opt-in key is the boolean true', () => {
    expect(hasMailingListOptIn({ [MAILING_LIST_OPT_IN_KEY]: true })).toBe(true)
    expect(hasMailingListOptIn({ mailingListOptIn: true, other: 1 })).toBe(true)
  })

  it.each([
    ['an explicit false', { mailingListOptIn: false }],
    ['a missing key', {}],
    ['the string "true"', { mailingListOptIn: 'true' }],
    ['the number 1', { mailingListOptIn: 1 }],
    ['undefined', undefined],
    ['null', null],
    ['a bare true', true],
    ['a string', 'mailingListOptIn'],
    ['an array', [true]],
  ])('is false for %s', (_label, value) => {
    expect(hasMailingListOptIn(value)).toBe(false)
  })
})
