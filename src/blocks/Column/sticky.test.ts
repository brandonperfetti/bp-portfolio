// @vitest-environment node
import type { CheckboxField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Column } from '@/blocks/Column/config'
import { STICKY_COLUMN_CLASS, stickyColumnClass } from '@/blocks/Column/sticky'

const stickyField = Column.fields.find(
  (field): field is CheckboxField =>
    field.type === 'checkbox' && 'name' in field && field.name === 'sticky',
)

/**
 * Guards #29's sticky control: one blessed desktop offset, off by default,
 * and the three classes it takes to actually stick inside a grid.
 */
describe('sticky column', () => {
  it('is a checkbox that starts off', () => {
    expect(stickyField).toBeDefined()
    expect(stickyField?.defaultValue).toBe(false)
  })

  it('sticks only from lg up, at the one blessed offset', () => {
    // The hard-coded homepage rail's offset — #29 explicitly does not offer
    // per-breakpoint offsets, so this string is the whole vocabulary.
    expect(STICKY_COLUMN_CLASS).toContain('lg:sticky')
    expect(STICKY_COLUMN_CLASS).toContain('lg:top-10')
    expect(STICKY_COLUMN_CLASS).not.toMatch(/(^| )sticky( |$)/)
    expect(STICKY_COLUMN_CLASS).not.toMatch(/(sm|md|xl|2xl):(sticky|top-)/)
  })

  it('pins itself to the top of the row so there is something to stick in', () => {
    // A grid item stretches to its row height by default, which leaves the
    // column no slack to travel through — `self-start` is load-bearing, not
    // decoration, and it deliberately overrides the container's alignment.
    expect(STICKY_COLUMN_CLASS).toContain('self-start')
  })

  it('adds nothing at all when the checkbox is off', () => {
    expect(stickyColumnClass(false)).toBe('')
    expect(stickyColumnClass(null)).toBe('')
    expect(stickyColumnClass(undefined)).toBe('')
    expect(stickyColumnClass(true)).toBe(STICKY_COLUMN_CLASS)
  })
})
