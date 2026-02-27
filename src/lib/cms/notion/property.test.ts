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

  it('parses rollup string numeric values', () => {
    const value = propertyToNumber({
      type: 'rollup',
      rollup: {
        type: 'string',
        string: '42',
      },
    })

    expect(value).toBe(42)
  })

  it('returns formula number values', () => {
    const value = propertyToNumber({
      type: 'formula',
      formula: {
        type: 'number',
        number: 3.14,
      },
    })

    expect(value).toBe(3.14)
  })

  it('returns 0 for rollup number zero', () => {
    const value = propertyToNumber({
      type: 'rollup',
      rollup: {
        type: 'number',
        number: 0,
      },
    })

    expect(value).toBe(0)
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
