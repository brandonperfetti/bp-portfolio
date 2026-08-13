// @vitest-environment node
import type { Block, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Column } from '@/blocks/Column/config'
import { ImageBlock } from '@/blocks/Image/config'
import { SocialLinks } from '@/blocks/SocialLinks/config'
import {
  BLOCK_VISIBILITIES,
  BLOCK_VISIBILITY_CLASSES,
  BLOCK_VISIBILITY_ENUM_NAME,
  BLOCK_VISIBILITY_OPTIONS,
  DEFAULT_BLOCK_VISIBILITY,
  visibilityClass,
  visibilityField,
} from '@/blocks/visibility'

const visibilityFieldOf = (block: Block) =>
  block.fields.find(
    (field): field is SelectField =>
      field.type === 'select' && 'name' in field && field.name === 'visibility',
  )

/**
 * The responsive-visibility vocabulary (audit gap #6): the admin's options and
 * the renderer's class lookup are one set, the classes reproduce the exact
 * breakpoint the hand-built about page uses, and the default is the empty class
 * that keeps every existing page byte-identical. The shape `inset.test.ts` uses
 * for the column inset map.
 */
describe('responsive visibility map', () => {
  it('exposes the settled vocabulary in admin order', () => {
    expect(BLOCK_VISIBILITIES.map((entry) => entry.value)).toEqual([
      'always',
      'desktopOnly',
      'mobileOnly',
    ])
  })

  it('offers exactly the values the class map can render', () => {
    expect(new Set(BLOCK_VISIBILITY_OPTIONS.map((o) => o.value))).toEqual(
      new Set(Object.keys(BLOCK_VISIBILITY_CLASSES)),
    )
  })

  it('defaults to always — an empty class, so no wrapper and no change', () => {
    expect(DEFAULT_BLOCK_VISIBILITY).toBe('always')
    expect(BLOCK_VISIBILITY_CLASSES.always).toBe('')
  })

  it('falls back to always (visible) for missing or unknown values', () => {
    expect(visibilityClass(null)).toBe('')
    expect(visibilityClass(undefined)).toBe('')
    expect(visibilityClass('someday')).toBe('')
    expect(visibilityClass('desktopOnly')).toBe('hidden lg:block')
    expect(visibilityClass('mobileOnly')).toBe('lg:hidden')
  })

  it('writes only literal display classes at the lg breakpoint', () => {
    for (const { className } of BLOCK_VISIBILITIES) {
      // Empty (always), or `hidden`/`block`/`hidden` toggled at `lg` — never an
      // interpolated or non-lg breakpoint that would toggle at the wrong width.
      expect(className).toMatch(/^$|^(hidden lg:block|lg:hidden)$/)
    }
  })

  /**
   * The pixel-parity pin for the about page's photo placement. The #44 flip put
   * `/about` on the page builder and deleted the hand-built `about/page.tsx` JSX
   * this once cross-checked (the way the #42 home flip retired its 7 source
   * guards), so the vocabulary is now the sole source of truth: the about
   * portrait rail is `desktopOnly` (`hidden lg:block`), and its inline mobile
   * portrait plus mobile social row are `mobileOnly` (`lg:hidden`). These
   * literals are the exact breakpoint classes the hand-built page used.
   */
  it('pins the about-page desktop/mobile breakpoint classes', () => {
    expect(BLOCK_VISIBILITY_CLASSES.desktopOnly).toBe('hidden lg:block')
    expect(BLOCK_VISIBILITY_CLASSES.mobileOnly).toBe('lg:hidden')
  })
})

/**
 * The shared field factory: one shape, one enum, one default across every
 * block that opts in — so the three call sites cannot drift.
 */
describe('visibilityField factory', () => {
  it('builds an optional select on the shared enum, defaulting to always', () => {
    const field = visibilityField()
    expect(field.type).toBe('select')
    expect(field.name).toBe('visibility')
    expect(field.enumName).toBe(BLOCK_VISIBILITY_ENUM_NAME)
    expect(BLOCK_VISIBILITY_ENUM_NAME).toBe('enum_block_visibility')
    expect(String(field.enumName).length).toBeLessThanOrEqual(63)
    expect(field.defaultValue).toBe('always')
    expect(field.options).toEqual(BLOCK_VISIBILITY_OPTIONS)
    // Optional, not required: the additive field must leave existing image,
    // socialLinks and column fixtures valid without a value.
    expect(field.required).not.toBe(true)
  })

  it('returns a fresh field each call, so no two blocks share a mutable object', () => {
    expect(visibilityField()).not.toBe(visibilityField())
  })
})

/**
 * Every block About composes with — `image`, `socialLinks`, `column` — carries
 * the field, wired through the one factory.
 */
describe('visibility field on the About-parity blocks', () => {
  it.each([
    ['image', ImageBlock],
    ['socialLinks', SocialLinks],
    ['column', Column],
  ] as const)('adds the shared visibility field to %s', (_slug, block) => {
    const field = visibilityFieldOf(block)
    expect(field).toBeDefined()
    expect(field?.enumName).toBe(BLOCK_VISIBILITY_ENUM_NAME)
    expect(field?.defaultValue).toBe('always')
    expect(field?.options).toEqual(BLOCK_VISIBILITY_OPTIONS)
    expect(field?.required).not.toBe(true)
  })
})
