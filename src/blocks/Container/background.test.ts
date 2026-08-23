// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Field, GroupField, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SECTION_BACKGROUND_DIRECTION,
  DEFAULT_SECTION_BACKGROUND_GRADIENT,
  DEFAULT_SECTION_BACKGROUND_STYLE,
  DEFAULT_SECTION_BACKGROUND_TINT,
  SECTION_BACKGROUND_COLOR_DARK_VAR,
  SECTION_BACKGROUND_COLOR_VAR,
  SECTION_BACKGROUND_DIRECTIONS,
  SECTION_BACKGROUND_DIRECTION_CSS,
  SECTION_BACKGROUND_DIRECTION_OPTIONS,
  SECTION_BACKGROUND_GRADIENTS,
  SECTION_BACKGROUND_GRADIENT_OPTIONS,
  SECTION_BACKGROUND_GRADIENT_STOPS,
  SECTION_BACKGROUND_IMAGE_DARK_VAR,
  SECTION_BACKGROUND_IMAGE_VAR,
  SECTION_BACKGROUND_STYLES,
  SECTION_BACKGROUND_STYLE_CLASSES,
  SECTION_BACKGROUND_STYLE_OPTIONS,
  SECTION_BACKGROUND_TINTS,
  SECTION_BACKGROUND_TINT_OPTIONS,
  SECTION_BACKGROUND_TINT_VALUES,
  SECTION_BACKGROUND_ZINC,
  sectionBackgroundClass,
  sectionBackgroundStyle,
} from '@/blocks/Container/background'
import { Container } from '@/blocks/Container/config'

/** Flatten presentational wrappers (rows) so a field is findable by name. */
const flatten = (fields: Field[]): Field[] =>
  fields.flatMap((field) =>
    field.type === 'row' || field.type === 'collapsible'
      ? flatten(field.fields)
      : [field],
  )

const groupNamed = (fields: Field[], name: string): GroupField => {
  const group = flatten(fields).find(
    (field): field is GroupField =>
      field.type === 'group' && 'name' in field && field.name === name,
  )
  if (!group) throw new Error(`no group named "${name}"`)
  return group
}

const sectionGroup = groupNamed(Container.fields, 'section')
const backgroundGroup = groupNamed(sectionGroup.fields, 'background')
const backgroundFields = flatten(backgroundGroup.fields)

const selectNamed = (name: string): SelectField => {
  const field = backgroundFields.find(
    (candidate): candidate is SelectField =>
      candidate.type === 'select' &&
      'name' in candidate &&
      candidate.name === name,
  )
  if (!field) throw new Error(`no background select named "${name}"`)
  return field
}

const styleField = selectNamed('style')
const tintField = selectNamed('tint')
const gradientField = selectNamed('gradient')
const directionField = selectNamed('direction')

const optionValues = (field: SelectField) =>
  field.options.map((option) =>
    typeof option === 'string' ? option : option.value,
  )

/** Run a field's admin `condition` against a background group's data. */
const shows = (field: SelectField, style: string) =>
  Boolean(
    field.admin?.condition?.({}, { style } as never, {
      blockData: undefined as never,
      operation: 'create',
      path: [],
      user: null as never,
    }),
  )

/** Every property the renderer may write, as a plain record. */
const styleOf = (background: Parameters<typeof sectionBackgroundStyle>[0]) =>
  sectionBackgroundStyle(background) as unknown as
    Record<string, string> | undefined

/**
 * Guards #37's CSS-variable bridge: the admin vocabulary and the renderer's
 * value maps stay the same sets, the class strings stay static literals, both
 * themes always get a value, and the zinc fallbacks stay the zinc scale.
 */
describe('background style map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(SECTION_BACKGROUND_STYLES.map((entry) => entry.value)).toEqual([
      'none',
      'tint',
      'gradient',
    ])
  })

  it('offers exactly the styles the class map can render', () => {
    expect(new Set(optionValues(styleField))).toEqual(
      new Set(Object.keys(SECTION_BACKGROUND_STYLE_CLASSES)),
    )
    expect(styleField.options).toEqual(SECTION_BACKGROUND_STYLE_OPTIONS)
  })

  it('defaults to no background — the pre-#37 behaviour', () => {
    expect(DEFAULT_SECTION_BACKGROUND_STYLE).toBe('none')
    expect(styleField.defaultValue).toBe(DEFAULT_SECTION_BACKGROUND_STYLE)
    expect(styleField.required).toBe(true)
    expect(sectionBackgroundClass({ style: 'none' })).toBe('')
    expect(sectionBackgroundStyle({ style: 'none' })).toBeUndefined()
  })

  it('names every Postgres enum explicitly, inside the identifier limit', () => {
    const enumNames = [
      styleField.enumName,
      tintField.enumName,
      gradientField.enumName,
      directionField.enumName,
    ]
    expect(enumNames).toEqual([
      'enum_container_section_bg_style',
      'enum_container_section_bg_tint',
      'enum_container_section_bg_gradient',
      'enum_container_section_bg_gradient_direction',
    ])
    for (const name of enumNames) {
      expect(String(name).length).toBeLessThanOrEqual(63)
    }
  })

  it('shows the tint and gradient controls only for the style that uses them', () => {
    expect(shows(tintField, 'tint')).toBe(true)
    expect(shows(tintField, 'gradient')).toBe(false)
    expect(shows(tintField, 'none')).toBe(false)

    for (const field of [gradientField, directionField]) {
      expect(shows(field, 'gradient')).toBe(true)
      expect(shows(field, 'tint')).toBe(false)
      expect(shows(field, 'none')).toBe(false)
    }
  })
})

