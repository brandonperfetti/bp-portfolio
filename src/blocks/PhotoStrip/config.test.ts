// @vitest-environment node
import type { CheckboxField, Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { PhotoStrip } from '@/blocks/PhotoStrip/config'

/** Flatten presentational wrappers (rows) so a field is findable by name. */
const flatten = (fields: Field[]): Field[] =>
  fields.flatMap((field) =>
    field.type === 'row' || field.type === 'collapsible'
      ? flatten(field.fields)
      : [field],
  )

const checkbox = (name: string): CheckboxField => {
  const field = flatten(PhotoStrip.fields).find(
    (candidate): candidate is CheckboxField =>
      candidate.type === 'checkbox' &&
      'name' in candidate &&
      candidate.name === name,
  )
  if (!field) throw new Error(`no checkbox field named "${name}"`)
  return field
}

/**
 * Guards the two display controls the Home migration needs on the photo strip
 * (#42): a full-bleed breakout and an LCP-priority flag, both additive and
 * both off by default so a block written before they existed renders
 * byte-identical (inside the reading column, no priority image).
 */
describe('photo strip block config', () => {
  it('keeps the required images upload as the block content', () => {
    const images = PhotoStrip.fields.find(
      (field) => 'name' in field && field.name === 'images',
    )
    expect(images).toMatchObject({ type: 'upload', required: true })
  })

  it('exposes fullBleed as a checkbox that defaults off', () => {
    expect(checkbox('fullBleed')).toMatchObject({
      type: 'checkbox',
      defaultValue: false,
    })
  })

  it('exposes priority as a checkbox that defaults off', () => {
    expect(checkbox('priority')).toMatchObject({
      type: 'checkbox',
      defaultValue: false,
    })
  })
})
