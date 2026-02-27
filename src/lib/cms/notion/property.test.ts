import { describe, expect, it } from 'vitest'

import { propertyToNumber } from './property'

describe('propertyToNumber', () => {
  it('parses rollup number values', () => {
    const value = propertyToNumber({
      type: 'rollup',
      rollup: {
        type: 'number',
        number: 1,
      },
    })

    expect(value).toBe(1)
  })

  it('returns undefined for empty text values', () => {
    const value = propertyToNumber({
      type: 'rich_text',
      rich_text: [{ plain_text: '   ' }],
    })

    expect(value).toBeUndefined()
  })

  it('returns undefined for non-numeric text values', () => {
    const value = propertyToNumber({
      type: 'rollup',
      rollup: {
        type: 'string',
        string: 'winner',
      },
    })

    expect(value).toBeUndefined()
  })
})
