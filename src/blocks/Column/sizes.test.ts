// @vitest-environment node
import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Column } from '@/blocks/Column/config'
import {
  COLUMN_SIZES,
  COLUMN_SIZE_CLASSES,
  COLUMN_SIZE_LABELS,
  COLUMN_SIZE_OPTIONS,
  DEFAULT_COLUMN_SIZE,
  columnSizeClass,
} from '@/blocks/Column/sizes'

const sizeField = Column.fields.find(
  (field): field is SelectField => 'name' in field && field.name === 'size',
)

const configValues = (sizeField?.options ?? []).map((option) =>
  typeof option === 'string' ? option : option.value,
)

/**
 * Guards issue #23's central invariant: the admin's width vocabulary and the
 * renderer's class lookup are the same set. The reference implementation
 * this block set is modelled on stored `half` and looked up `oneHalf`, so a
 * half-width column silently rendered at the fallback width — a set-equality
 * assertion is what makes that class of drift impossible here.
 */
describe('column size map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(COLUMN_SIZES.map((size) => size.value)).toEqual([
      'oneQuarter',
      'oneThird',
      'half',
      'twoThirds',
      'threeQuarters',
      'full',
    ])
  })

  it('offers exactly the sizes the class map can render', () => {
    expect(new Set(configValues)).toEqual(
      new Set(Object.keys(COLUMN_SIZE_CLASSES)),
    )
  })

  it('derives the config options from the shared map', () => {
    expect(sizeField).toBeDefined()
    expect(sizeField?.options).toEqual(COLUMN_SIZE_OPTIONS)
    expect(configValues).toHaveLength(COLUMN_SIZES.length)
  })

  it('labels every size for the admin and the row label', () => {
    expect(new Set(Object.keys(COLUMN_SIZE_LABELS))).toEqual(
      new Set(configValues),
    )
    for (const label of Object.values(COLUMN_SIZE_LABELS)) {
      expect(label.trim()).not.toBe('')
    }
  })

  it('defaults to a size the map knows, and says so in the config', () => {
    expect(COLUMN_SIZE_CLASSES[DEFAULT_COLUMN_SIZE]).toBeDefined()
    expect(sizeField?.defaultValue).toBe(DEFAULT_COLUMN_SIZE)
    expect(sizeField?.required).toBe(true)
  })

  it('names the Postgres enum explicitly (63-char identifier limit)', () => {
    expect(sizeField?.enumName).toBe('enum_column_size')
    expect(String(sizeField?.enumName).length).toBeLessThanOrEqual(63)
  })

  it('spans the full row below lg and its share from lg up', () => {
    for (const { className } of COLUMN_SIZES) {
      // Complete literal strings — Tailwind can only see classes it can read.
      expect(className).toMatch(/^col-span-12 lg:col-span-(3|4|6|8|9|12)$/)
    }
  })

  it('gives every size a distinct width', () => {
    const classes = Object.values(COLUMN_SIZE_CLASSES)
    expect(new Set(classes).size).toBe(classes.length)
  })

  it('falls back to the default width for missing or unknown sizes', () => {
    const fallback = COLUMN_SIZE_CLASSES[DEFAULT_COLUMN_SIZE]
    expect(columnSizeClass(null)).toBe(fallback)
    expect(columnSizeClass(undefined)).toBe(fallback)
    // The exact drift bug this map exists to prevent.
    expect(columnSizeClass('oneHalf')).toBe(fallback)
    expect(columnSizeClass('half')).toBe('col-span-12 lg:col-span-6')
  })
})