describe('background classes are static literals', () => {
  it('reads the custom properties instead of naming a colour', () => {
    // The whole point of the bridge: an editor's choice changes the *value*
    // behind these classes, never the class names themselves.
    expect(SECTION_BACKGROUND_STYLE_CLASSES.tint).toBe(
      'bg-[var(--section-bg-color)] dark:bg-[var(--section-bg-color-dark)]',
    )
    expect(SECTION_BACKGROUND_STYLE_CLASSES.gradient).toBe(
      'bg-[image:var(--section-bg-image)] dark:bg-[image:var(--section-bg-image-dark)]',
    )
  })

  it('pairs every base utility with a dark-theme one', () => {
    for (const { className, value } of SECTION_BACKGROUND_STYLES) {
      if (value === 'none') {
        expect(className).toBe('')
        continue
      }
      const classes = className.split(' ')
      expect(classes).toHaveLength(2)
      expect(classes[0].startsWith('dark:')).toBe(false)
      expect(classes[1].startsWith('dark:')).toBe(true)
    }
  })

  it('names only custom properties this module writes', () => {
    const written = new Set([
      SECTION_BACKGROUND_COLOR_VAR,
      SECTION_BACKGROUND_COLOR_DARK_VAR,
      SECTION_BACKGROUND_IMAGE_VAR,
      SECTION_BACKGROUND_IMAGE_DARK_VAR,
    ])
    for (const { className } of SECTION_BACKGROUND_STYLES) {
      for (const referenced of className.matchAll(/--[a-z0-9-]+/g)) {
        expect(written).toContain(referenced[0])
      }
    }
  })

  it('never returns a class string outside the map, whatever is stored', () => {
    const known = new Set(Object.values(SECTION_BACKGROUND_STYLE_CLASSES))
    const stored = [
      undefined,
      null,
      {},
      { style: null },
      { style: '' },
      { style: 'TINT' },
      { style: 'image' },
      { style: 'tint', tint: 'chartreuse' },
      { style: 'gradient', gradient: '#ff0000' },
      { style: 'gradient', direction: '45deg' },
    ]
    for (const value of stored) {
      expect(known).toContain(sectionBackgroundClass(value))
    }
  })
})

describe('background tints', () => {
  it('offers exactly the tints the value map can render', () => {
    expect(new Set(optionValues(tintField))).toEqual(
      new Set(Object.keys(SECTION_BACKGROUND_TINT_VALUES)),
    )
    expect(tintField.options).toEqual(SECTION_BACKGROUND_TINT_OPTIONS)
    expect(tintField.defaultValue).toBe(DEFAULT_SECTION_BACKGROUND_TINT)
  })

  it('writes both themes, and only the colour properties', () => {
    const style = styleOf({ style: 'tint', tint: 'muted' })
    expect(Object.keys(style ?? {})).toEqual([
      SECTION_BACKGROUND_COLOR_VAR,
      SECTION_BACKGROUND_COLOR_DARK_VAR,
    ])
    expect(style?.[SECTION_BACKGROUND_COLOR_VAR]).toBe(
      SECTION_BACKGROUND_ZINC.zinc200,
    )
    expect(style?.[SECTION_BACKGROUND_COLOR_DARK_VAR]).toBe(
      SECTION_BACKGROUND_ZINC.zinc800,
    )
  })

  it('gives every tint a distinct light and dark value', () => {
    // Light/dark parity is an acceptance criterion: a tint that reused one
    // value would read as intentional in one theme and accidental in the
    // other.
    for (const { dark, light, value } of SECTION_BACKGROUND_TINTS) {
      expect(light, value).not.toBe(dark)
      expect(light, value).not.toBe('')
      expect(dark, value).not.toBe('')
    }
  })

  it('falls back to the default tint for a stale or absent value', () => {
    const fallback = SECTION_BACKGROUND_TINT_VALUES[
      DEFAULT_SECTION_BACKGROUND_TINT
    ] as { light: string; dark: string }
    for (const tint of [undefined, null, '', 'zinc-700', 'Subtle']) {
      const style = styleOf({ style: 'tint', tint })
      expect(style?.[SECTION_BACKGROUND_COLOR_VAR], String(tint)).toBe(
        fallback.light,
      )
      expect(style?.[SECTION_BACKGROUND_COLOR_DARK_VAR], String(tint)).toBe(
        fallback.dark,
      )
    }
  })
})

