// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

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

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

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
   * The pixel-parity gate for the about page's photo placement. The hand-built
   * `about/page.tsx` is still the read-only target: its portrait rail is
   * `hidden lg:block` (desktop only), and its inline mobile portrait plus the
   * mobile social row are `lg:hidden` (mobile only). `desktopOnly`/`mobileOnly`
   * *are* those classes, so a future edit to either the page or the vocabulary
   * fails loudly here — the way `inset.test.ts` pins the rail inset.
   */
  it('reproduces the about-page breakpoint read from about/page.tsx', () => {
    const aboutSource = read('src/app/(frontend)/about/page.tsx')
    // The mobile-only portrait and social row toggle contiguously.
    expect(aboutSource).toContain('lg:hidden')
    // The desktop rail toggles with the same two tokens the vocab uses.
    expect(aboutSource).toContain('hidden')
    expect(aboutSource).toContain('lg:block')
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
