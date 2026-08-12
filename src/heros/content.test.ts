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
  HERO_SOCIAL_ROW_SPACING_CLASS,
  HERO_SUBTITLE_CLASS,
  heroHeadlineVariant,
} from '@/heros/content'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

const heroFields = 'fields' in hero ? hero.fields : []
const field = (name: string) =>
  heroFields.find((f) => 'name' in f && f.name === name)

/** Every hero type, so a matrix assertion can't quietly skip one. */
const HERO_TYPES = ['none', 'standard', 'shader'] as const

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

  // The ticket said "not per-hero custom social lists" — the row is the
  // Identity global's, and the socialLinks block is where a bespoke list goes.
  it('offers no per-hero social list, only the Identity toggle', () => {
    expect(field('links')).toBeDefined() // the CTA linkGroup, not socials
    expect(field('socialLinks')).toBeUndefined()
    expect(field('sameAs')).toBeUndefined()
  })

  /*
   * The visibility matrix, asserted rather than described. `headlineVariant`
   * and `showSocialLinks` are unconditional because all three hero types
   * render the content stack — `type: none` is "no hero decoration", not "no
   * hero" (HeroView.test.tsx pins that behaviour). Gating them off `none`
   * would hide a control that visibly does something.
   */
  it('gates each field to the types it can actually affect', () => {
    const expected: Record<
      string,
      Record<(typeof HERO_TYPES)[number], boolean>
    > = {
      presentation: { none: false, standard: false, shader: true },
      shaderPreset: { none: false, standard: false, shader: true },
      media: { none: false, standard: true, shader: false },
      headlineVariant: { none: true, standard: true, shader: true },
      showSocialLinks: { none: true, standard: true, shader: true },
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
})

/*
 * The hero content stack exists to reproduce the homepage's, and the homepage
 * still hard-codes its own (#42 migrates it). Until then these read the
 * homepage source and fail loudly if either side drifts — the guard
 * `hostContext.test.ts` uses for the column stack spacing.
 */
describe('homepage hero parity', () => {
  const homepage = read('src/app/(frontend)/page.tsx')

  it('shares the homepage headline classes', () => {
    expect(homepage).toContain(HERO_HEADLINE_CLASS)
  })

  it('shares the homepage subtitle classes', () => {
    expect(homepage).toContain(HERO_SUBTITLE_CLASS)
  })

  it('offers the typewriter variant the homepage headline uses', () => {
    expect(homepage).toContain('variant="typewriter"')
    expect(HERO_HEADLINE_VARIANTS.map((v) => v.value)).toContain('typewriter')
  })

  it('spaces the social row the way the homepage does', () => {
    expect(homepage).toContain(`${HERO_SOCIAL_ROW_SPACING_CLASS} flex gap-6`)
  })

  it('reads its title and subtitle from the same Pages fields the hero does', () => {
    expect(homepage).toContain('homePage?.title')
    expect(homepage).toContain('homePage?.subtitle')
  })
})