describe('background gradients', () => {
  it('offers exactly the gradients and directions the maps can render', () => {
    expect(new Set(optionValues(gradientField))).toEqual(
      new Set(Object.keys(SECTION_BACKGROUND_GRADIENT_STOPS)),
    )
    expect(new Set(optionValues(directionField))).toEqual(
      new Set(Object.keys(SECTION_BACKGROUND_DIRECTION_CSS)),
    )
    expect(gradientField.options).toEqual(SECTION_BACKGROUND_GRADIENT_OPTIONS)
    expect(directionField.options).toEqual(SECTION_BACKGROUND_DIRECTION_OPTIONS)
    expect(gradientField.defaultValue).toBe(DEFAULT_SECTION_BACKGROUND_GRADIENT)
    expect(directionField.defaultValue).toBe(
      DEFAULT_SECTION_BACKGROUND_DIRECTION,
    )
  })

  it('writes both themes, and only the image properties', () => {
    const style = styleOf({
      style: 'gradient',
      gradient: 'depth',
      direction: 'toRight',
    })
    expect(Object.keys(style ?? {})).toEqual([
      SECTION_BACKGROUND_IMAGE_VAR,
      SECTION_BACKGROUND_IMAGE_DARK_VAR,
    ])
    expect(style?.[SECTION_BACKGROUND_IMAGE_VAR]).toBe(
      `linear-gradient(to right, ${SECTION_BACKGROUND_ZINC.zinc100}, ${SECTION_BACKGROUND_ZINC.zinc200})`,
    )
    expect(style?.[SECTION_BACKGROUND_IMAGE_DARK_VAR]).toBe(
      `linear-gradient(to right, ${SECTION_BACKGROUND_ZINC.zinc900}, ${SECTION_BACKGROUND_ZINC.zinc800})`,
    )
  })

  it('produces a two-stop linear-gradient for every combination', () => {
    for (const gradient of SECTION_BACKGROUND_GRADIENTS) {
      for (const direction of SECTION_BACKGROUND_DIRECTIONS) {
        const style = styleOf({
          style: 'gradient',
          gradient: gradient.value,
          direction: direction.value,
        })
        for (const [theme, property] of [
          ['light', SECTION_BACKGROUND_IMAGE_VAR],
          ['dark', SECTION_BACKGROUND_IMAGE_DARK_VAR],
        ] as const) {
          const stops = gradient[theme]
          expect(
            style?.[property],
            `${gradient.value}/${direction.value}`,
          ).toBe(
            `linear-gradient(${direction.css}, ${stops.from}, ${stops.to})`,
          )
        }
      }
    }
  })

  it('falls back to the default gradient and direction for stale values', () => {
    const style = styleOf({
      style: 'gradient',
      gradient: 'rainbow',
      direction: 'sideways',
    })
    const fallback = SECTION_BACKGROUND_GRADIENT_STOPS[
      DEFAULT_SECTION_BACKGROUND_GRADIENT
    ] as { light: { from: string; to: string } }
    expect(style?.[SECTION_BACKGROUND_IMAGE_VAR]).toBe(
      `linear-gradient(to bottom, ${fallback.light.from}, ${fallback.light.to})`,
    )
  })

  it('keeps every stop inside the curated zinc set', () => {
    const palette = new Set(Object.values(SECTION_BACKGROUND_ZINC))
    for (const gradient of SECTION_BACKGROUND_GRADIENTS) {
      for (const theme of ['light', 'dark'] as const) {
        expect(palette, gradient.value).toContain(gradient[theme].from)
        expect(palette, gradient.value).toContain(gradient[theme].to)
      }
    }
    for (const tint of SECTION_BACKGROUND_TINTS) {
      expect(palette, tint.value).toContain(tint.light)
      expect(palette, tint.value).toContain(tint.dark)
    }
  })
})

describe('the zinc palette stays the design system’s', () => {
  it('falls back to exactly the value Tailwind ships for each token', () => {
    // These values are read from a `style` attribute, which Tailwind's source
    // scan never sees — so the theme variable may not be emitted and the
    // fallback is what actually paints. If Tailwind's zinc scale moves, this
    // fails instead of the site quietly rendering last year's grey.
    const themePath = path.resolve(
      process.cwd(),
      'node_modules/tailwindcss/theme.css',
    )
    const theme = readFileSync(themePath, 'utf8')

    const tokens = Object.values(SECTION_BACKGROUND_ZINC).filter((value) =>
      value.startsWith('var('),
    )
    expect(tokens.length).toBeGreaterThan(0)

    for (const value of tokens) {
      const parsed = /^var\((--[a-z0-9-]+), (.+)\)$/.exec(value)
      expect(parsed, value).not.toBeNull()
      const [, token, fallback] = parsed as RegExpExecArray

      const declared = new RegExp(`^\\s*${token}:\\s*(.+);$`, 'm').exec(theme)
      expect(
        declared,
        `${token} is not declared in ${themePath}`,
      ).not.toBeNull()
      expect((declared as RegExpExecArray)[1], token).toBe(fallback)
    }
  })
})
