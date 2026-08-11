// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type {
  CheckboxField,
  Field,
  GroupField,
  SelectField,
  TextField,
} from 'payload'

import { describe, expect, it } from 'vitest'

import { Container } from '@/blocks/Container/config'
import {
  ANCHOR_ID_MAX_LENGTH,
  DEFAULT_SECTION_PADDING_Y,
  DEFAULT_SECTION_WIDTH,
  SECTION_PADDING_Y,
  SECTION_PADDING_Y_CLASSES,
  SECTION_PADDING_Y_OPTIONS,
  SECTION_WIDTHS,
  SECTION_WIDTH_CLASSES,
  SECTION_WIDTH_OPTIONS,
  anchorIdAttribute,
  sectionPaddingYClass,
  sectionWidthClass,
  validateAnchorId,
} from '@/blocks/Container/section'

/** Flatten presentational wrappers (rows) so a field is findable by name. */
const flatten = (fields: Field[]): Field[] =>
  fields.flatMap((field) =>
    field.type === 'row' || field.type === 'collapsible'
      ? flatten(field.fields)
      : [field],
  )

const sectionGroup = Container.fields.find(
  (field): field is GroupField =>
    field.type === 'group' && 'name' in field && field.name === 'section',
)
const sectionFields = flatten(sectionGroup?.fields ?? [])

const fieldNamed = <T extends Field>(name: string): T => {
  const field = sectionFields.find(
    (candidate) => 'name' in candidate && candidate.name === name,
  )
  if (!field) throw new Error(`no section field named "${name}"`)
  return field as T
}

const widthField = fieldNamed<SelectField>('width')
const paddingField = fieldNamed<SelectField>('paddingY')
const anchorField = fieldNamed<TextField>('anchorId')
const hiddenField = fieldNamed<CheckboxField>('hidden')

const optionValues = (field: SelectField) =>
  field.options.map((option) =>
    typeof option === 'string' ? option : option.value,
  )

/**
 * Guards #30's section shell: the admin's vocabulary and the renderer's
 * class lookups stay the same set, the defaults reproduce the behaviour the
 * container had before the group existed, and the anchor rule is the one the
 * renderer trusts.
 */
describe('section width map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(SECTION_WIDTHS.map((width) => width.value)).toEqual([
      'container',
      'narrow',
      'fullBleed',
    ])
  })

  it('offers exactly the widths the class map can render', () => {
    expect(new Set(optionValues(widthField))).toEqual(
      new Set(Object.keys(SECTION_WIDTH_CLASSES)),
    )
    expect(widthField.options).toEqual(SECTION_WIDTH_OPTIONS)
  })

  it('defaults to the route container — the pre-existing behaviour', () => {
    expect(DEFAULT_SECTION_WIDTH).toBe('container')
    // No classes at all: the section simply fills what the route gives it,
    // which is what keeps legacy pages pixel-identical.
    expect(sectionWidthClass('container')).toBe('')
    expect(widthField.defaultValue).toBe(DEFAULT_SECTION_WIDTH)
    expect(widthField.required).toBe(true)
  })

  it('names the Postgres enum explicitly (63-char identifier limit)', () => {
    expect(widthField.enumName).toBe('enum_container_section_width')
    expect(String(widthField.enumName).length).toBeLessThanOrEqual(63)
  })

  it('breaks full bleed out of the route container, centered on the viewport', () => {
    // The [slug] route wraps every block in <Container>, so full bleed can
    // only be a breakout: viewport width, re-centered from inside a centered
    // parent. Dropping any one of these three classes leaves the section
    // offset by half its own width.
    expect(sectionWidthClass('fullBleed')).toBe(
      'relative left-1/2 w-screen -translate-x-1/2',
    )
  })

  it('keeps narrow a centered reading measure', () => {
    expect(sectionWidthClass('narrow')).toBe('mx-auto max-w-2xl')
  })

  it('falls back to the route container for missing or unknown values', () => {
    expect(sectionWidthClass(null)).toBe('')
    expect(sectionWidthClass(undefined)).toBe('')
    // A stale value must not break out of the container by accident.
    expect(sectionWidthClass('fullbleed')).toBe('')
  })
})

