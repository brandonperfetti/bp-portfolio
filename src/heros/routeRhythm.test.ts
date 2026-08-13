import { describe, expect, it } from 'vitest'

import { hero } from '@/heros/config'
import {
  HERO_FULL_BLEED_FRAME_CLASS,
  HERO_FULL_BLEED_HOME_FRAME_CLASS,
  HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS,
} from '@/heros/presentation'
import {
  DEFAULT_ROUTE_RHYTHM,
  ROUTE_RHYTHMS,
  ROUTE_RHYTHM_ENUM_NAME,
  ROUTE_RHYTHM_OPTIONS,
  ROUTE_RHYTHM_PROFILES,
  routeRhythm,
  routeRhythmProfile,
} from '@/heros/routeRhythm'

const heroFields = 'fields' in hero ? hero.fields : []
const field = (name: string) =>
  heroFields.find((f) => 'name' in f && f.name === name)

describe('route rhythm vocabulary', () => {
  it('offers exactly standard and home parity', () => {
    expect(ROUTE_RHYTHMS.map((option) => option.value)).toEqual([
      'standard',
      'homeParity',
    ])
    expect(ROUTE_RHYTHM_OPTIONS).toEqual(
      ROUTE_RHYTHMS.map(({ label, value }) => ({ label, value })),
    )
  })

  it('defaults to standard — the route rhythm every existing page renders', () => {
    expect(DEFAULT_ROUTE_RHYTHM).toBe('standard')
  })

  it('falls back to the default for absent, null and unknown values', () => {
    expect(routeRhythm(undefined)).toBe('standard')
    expect(routeRhythm(null)).toBe('standard')
    expect(routeRhythm('')).toBe('standard')
    expect(routeRhythm('flush')).toBe('standard')
  })

  it('passes known values through', () => {
    expect(routeRhythm('standard')).toBe('standard')
    expect(routeRhythm('homeParity')).toBe('homeParity')
  })
})

describe('route rhythm profiles', () => {
  it('isolates the wrapper in every rhythm — the full-bleed stacking contract', () => {
    for (const rhythm of ROUTE_RHYTHMS.map((r) => r.value)) {
      expect(
        ROUTE_RHYTHM_PROFILES[rhythm].containerClass.split(/\s+/),
        `${rhythm} container must carry the isolation class`,
      ).toContain(HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS)
    }
  })

  it('standard reproduces the historical route literals — the non-regression anchor', () => {
    // `[slug]/page.tsx` keeps these literals verbatim in its default branch;
    // this pins the profile to them so an edit here can't silently change the
    // default page's rhythm without a failing test.
    expect(ROUTE_RHYTHM_PROFILES.standard).toEqual({
      containerClass: 'isolate mt-16 sm:mt-32',
      heroWrapperClass: null,
      blocksWrapperClass: 'mt-8',
      heroFullBleedFrameClass: HERO_FULL_BLEED_FRAME_CLASS,
    })
  })

  it('home parity drops the top margin and carries the homepage hero padding', () => {
    const profile = ROUTE_RHYTHM_PROFILES.homeParity
    expect(profile.containerClass).toBe(HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS)
    expect(profile.containerClass).not.toContain('mt-')
    expect(profile.heroWrapperClass).toBe('pt-9 pb-16 sm:pb-20')
    expect(profile.blocksWrapperClass).toBe('')
    expect(profile.heroFullBleedFrameClass).toBe(
      HERO_FULL_BLEED_HOME_FRAME_CLASS,
    )
  })

  it('the two rhythms draw different canvas frames', () => {
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).not.toBe(
      HERO_FULL_BLEED_FRAME_CLASS,
    )
    // Same horizontal breakout box; the vertical pull and the height differ,
    // because home parity reaches the tall home header (pull) and then extends
    // the box to hold the same bottom fade (height). See
    // HERO_FULL_BLEED_HOME_FRAME_CLASS in `src/heros/presentation.ts`.
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).toContain('w-screen')
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).toContain('-z-10')
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).toContain('h-[43.5rem]')
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).not.toContain('h-[36rem]')
  })

  it('routeRhythmProfile resolves a stored value straight to its profile', () => {
    expect(routeRhythmProfile('homeParity')).toBe(
      ROUTE_RHYTHM_PROFILES.homeParity,
    )
    expect(routeRhythmProfile(null)).toBe(ROUTE_RHYTHM_PROFILES.standard)
    expect(routeRhythmProfile('flush')).toBe(ROUTE_RHYTHM_PROFILES.standard)
  })
})

describe('hero group config — rhythm field (#42)', () => {
  it('exposes rhythm as a select fed by the shared vocabulary', () => {
    const rhythm = field('rhythm')
    expect(rhythm).toBeDefined()
    expect(rhythm).toMatchObject({
      type: 'select',
      defaultValue: DEFAULT_ROUTE_RHYTHM,
    })
    expect((rhythm as { options: unknown }).options).toEqual(
      ROUTE_RHYTHM_OPTIONS,
    )
  })

  it('names the rhythm enum explicitly, within Postgres 63-char limit', () => {
    const rhythm = field('rhythm') as { enumName?: string }
    expect(rhythm.enumName).toBe(ROUTE_RHYTHM_ENUM_NAME)
    expect(String(rhythm.enumName).length).toBeLessThanOrEqual(63)
  })

  it('shows the rhythm control only for a shader hero', () => {
    const condition = (
      field('rhythm') as {
        admin?: { condition?: (...args: never[]) => boolean }
      }
    ).admin?.condition as unknown as (
      data: unknown,
      sibling: { type?: string },
    ) => boolean

    expect(condition({}, { type: 'shader' })).toBe(true)
    expect(condition({}, { type: 'standard' })).toBe(false)
    expect(condition({}, { type: 'none' })).toBe(false)
  })
})
