// @vitest-environment node
import type { Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Container } from '@/blocks/Container/config'
import {
  CONTAINER_GAPS,
  CONTAINER_GAP_CLASSES,
  CONTAINER_GAP_OPTIONS,
  CONTAINER_VERTICAL_ALIGNS,
  CONTAINER_VERTICAL_ALIGN_CLASSES,
  CONTAINER_VERTICAL_ALIGN_OPTIONS,
  DEFAULT_CONTAINER_GAP,
  DEFAULT_CONTAINER_VERTICAL_ALIGN,
  containerGapClass,
  containerVerticalAlignClass,
} from '@/blocks/Container/layout'

/** Flatten presentational wrappers (rows) so a field is findable by name. */
const flatten = (fields: Field[]): Field[] =>
  fields.flatMap((field) =>
    field.type === 'row' || field.type === 'collapsible'
      ? flatten(field.fields)
      : [field],
  )

const selectField = (name: string): SelectField => {
  const field = flatten(Container.fields).find(
    (candidate): candidate is SelectField =>
      candidate.type === 'select' &&
      'name' in candidate &&
      candidate.name === name,
  )
  if (!field) throw new Error(`no select field named "${name}"`)
  return field
}

const optionValues = (field: SelectField) =>
  field.options.map((option) =>
    typeof option === 'string' ? option : option.value,
  )

const gapField = selectField('gap')
const alignField = selectField('verticalAlign')

/**
 * Guards #29's grid controls the way `Column/sizes.ts` is guarded: the admin
 * vocabulary and the renderer's class lookup must be the same set, and the
 * `lg` gap must keep matching the hard-coded homepage gutter it exists to
 * reproduce.
 */
describe('container gap map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(CONTAINER_GAPS.map((gap) => gap.value)).toEqual([
      'sm',
      'md',
      'lg',
      'homeParity',
    ])
  })

  it('offers exactly the gaps the class map can render', () => {
    expect(new Set(optionValues(gapField))).toEqual(
      new Set(Object.keys(CONTAINER_GAP_CLASSES)),
    )
    expect(gapField.options).toEqual(CONTAINER_GAP_OPTIONS)
  })

  it('defaults to the spacing containers already had', () => {
    // #29 adds a control; it must not restyle pages built before it existed.
    expect(DEFAULT_CONTAINER_GAP).toBe('md')
    expect(containerGapClass(DEFAULT_CONTAINER_GAP)).toBe('gap-8')
    expect(gapField.defaultValue).toBe(DEFAULT_CONTAINER_GAP)
    expect(gapField.required).toBe(true)
  })

  it('names the Postgres enum explicitly (63-char identifier limit)', () => {
    expect(gapField.enumName).toBe('enum_container_gap')
    expect(String(gapField.enumName).length).toBeLessThanOrEqual(63)
  })

  it('writes complete literal classes Tailwind can scan', () => {
    // Both symmetric (`gap-*`) and axis (`gap-x-*`/`gap-y-*`) forms, with or
    // without an `lg:`/`xl:` breakpoint prefix — all complete literal strings.
    for (const { className } of CONTAINER_GAPS) {
      expect(className).toMatch(
        /^gap(-[xy])?-\d+( ((lg|xl):)?gap(-[xy])?-\d+)*$/,
      )
    }
  })

  it('defaults are untouched by the added homeParity option', () => {
    // The additive option must not restyle pages built before it existed.
    expect(DEFAULT_CONTAINER_GAP).toBe('md')
    expect(containerGapClass('md')).toBe('gap-8')
    expect(containerGapClass('sm')).toBe('gap-4')
    expect(containerGapClass('lg')).toBe('gap-8 lg:gap-16 xl:gap-24')
  })

  /**
   * The grid half of Home's *asymmetric* two-column gutter: no column gap (so
   * both columns land at exactly `W/2`) and Home's stacked spacing (`gap-y-20`).
   * Since #42 flipped Home onto the builder, its grid is a `Container` with
   * `gap: homeParity`, so this constant *is* that layout. Pinned to the literal
   * Home shipped; the rail-inset half of the gutter lives on the column (see
   * `Column/inset.test.ts`).
   */
  it('reproduces the homepage grid: zero column gap, 80px stacked', () => {
    expect(CONTAINER_GAP_CLASSES.homeParity).toBe('gap-x-0 gap-y-20')
  })

  it('falls back to the default for missing or unknown values', () => {
    const fallback = CONTAINER_GAP_CLASSES[DEFAULT_CONTAINER_GAP]
    expect(containerGapClass(null)).toBe(fallback)
    expect(containerGapClass(undefined)).toBe(fallback)
    expect(containerGapClass('xl')).toBe(fallback)
    expect(containerGapClass('sm')).toBe('gap-4')
  })

  /**
   * The `lg` gap reproduces the 64px / 96px step Home's two-column gutter uses
   * (`lg:pl-16 xl:pl-24` on the rail). Pinned to the literal, in step with the
   * inset half in `Column/inset.test.ts`.
   */
  it('reproduces the homepage two-column gutter at the lg gap', () => {
    expect(CONTAINER_GAP_CLASSES.lg).toBe('gap-8 lg:gap-16 xl:gap-24')
  })
})

describe('container vertical alignment map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(CONTAINER_VERTICAL_ALIGNS.map((align) => align.value)).toEqual([
      'start',
      'center',
      'stretch',
    ])
  })

  it('offers exactly the alignments the class map can render', () => {
    expect(new Set(optionValues(alignField))).toEqual(
      new Set(Object.keys(CONTAINER_VERTICAL_ALIGN_CLASSES)),
    )
    expect(alignField.options).toEqual(CONTAINER_VERTICAL_ALIGN_OPTIONS)
  })

  it('defaults to stretch — the behaviour the grid already had', () => {
    expect(DEFAULT_CONTAINER_VERTICAL_ALIGN).toBe('stretch')
    expect(alignField.defaultValue).toBe(DEFAULT_CONTAINER_VERTICAL_ALIGN)
    expect(alignField.required).toBe(true)
  })

  it('names the Postgres enum explicitly', () => {
    expect(alignField.enumName).toBe('enum_container_vertical_align')
    expect(String(alignField.enumName).length).toBeLessThanOrEqual(63)
  })

  it('maps every alignment to a distinct literal class', () => {
    const classes = Object.values(CONTAINER_VERTICAL_ALIGN_CLASSES)
    expect(new Set(classes).size).toBe(classes.length)
    for (const className of classes) {
      expect(className).toMatch(/^items-(start|center|stretch)$/)
    }
  })

  it('falls back to stretch for missing or unknown values', () => {
    expect(containerVerticalAlignClass(null)).toBe('items-stretch')
    expect(containerVerticalAlignClass('middle')).toBe('items-stretch')
    expect(containerVerticalAlignClass('center')).toBe('items-center')
  })
})
