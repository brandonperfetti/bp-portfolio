// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { CheckboxField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Column } from '@/blocks/Column/config'
import {
  COLUMN_REVEAL_PARAMS,
  COLUMN_REVEAL_TARGET_ATTR,
  columnRevealParams,
} from '@/blocks/Column/reveal'

const revealField = Column.fields.find(
  (field): field is CheckboxField =>
    field.type === 'checkbox' &&
    'name' in field &&
    field.name === 'revealChildren',
)

/**
 * Guards the column child-reveal control: a checkbox off by default, and the
 * one blessed set of reveal params — the homepage rail's exact
 * `targets="[data-reveal-item]" y={20} stagger={0.16}` — kept in step with
 * the route it reproduces, the way `sticky.test.ts` guards the sticky offset.
 */
describe('column child reveal', () => {
  it('is a checkbox that starts off', () => {
    expect(revealField).toBeDefined()
    expect(revealField?.defaultValue).toBe(false)
  })

  it('emits no params at all when the checkbox is off', () => {
    // `undefined` is the renderer's signal to emit no ScrollReveal wrapper —
    // the default has to be byte-identical to a column with no reveal.
    expect(columnRevealParams(false)).toBeUndefined()
    expect(columnRevealParams(null)).toBeUndefined()
    expect(columnRevealParams(undefined)).toBeUndefined()
  })

  it('emits the homepage rail params when on', () => {
    expect(columnRevealParams(true)).toEqual(COLUMN_REVEAL_PARAMS)
    expect(COLUMN_REVEAL_PARAMS).toEqual({
      targets: '[data-reveal-item]',
      y: 20,
      stagger: 0.16,
    })
  })

  it('targets the marker each revealed child carries', () => {
    expect(COLUMN_REVEAL_TARGET_ATTR).toBe('data-reveal-item')
    expect(COLUMN_REVEAL_PARAMS.targets).toBe(`[${COLUMN_REVEAL_TARGET_ATTR}]`)
  })

  /**
   * The pixel-parity gate: the homepage wraps its sticky rail in exactly this
   * ScrollReveal, marking each rail card with `data-reveal-item`. Reading the
   * params back out of the route means neither side can drift silently.
   */
  it('matches the homepage rail reveal', () => {
    const homepage = readFileSync(
      path.join(process.cwd(), 'src/app/(frontend)/page.tsx'),
      'utf8',
    )
    const reveal = homepage.match(
      /targets="\[data-reveal-item\]"\s+y=\{(\d+)\}\s+stagger=\{([\d.]+)\}/,
    )
    expect(
      reveal,
      'homepage rail no longer wraps its children in the expected ScrollReveal — re-derive COLUMN_REVEAL_PARAMS',
    ).not.toBeNull()

    const [, y, stagger] = reveal as RegExpMatchArray
    expect(COLUMN_REVEAL_PARAMS.y).toBe(Number(y))
    expect(COLUMN_REVEAL_PARAMS.stagger).toBe(Number(stagger))
    expect(homepage).toContain('data-reveal-item')
  })
})
