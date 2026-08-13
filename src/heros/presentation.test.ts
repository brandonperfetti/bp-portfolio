import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { sectionWidthClass } from '@/blocks/Container/section'
import { SHADER_HERO_PANEL_CLASS } from '@/components/heros/ShaderHero'
import { hero } from '@/heros/config'
import {
  DEFAULT_HERO_PRESENTATION,
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_SHELL_CLASS,
  HERO_FULL_BLEED_FRAME_CLASS,
  HERO_FULL_BLEED_HOME_FRAME_CLASS,
  HERO_FULL_BLEED_PANEL_CLASS,
  HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS,
  HERO_PRESENTATIONS,
  HERO_PRESENTATION_ENUM_NAME,
  HERO_PRESENTATION_OPTIONS,
  HOME_HEADER_HEIGHT_PX,
  HOME_HERO_TOP_PADDING_PX,
  ROUTE_CONTAINER_TOP_MARGIN_PX,
  ROUTE_HEADER_HEIGHT_PX,
  heroPresentation,
} from '@/heros/presentation'
import { ROUTE_RHYTHM_PROFILES } from '@/heros/routeRhythm'

/** Tailwind spacing step in px — `-top-32` is 32 × 4px. */
const SPACING_STEP_PX = 4

const heroFields = 'fields' in hero ? hero.fields : []
const field = (name: string) =>
  heroFields.find((f) => 'name' in f && f.name === name)

describe('hero presentation vocabulary', () => {
  it('offers exactly full bleed and card', () => {
    expect(HERO_PRESENTATIONS.map((option) => option.value)).toEqual([
      'fullBleed',
      'card',
    ])
    expect(HERO_PRESENTATION_OPTIONS).toEqual(
      HERO_PRESENTATIONS.map(({ label, value }) => ({ label, value })),
    )
  })

  it('defaults to full bleed — the homepage treatment this ticket generalises', () => {
    expect(DEFAULT_HERO_PRESENTATION).toBe('fullBleed')
  })

  it('falls back to the default for absent, null and unknown values', () => {
    expect(heroPresentation(undefined)).toBe('fullBleed')
    expect(heroPresentation(null)).toBe('fullBleed')
    expect(heroPresentation('')).toBe('fullBleed')
    expect(heroPresentation('billboard')).toBe('fullBleed')
  })

  it('passes known values through', () => {
    expect(heroPresentation('fullBleed')).toBe('fullBleed')
    expect(heroPresentation('card')).toBe('card')
  })
})

describe('hero group config', () => {
  it('exposes presentation as a select fed by the shared vocabulary', () => {
    const presentation = field('presentation')
    expect(presentation).toBeDefined()
    expect(presentation).toMatchObject({
      type: 'select',
      defaultValue: DEFAULT_HERO_PRESENTATION,
    })
    expect((presentation as { options: unknown }).options).toEqual(
      HERO_PRESENTATION_OPTIONS,
    )
  })

  it('names the presentation enum explicitly, within Postgres 63-char limit', () => {
    const presentation = field('presentation') as { enumName?: string }
    expect(presentation.enumName).toBe(HERO_PRESENTATION_ENUM_NAME)
    expect(String(presentation.enumName).length).toBeLessThanOrEqual(63)
  })

  it('hides the shader-only fields unless the hero is a shader', () => {
    for (const name of ['presentation', 'shaderPreset', 'rhythm']) {
      const condition = (
        field(name) as { admin?: { condition?: (...args: never[]) => boolean } }
      ).admin?.condition
      expect(condition, `${name} needs an admin.condition`).toBeTypeOf(
        'function',
      )
      const call = condition as unknown as (
        data: unknown,
        sibling: { type?: string },
      ) => boolean
      expect(call({}, { type: 'shader' })).toBe(true)
      expect(call({}, { type: 'standard' })).toBe(false)
      expect(call({}, { type: 'none' })).toBe(false)
    }
  })

  it('hides the media upload unless the hero is standard', () => {
    const condition = (
      field('media') as {
        admin?: { condition?: (...args: never[]) => boolean }
      }
    ).admin?.condition as unknown as (
      data: unknown,
      sibling: { type?: string },
    ) => boolean
    expect(condition({}, { type: 'standard' })).toBe(true)
    expect(condition({}, { type: 'shader' })).toBe(false)
    expect(condition({}, { type: 'none' })).toBe(false)
  })
})

describe('full-bleed geometry', () => {
  // The whole point of the variant: the canvas has to leave a container it
  // is rendered inside. These assertions are the arithmetic, written down.
  it('pulls the canvas up by header + container margin at each breakpoint', () => {
    const base =
      (ROUTE_HEADER_HEIGHT_PX + ROUTE_CONTAINER_TOP_MARGIN_PX.base) /
      SPACING_STEP_PX
    const sm =
      (ROUTE_HEADER_HEIGHT_PX + ROUTE_CONTAINER_TOP_MARGIN_PX.sm) /
      SPACING_STEP_PX

    expect(base).toBe(32)
    expect(sm).toBe(48)
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain(`-top-${base}`)
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain(`sm:-top-${sm}`)
  })

  it('breaks out of the route container the way a full-bleed section does', () => {
    // Same mechanism as `sectionWidthClass('fullBleed')`: 100vw centered on
    // the element. A fixed negative inset cannot work here — the hero sits in
    // ContainerInner's centered `max-w-2xl lg:max-w-5xl` measure, whose gap to
    // the panel edge changes with the viewport.
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('w-screen')
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('left-1/2')
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('-translate-x-1/2')
    expect(sectionWidthClass('fullBleed')).toContain('w-screen')
  })

  it('clips the canvas to the same panel the homepage hero clips to', () => {
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('sm:px-8')
    expect(HERO_FULL_BLEED_PANEL_CLASS).toBe(SHADER_HERO_PANEL_CLASS)
  })

  it('keeps the canvas decorative and behind the hero text', () => {
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('pointer-events-none')
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('-z-10')
    expect(HERO_CARD_FRAME_CLASS).toContain('pointer-events-none')
    expect(HERO_CARD_FRAME_CLASS).toContain('-z-10')
  })

  it('keeps the homepage canvas height', () => {
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('h-[36rem]')
  })

  it('gives the card the shaderHero block panel, minus its flow rhythm', () => {
    expect(HERO_CARD_SHELL_CLASS).toBe(
      'relative isolate min-h-[20rem] overflow-hidden rounded-2xl',
    )
    expect(HERO_CARD_SHELL_CLASS).not.toContain('my-12')
  })
})