describe('section vertical padding map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(SECTION_PADDING_Y.map((padding) => padding.value)).toEqual([
      'none',
      'sm',
      'md',
      'lg',
    ])
  })

  it('offers exactly the paddings the class map can render', () => {
    expect(new Set(optionValues(paddingField))).toEqual(
      new Set(Object.keys(SECTION_PADDING_Y_CLASSES)),
    )
    expect(paddingField.options).toEqual(SECTION_PADDING_Y_OPTIONS)
  })

  it('defaults to none, adding no spacing to existing pages', () => {
    expect(DEFAULT_SECTION_PADDING_Y).toBe('none')
    expect(sectionPaddingYClass('none')).toBe('')
    expect(paddingField.defaultValue).toBe(DEFAULT_SECTION_PADDING_Y)
    expect(paddingField.required).toBe(true)
  })

  it('names the Postgres enum explicitly', () => {
    expect(paddingField.enumName).toBe('enum_container_section_padding_y')
    expect(String(paddingField.enumName).length).toBeLessThanOrEqual(63)
  })

  it('writes complete literal classes Tailwind can scan', () => {
    for (const { className, value } of SECTION_PADDING_Y) {
      if (value === 'none') {
        expect(className).toBe('')
        continue
      }
      expect(className).toMatch(/^py-\d+$/)
    }
  })

  it('falls back to none for missing or unknown values', () => {
    expect(sectionPaddingYClass(null)).toBe('')
    expect(sectionPaddingYClass('xl')).toBe('')
    expect(sectionPaddingYClass('md')).toBe('py-16')
  })
})

describe('section anchor id', () => {
  it('is optional and wired to the shared validator', () => {
    expect(anchorField.required).toBeFalsy()
    expect(anchorField.validate).toBeTypeOf('function')
    // The field's validate must reject what the renderer would drop.
    expect(
      anchorField.validate?.('Work History' as never, {} as never),
    ).not.toBe(true)
    expect(anchorField.validate?.('work-history' as never, {} as never)).toBe(
      true,
    )
  })

  it('accepts slug-shaped anchors', () => {
    for (const value of [
      'work',
      'work-history',
      'work_history',
      'a1',
      'a-1_b',
    ]) {
      expect(validateAnchorId(value), value).toBe(true)
    }
  })

  it('accepts an absent anchor — the field is optional', () => {
    expect(validateAnchorId(undefined)).toBe(true)
    expect(validateAnchorId(null)).toBe(true)
    expect(validateAnchorId('')).toBe(true)
  })

  it('rejects anything that would break a hand-typed #link', () => {
    for (const value of [
      'Work',
      '1work',
      '-work',
      'work history',
      'work#history',
      '#work',
      'work.history',
      'work/history',
      'wörk',
    ]) {
      expect(validateAnchorId(value), value).toBeTypeOf('string')
    }
    expect(validateAnchorId('a'.repeat(ANCHOR_ID_MAX_LENGTH + 1))).toBeTypeOf(
      'string',
    )
    expect(validateAnchorId('a'.repeat(ANCHOR_ID_MAX_LENGTH))).toBe(true)
  })

  it('renders no id attribute rather than an empty or invalid one', () => {
    expect(anchorIdAttribute(undefined)).toBeUndefined()
    expect(anchorIdAttribute('')).toBeUndefined()
    // Data can predate or bypass the field validation.
    expect(anchorIdAttribute('Work History')).toBeUndefined()
    expect(anchorIdAttribute('work-history')).toBe('work-history')
  })
})

describe('section visibility', () => {
  it('offers a hidden checkbox that starts off', () => {
    expect(hiddenField.type).toBe('checkbox')
    expect(hiddenField.defaultValue).toBe(false)
  })
})

describe('the full-bleed breakout has somewhere to overflow into', () => {
  const layoutPath = path.resolve(
    process.cwd(),
    'src/app/(frontend)/layout.tsx',
  )
  const layout = readFileSync(layoutPath, 'utf8')

  it('clips the frontend layout root horizontally', () => {
    // `w-screen` is 100vw, which counts a classic scrollbar's width, so a
    // full-bleed section is wider than the document on any browser that has
    // one. Without this the breakout adds a horizontal scrollbar to every
    // page that uses it (W1B3 flag 3).
    expect(sectionWidthClass('fullBleed')).toContain('w-screen')
    expect(layout).toMatch(/<html[^>]*\boverflow-x-clip\b/s)
  })

  it('clips rather than hides, so sticky positioning survives', () => {
    // `overflow: hidden` on an ancestor makes it a scroll container and
    // breaks `position: sticky` against the viewport — which the site header
    // and the sticky column rail both rely on. `clip` does not.
    expect(layout).not.toMatch(/<html[^>]*\boverflow-x-hidden\b/s)
    expect(layout).not.toMatch(/<html[^>]*\boverflow-hidden\b/s)
  })
})
