// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { ImageBlock } from '@/blocks/Image/config'
import { IMAGE_SIZE_CLASSES } from '@/blocks/Image/treatment'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

const sizeField = ImageBlock.fields.find(
  (field): field is SelectField =>
    field.type === 'select' && 'name' in field && field.name === 'size',
)

const configValues = (sizeField?.options ?? []).map((option) =>
  typeof option === 'string' ? option : option.value,
)

/**
 * The image block's mobile-size control: the minimal, additive way to offer
 * the about-page portrait's compact-centered phone treatment as an editor
 * choice, without disturbing the full-width column fill. Default `full`
 * contributes nothing and keeps every existing block byte-identical;
 * `compact` is the one about-parity step, and it only ever changes the view
 * below `lg`. The shape `inset.test.ts` uses for the inset map.
 */
describe('image size map', () => {
  it('offers exactly the sizes the class map can render', () => {
    expect(new Set(configValues)).toEqual(
      new Set(Object.keys(IMAGE_SIZE_CLASSES)),
    )
  })

  /**
   * The additive-safety gate: `full` is the default and renders no class, so
   * every image block that predates this option — every row the migration
   * back-fills with `'full'` — produces byte-identical markup to before.
   */
  it('defaults to full — no width class, the behaviour the image always had', () => {
    expect(sizeField?.defaultValue).toBe('full')
    expect(IMAGE_SIZE_CLASSES.full).toBe('')
  })

  it('names the Postgres enum explicitly (deeply nested, 63-char limit)', () => {
    expect(sizeField?.enumName).toBe('enum_image_size')
    expect(String(sizeField?.enumName).length).toBeLessThanOrEqual(63)
  })

  it('writes only literal, scannable Tailwind — unprefixed or lg:-prefixed', () => {
    for (const className of Object.values(IMAGE_SIZE_CLASSES)) {
      for (const token of className.split(' ').filter(Boolean)) {
        expect(token).toMatch(/^(lg:)?[a-z]/)
      }
    }
  })

  /**
   * The parity gate for the about-page rail portrait's mobile half: its
   * wrapper is `mx-auto max-w-xs px-2.5 lg:max-w-none`, so on a phone it
   * centers at `max-w-xs` and from `lg` up it releases to full width. `px-2.5`
   * is the existing `inset: xs`; `compact` *is* the `mx-auto max-w-xs
   * lg:max-w-none` half, read straight out of the hand-built page the way
   * `inset.test.ts` reads its rail inset so the treatment can't drift.
   */
  it('reproduces the about-page portrait compact treatment read from about/page.tsx', () => {
    const aboutSource = read('src/app/(frontend)/about/page.tsx')
    expect(aboutSource).toContain('max-w-xs')
    expect(aboutSource).toContain('lg:max-w-none')
    expect(IMAGE_SIZE_CLASSES.compact).toBe('mx-auto max-w-xs lg:max-w-none')
  })
})