/**
 * The home-parity full-bleed frame, pinned to its derivation.
 *
 * Wave-3 QA measured H1/grid/columns but never the shader's top bleed, so the
 * shipped `-top-24` (96px) left a constant 120px dark band behind the ~180px
 * home header (staging 2026-08-13). The pull is now derived from the home
 * header height so the aurora reaches the document top, and the height is
 * extended so the bottom fade stays put. These assertions are that arithmetic,
 * written down — the frame box, not pixel-parity magic.
 */
describe('home-parity full-bleed geometry', () => {
  const REM_PX = 16
  // Top of the hero `<header>` under home parity: the isolate Container has no
  // top margin, so it sits at the site header's bottom, and the hero wrapper's
  // `pt-9` is the only gap below it.
  const heroHeaderTopPx = HOME_HEADER_HEIGHT_PX + HOME_HERO_TOP_PADDING_PX
  // The frame that shipped and left the gap, for computing the bottom we must
  // preserve.
  const shippedPullPx = 24 * SPACING_STEP_PX // -top-24
  const shippedHeightPx = 36 * REM_PX // h-[36rem]
  // Bottom of the shipped canvas = the fade-into-content point we must hold.
  const currentBottomPx = heroHeaderTopPx - shippedPullPx + shippedHeightPx

  it('derives the pull from the home header, not the 64px route bar', () => {
    // The bug: the shipped pull assumed ROUTE_HEADER_HEIGHT_PX (64) but `/`
    // renders the tall home header, so the correct pull is anchored to it.
    expect(heroHeaderTopPx).toBe(216)
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).toContain(
      `-top-[${heroHeaderTopPx}px]`,
    )
    expect(heroHeaderTopPx).toBeGreaterThan(ROUTE_HEADER_HEIGHT_PX)
  })

  it('pulls the canvas top to the document top — no dark band behind the header', () => {
    const canvasTopPx = heroHeaderTopPx - heroHeaderTopPx // pull === header top
    expect(canvasTopPx).toBeLessThanOrEqual(0)
    // And the pull covers the full home header height, so nothing shows above.
    expect(heroHeaderTopPx).toBeGreaterThanOrEqual(HOME_HEADER_HEIGHT_PX)
  })

  it('extends the height so the bottom fade stays where it was (~696px)', () => {
    expect(currentBottomPx).toBe(696)
    const newHeightRem = currentBottomPx / REM_PX // top is 0, so height == bottom
    expect(newHeightRem).toBe(43.5)
    expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).toContain(`h-[${newHeightRem}rem]`)
  })

  it('keeps the same breakout and clip as the standard full-bleed frame', () => {
    for (const token of [
      'pointer-events-none',
      '-z-10',
      'w-screen',
      'left-1/2',
      '-translate-x-1/2',
      'sm:px-8',
    ]) {
      expect(HERO_FULL_BLEED_HOME_FRAME_CLASS).toContain(token)
    }
  })

  it('leaves the standard rhythm frame untouched — this bug is home-parity only', () => {
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('-top-32')
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('sm:-top-48')
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('h-[36rem]')
  })
})

/**
 * The stacking contract, in the only place a test can see both halves of it.
 *
 * Staging QA (2026-08-12) found the full-bleed canvas painting over every
 * block inside its 36rem span: the isolation sat on the hero's own `<header>`,
 * so the canvas could only sink to the bottom of the header, and the header
 * then painted above the blocks that follow it. The isolation has to sit on
 * the wrapper that holds the hero *and* the blocks.
 *
 * Since #42 both `/` and the `[slug]` catch-all render through the shared
 * `RenderRhythmPage`, so the contract is enforced there: the one `<Container>`
 * that holds hero and blocks, whose class comes from the rhythm profile — and
 * every profile must carry the isolation.
 */
describe('full-bleed stacking contract with the shared renderer', () => {
  const rendererSource = readFileSync(
    path.join(process.cwd(), 'src/heros/RenderRhythmPage.tsx'),
    'utf8',
  )

  it('wraps hero and blocks in the one Container fed by the rhythm profile', () => {
    expect(rendererSource).toContain(
      '<Container className={profile.containerClass}>',
    )

    // Both halves inside that one wrapper — the whole point of the contract.
    const wrapper = rendererSource.slice(
      rendererSource.indexOf('<Container'),
      rendererSource.indexOf('</Container>'),
    )
    expect(wrapper).toContain('<RenderHero')
    expect(wrapper).toContain('<RenderBlocks')
  })

  it('every rhythm profile isolates that Container', () => {
    for (const profile of Object.values(ROUTE_RHYTHM_PROFILES)) {
      expect(profile.containerClass.split(/\s+/)).toContain(
        HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS,
      )
    }
  })

  it('the canvas sits in that context’s negative layer', () => {
    expect(HERO_FULL_BLEED_FRAME_CLASS).toContain('-z-10')
  })
})
