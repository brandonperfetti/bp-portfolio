import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { hero } from '@/heros/config'
import {
  DEFAULT_HERO_HEADLINE_VARIANT,
  HERO_HEADLINE_CLASS,
  HERO_HEADLINE_VARIANTS,
  HERO_HEADLINE_VARIANT_ENUM_NAME,
  HERO_HEADLINE_VARIANT_OPTIONS,
  HERO_SOCIAL_REVEAL,
  HERO_SOCIAL_ROW_SPACING_CLASS,
  HERO_SUBTITLE_CLASS,
  HERO_SUBTITLE_REVEAL,
  heroHeadlineVariant,
} from '@/heros/content'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

const heroFields = 'fields' in hero ? hero.fields : []
const field = (name: string) =>
  heroFields.find((f) => 'name' in f && f.name === name)

/** Every hero type, so a matrix assertion can't quietly skip one. */
const HERO_TYPES = ['blank', 'none', 'standard', 'shader'] as const

const conditionOf = (name: string) =>
  (field(name) as { admin?: { condition?: unknown } } | undefined)?.admin
    ?.condition

describe('hero headline variant vocabulary', () => {
  it('offers exactly line and typewriter', () => {
    expect(HERO_HEADLINE_VARIANTS.map((option) => option.value)).toEqual([
      'line',
      'typewriter',
    ])
    expect(HERO_HEADLINE_VARIANT_OPTIONS).toEqual(
      HERO_HEADLINE_VARIANTS.map(({ label, value }) => ({ label, value })),
    )
  })

  it('defaults to line — what RenderHero hard-coded before the field existed', () => {
    expect(DEFAULT_HERO_HEADLINE_VARIANT).toBe('line')
  })

  it('falls back to the default for absent, null and unknown values', () => {
    expect(heroHeadlineVariant(undefined)).toBe('line')
    expect(heroHeadlineVariant(null)).toBe('line')
    expect(heroHeadlineVariant('')).toBe('line')
    expect(heroHeadlineVariant('scramble')).toBe('line')
  })

  it('passes known values through', () => {
    expect(heroHeadlineVariant('line')).toBe('line')
    expect(heroHeadlineVariant('typewriter')).toBe('typewriter')
  })

  it('matches the variants AnimatedHeadline actually implements', () => {
    const source = read('src/components/motion/AnimatedHeadline.tsx')
    for (const { value } of HERO_HEADLINE_VARIANTS) {
      expect(source).toContain(`'${value}'`)
    }
  })
})

