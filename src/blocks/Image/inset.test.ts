// @vitest-environment node
import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { ImageBlock } from '@/blocks/Image/config'
import { IMAGE_INSET_CLASSES } from '@/blocks/Image/treatment'

const insetField = ImageBlock.fields.find(
  (field): field is SelectField =>
    field.type === 'select' && 'name' in field && field.name === 'inset',
)

const configValues = (insetField?.options ?? []).map((option) =>
  typeof option === 'string' ? option : option.value,
)

/**
 * The image block's horizontal-inset control: the minimal, additive way to
 * reproduce the ~20px the about-page portrait keeps inside its narrow rail
 * (`px-2.5`, 10px a side). Default `none` fills the width exactly as before;
 * `xs` is the one about-parity step. The shape `inset.test.ts` uses for the
 * column inset map.
 */
describe('image inset map', () => {
  it('offers exactly the insets the class map can render', () => {
    expect(new Set(configValues)).toEqual(
      new Set(Object.keys(IMAGE_INSET_CLASSES)),
    )
  })

  it('defaults to none — no padding, the behaviour the image always had', () => {
    expect(insetField?.defaultValue).toBe('none')
    expect(IMAGE_INSET_CLASSES.none).toBe('')
  })

  it('names the Postgres enum explicitly (deeply nested, 63-char limit)', () => {
    expect(insetField?.enumName).toBe('enum_image_inset')
    expect(String(insetField?.enumName).length).toBeLessThanOrEqual(63)
  })

  it('writes only literal, unprefixed horizontal padding Tailwind can scan', () => {
    for (const className of Object.values(IMAGE_INSET_CLASSES)) {
      expect(className).toMatch(/^$|^px-[\d.]+$/)
    }
  })

  /**
   * The pixel-parity pin for the about-page rail portrait: it fills the rail
   * but keeps `px-2.5`, so `xs` *is* that inset. The #44 flip put `/about` on
   * the page builder and deleted the hand-built JSX this once cross-checked
   * (the way the #42 home flip retired its source guards), so `treatment.ts` is
   * now the sole source of truth for the literal.
   */
  it('pins the about-page rail portrait inset', () => {
    expect(IMAGE_INSET_CLASSES.xs).toBe('px-2.5')
  })
})
