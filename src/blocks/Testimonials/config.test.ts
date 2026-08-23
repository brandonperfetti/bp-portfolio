// @vitest-environment node
import type { Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TESTIMONIALS_LAYOUT,
  TESTIMONIALS_LAYOUT_ENUM_NAME,
  Testimonials,
} from '@/blocks/Testimonials/config'

const named = (fields: Field[], name: string): Field | undefined =>
  fields.find(
    (f): f is Field & { name: string } => 'name' in f && f.name === name,
  )

/** Guards #61's `layout` option: identity, the enum, and the grid default. */
describe('Testimonials block config', () => {
  it('registers as the testimonials block', () => {
    expect(Testimonials.slug).toBe('testimonials')
    expect(Testimonials.interfaceName).toBe('TestimonialsBlock')
  })

  it('adds a layout select naming its enum, inside the 63-char identifier limit', () => {
    const layout = named(Testimonials.fields, 'layout') as SelectField
    expect(layout.type).toBe('select')
    // Optional on purpose: an absent value renders as grid, so the type stays
    // nullable and existing TestimonialsBlock fixtures need no forced edit.
    expect(layout.required).toBeUndefined()
    expect(layout.enumName).toBe(TESTIMONIALS_LAYOUT_ENUM_NAME)
    expect(TESTIMONIALS_LAYOUT_ENUM_NAME.length).toBeLessThanOrEqual(63)
  })

  it('defaults the layout to grid so existing content is unchanged', () => {
    const layout = named(Testimonials.fields, 'layout') as SelectField
    expect(layout.defaultValue).toBe('grid')
    expect(DEFAULT_TESTIMONIALS_LAYOUT).toBe('grid')
  })

  it('offers exactly grid and carousel', () => {
    const layout = named(Testimonials.fields, 'layout') as SelectField
    const values = (layout.options as { value: string }[]).map((o) => o.value)
    expect(values).toEqual(['grid', 'carousel'])
  })

  it('keeps the existing items array (quote/name required, max 6)', () => {
    const items = named(Testimonials.fields, 'items') as Field & {
      type: string
      maxRows?: number
      fields: Field[]
    }
    expect(items.type).toBe('array')
    expect(items.maxRows).toBe(6)
    const quote = named(items.fields, 'quote') as Field & { required?: boolean }
    const name = named(items.fields, 'name') as Field & { required?: boolean }
    expect(quote.required).toBe(true)
    expect(name.required).toBe(true)
  })
})
