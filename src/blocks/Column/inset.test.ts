// @vitest-environment node
import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Column } from '@/blocks/Column/config'
import {
  COLUMN_INSETS,
  COLUMN_INSET_CLASSES,
  COLUMN_INSET_ENUM_NAME,
  COLUMN_INSET_OPTIONS,
  DEFAULT_COLUMN_INSET,
  columnInsetClass,
} from '@/blocks/Column/inset'

const insetField = Column.fields.find(
  (field): field is SelectField =>
    field.type === 'select' && 'name' in field && field.name === 'contentInset',
)

const configValues = (insetField?.options ?? []).map((option) =>
  typeof option === 'string' ? option : option.value,
)

/**
 * Guards the column half of the homepage's asymmetric two-column gutter: the
 * admin's inset vocabulary and the renderer's class lookup are the same set,
 * and `railGutter` keeps matching the `lg:pl-16 xl:pl-24` the homepage rail
 * insets its own content by — the shape `sizes.test.ts` uses for the width map.
 */
describe('column content inset map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(COLUMN_INSETS.map((inset) => inset.value)).toEqual([
      'none',
      'railGutter',
      'aboutRail',
    ])
  })

  it('offers exactly the insets the class map can render', () => {
    expect(new Set(configValues)).toEqual(
      new Set(Object.keys(COLUMN_INSET_CLASSES)),
    )
    expect(insetField?.options).toEqual(COLUMN_INSET_OPTIONS)
  })

  it('defaults to none — no inset, the behaviour columns already had', () => {
    expect(DEFAULT_COLUMN_INSET).toBe('none')
    expect(COLUMN_INSET_CLASSES.none).toBe('')
    expect(insetField?.defaultValue).toBe('none')
    // Optional, not required: the additive field must leave existing
    // ColumnBlock fixtures and stored docs valid without a value.
    expect(insetField?.required).not.toBe(true)
  })

  it('names the Postgres enum explicitly (63-char identifier limit)', () => {
    expect(insetField?.enumName).toBe(COLUMN_INSET_ENUM_NAME)
    expect(COLUMN_INSET_ENUM_NAME).toBe('enum_column_content_inset')
    expect(String(insetField?.enumName).length).toBeLessThanOrEqual(63)
  })

  it('writes only literal, lg-and-up padding classes Tailwind can scan', () => {
    for (const { className } of COLUMN_INSETS) {
      // Empty (none) or breakpoint-prefixed left padding only — never an
      // unprefixed pl-* that would push a stacked mobile column off-centre.
      expect(className).toMatch(/^$|^(lg|xl):pl-\d+( (lg|xl):pl-\d+)*$/)
    }
  })

  it('falls back to none for missing or unknown values', () => {
    expect(columnInsetClass(null)).toBe('')
    expect(columnInsetClass(undefined)).toBe('')
    expect(columnInsetClass('wide')).toBe('')
    expect(columnInsetClass('railGutter')).toBe('lg:pl-16 xl:pl-24')
    expect(columnInsetClass('aboutRail')).toBe('lg:pl-20')
  })

  /**
   * The pixel-parity gate for the Home rail inset. Home's right rail insets its
   * content by `lg:pl-16 xl:pl-24` (64px / 96px); since #42 flipped Home onto
   * the builder, its rail is a `Column` with `contentInset: railGutter`, so this
   * constant *is* that inset. Pinned to the literal Home shipped.
   */
  it('reproduces the homepage right-rail inset', () => {
    expect(COLUMN_INSET_CLASSES.railGutter).toBe('lg:pl-16 xl:pl-24')
  })

  /**
   * The pixel-parity pin for the about-page rail inset. The #44 flip put
   * `/about` on the builder, so its rail is a `Column` with
   * `contentInset: aboutRail` and the hand-built `about/page.tsx` JSX this once
   * cross-checked is gone (the way #42 retired the `railGutter` source guard
   * just above). `aboutRail` *is* the `lg:pl-20` the hand-built rail carried.
   */
  it('pins the about-page rail inset', () => {
    expect(COLUMN_INSET_CLASSES.aboutRail).toBe('lg:pl-20')
  })
})
