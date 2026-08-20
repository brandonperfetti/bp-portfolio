// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SECTION_WIDTH_CLASSES } from '@/blocks/Container/section'
import {
  CAROUSEL_FULL_BLEED_CLASS,
  carouselFullBleedClass,
} from '@/blocks/Carousel/fullBleed'

/**
 * Guards the Carousel full-bleed breakout (#68.2): off → empty string (renders
 * inside its wrapper), on → the one canonical breakout idiom rather than a
 * second hand copy. A horizontal Expo uses this to reach the screen edges.
 */
describe('carouselFullBleedClass', () => {
  it('returns the breakout classes only when on', () => {
    expect(carouselFullBleedClass(true)).toBe(CAROUSEL_FULL_BLEED_CLASS)
    expect(carouselFullBleedClass(false)).toBe('')
    expect(carouselFullBleedClass(null)).toBe('')
    expect(carouselFullBleedClass(undefined)).toBe('')
  })

  it('reuses the container section full-bleed idiom rather than a new one', () => {
    // One breakout pattern across the codebase — if `Container/section.ts`
    // changes how full bleed escapes its wrapper, this fails loudly instead of
    // leaving the carousel on a stale copy.
    expect(CAROUSEL_FULL_BLEED_CLASS).toBe(SECTION_WIDTH_CLASSES.fullBleed)
    expect(CAROUSEL_FULL_BLEED_CLASS).toBe(
      'relative left-1/2 w-screen -translate-x-1/2',
    )
  })
})