describe('hero group config — content fields (#38)', () => {
  it('exposes headlineVariant as a select fed by the shared vocabulary', () => {
    const headlineVariant = field('headlineVariant')
    expect(headlineVariant).toBeDefined()
    expect(headlineVariant).toMatchObject({
      type: 'select',
      defaultValue: DEFAULT_HERO_HEADLINE_VARIANT,
    })
    expect((headlineVariant as { options: unknown }).options).toEqual(
      HERO_HEADLINE_VARIANT_OPTIONS,
    )
  })

  it('names the headline enum explicitly, within Postgres 63-char limit', () => {
    const headlineVariant = field('headlineVariant') as { enumName?: string }
    expect(headlineVariant.enumName).toBe(HERO_HEADLINE_VARIANT_ENUM_NAME)
    expect(String(headlineVariant.enumName).length).toBeLessThanOrEqual(63)
  })

  it('exposes showSocialLinks as a checkbox that defaults to off', () => {
    expect(field('showSocialLinks')).toMatchObject({
      type: 'checkbox',
      defaultValue: false,
    })
  })

  it('exposes revealContent as a checkbox that defaults to off', () => {
    // Opt-in and off by default, so a hero written before #42 emits no
    // ScrollReveal — its subtitle and social row render exactly as they did.
    expect(field('revealContent')).toMatchObject({
      type: 'checkbox',
      defaultValue: false,
    })
  })

  // The ticket said "not per-hero custom social lists" — the row is the
  // Identity global's, and the socialLinks block is where a bespoke list goes.
  it('offers no per-hero social list, only the Identity toggle', () => {
    expect(field('links')).toBeDefined() // the CTA linkGroup, not socials
    expect(field('socialLinks')).toBeUndefined()
    expect(field('sameAs')).toBeUndefined()
  })

  /*
   * The visibility matrix, asserted rather than described. `headlineVariant`,
   * `showSocialLinks` and `revealContent` are visible for `none`, `standard`
   * and `shader` because those three render the content stack — `type: none`
   * is "no hero decoration", not "no hero" (HeroView.test.tsx pins that
   * behaviour). `blank` is the one type that renders nothing at all, so every
   * field is meaningless under it and gated off (HeroView returns null for
   * `blank`; HeroView.test.tsx pins that too).
   */
  it('gates each field to the types it can actually affect', () => {
    const expected: Record<
      string,
      Record<(typeof HERO_TYPES)[number], boolean>
    > = {
      presentation: {
        blank: false,
        none: false,
        standard: false,
        shader: true,
      },
      shaderPreset: {
        blank: false,
        none: false,
        standard: false,
        shader: true,
      },
      rhythm: { blank: false, none: false, standard: false, shader: true },
      media: { blank: false, none: false, standard: true, shader: false },
      headlineVariant: {
        blank: false,
        none: true,
        standard: true,
        shader: true,
      },
      showSocialLinks: {
        blank: false,
        none: true,
        standard: true,
        shader: true,
      },
      revealContent: { blank: false, none: true, standard: true, shader: true },
    }

    for (const [name, byType] of Object.entries(expected)) {
      const condition = conditionOf(name) as
        ((data: unknown, sibling: { type?: string }) => boolean) | undefined

      for (const type of HERO_TYPES) {
        const visible = condition ? condition({}, { type }) : true
        expect(visible, `${name} under type: ${type}`).toBe(byType[type])
      }
    }
  })

  it('carries no subtitle of its own — Pages.subtitle is the single source', () => {
    expect(field('subtitle')).toBeUndefined()
  })

  /*
   * `blank` (W4B1): an additive fourth type that renders no hero at all, for a
   * page whose H1 lives in an in-column `heading` block (the about page). It is
   * added alongside the existing three, never replacing them, and the default
   * stays `standard`, so no stored page becomes blank without a deliberate edit.
   */
  it('offers a blank type alongside the existing three, still defaulting to standard', () => {
    const type = field('type') as {
      options?: { value: string }[]
      defaultValue?: string
      required?: boolean
    }
    expect(type.options?.map((option) => option.value)).toEqual([
      'blank',
      'none',
      'standard',
      'shader',
    ])
    expect(type.defaultValue).toBe('standard')
    expect(type.required).toBe(true)
  })
})

/*
 * The hero content stack reproduces live Home's treatment. Since #42 flipped
 * `/` onto the page builder, `HeroView` *is* what renders Home's hero, so these
 * constants are now the single source of that treatment rather than a copy of a
 * hard-coded route. This block pins them to the literals Home shipped so the
 * builder hero can't silently drift; `HeroView.test.tsx` asserts the constants
 * actually reach the rendered DOM.
 *
 * (Before the flip these read `src/app/(frontend)/page.tsx` and cross-checked
 * against the hard-coded home JSX; that JSX is gone, so the cross-check is now
 * a literal pin.)
 */
describe('homepage hero parity', () => {
  it('shares the homepage headline classes', () => {
    expect(HERO_HEADLINE_CLASS).toBe(
      'text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100',
    )
  })

  it('shares the homepage subtitle classes', () => {
    expect(HERO_SUBTITLE_CLASS).toBe(
      'mt-6 text-base text-zinc-600 dark:text-zinc-400',
    )
  })

  it('offers the typewriter variant the homepage headline uses', () => {
    expect(HERO_HEADLINE_VARIANTS.map((v) => v.value)).toContain('typewriter')
  })

  it('spaces the social row the way the homepage does', () => {
    expect(HERO_SOCIAL_ROW_SPACING_CLASS).toBe('mt-6')
  })

  /**
   * The opt-in `revealContent` reveal params (#42): when on, the hero wraps its
   * subtitle and social row in Home's two `ScrollReveal`s. Pinned to Home's
   * literals so the shared params can't drift from the treatment they reproduce.
   */
  it('carries the homepage subtitle reveal params', () => {
    expect(HERO_SUBTITLE_REVEAL).toEqual({ y: 14, duration: 0.78, delay: 0.26 })
  })

  it('carries the homepage social-row reveal params', () => {
    expect(HERO_SOCIAL_REVEAL).toEqual({ y: 10, duration: 0.68, delay: 0.37 })
  })
})
