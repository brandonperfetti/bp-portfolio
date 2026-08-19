// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  CAROUSEL_DESKTOP_BREAKPOINT_PX,
  DEFAULT_AUTOPLAY_INTERVAL_MS,
  EXPO_EFFECT_DEFAULTS,
  EXPO_MAX_ROTATE,
  EXPO_SLIDES_PER_VIEW,
  EXPO_SLIDES_PER_VIEW_MOBILE,
  MAX_SLIDES_PER_VIEW,
  MIN_AUTOPLAY_INTERVAL_MS,
  resolveCarouselBehavior,
} from '@/blocks/Carousel/options'

const motion = { reducedMotion: false }
const reduced = { reducedMotion: true }

/**
 * The mapping layer #41 exists to build: CMS knobs → a plain Swiper behaviour
 * descriptor. Tested as a pure function so the two behaviour contracts
 * (autoplay default-off + reduced-motion suppression, and fade neutralized
 * under reduced motion) are proven without ever mounting Swiper.
 */
describe('resolveCarouselBehavior', () => {
  it('defaults autoplay OFF when the editor did not enable it', () => {
    expect(resolveCarouselBehavior({}, motion).autoplay).toBe(false)
    expect(resolveCarouselBehavior({ autoplay: false }, motion).autoplay).toBe(
      false,
    )
    expect(resolveCarouselBehavior({ autoplay: null }, motion).autoplay).toBe(
      false,
    )
  })

  it('turns autoplay on only when enabled AND motion is allowed', () => {
    const on = resolveCarouselBehavior(
      { autoplay: true, interval: 4000 },
      motion,
    )
    expect(on.autoplay).toEqual({
      delay: 4000,
      disableOnInteraction: true,
      pauseOnMouseEnter: true,
    })
  })

  it('disables autoplay entirely under reduced motion, even when enabled', () => {
    expect(
      resolveCarouselBehavior({ autoplay: true, interval: 4000 }, reduced)
        .autoplay,
    ).toBe(false)
  })

  it('falls back to the default interval and floors a too-small one', () => {
    expect(
      (
        resolveCarouselBehavior({ autoplay: true }, motion).autoplay as {
          delay: number
        }
      ).delay,
    ).toBe(DEFAULT_AUTOPLAY_INTERVAL_MS)
    expect(
      (
        resolveCarouselBehavior({ autoplay: true, interval: 10 }, motion)
          .autoplay as { delay: number }
      ).delay,
    ).toBe(MIN_AUTOPLAY_INTERVAL_MS)
  })

  it('collapses the fade flourish to a plain slide under reduced motion', () => {
    expect(resolveCarouselBehavior({ effect: 'fade' }, motion).effect).toBe(
      'fade',
    )
    expect(resolveCarouselBehavior({ effect: 'fade' }, reduced).effect).toBe(
      'slide',
    )
  })

  it('normalizes an unknown effect to slide', () => {
    expect(
      resolveCarouselBehavior({ effect: 'coverflow' }, motion).effect,
    ).toBe('slide')
    expect(resolveCarouselBehavior({ effect: null }, motion).effect).toBe(
      'slide',
    )
  })

  it('forces a single slide per view when the effect is fade', () => {
    const b = resolveCarouselBehavior(
      { effect: 'fade', slidesPerView: 3, slidesPerViewMobile: 2 },
      motion,
    )
    expect(b.slidesPerView).toBe(1)
    expect(b.slidesPerViewMobile).toBe(1)
  })

  it('clamps slides-per-view into [1, MAX] and floors fractional values', () => {
    expect(
      resolveCarouselBehavior({ slidesPerView: 0 }, motion).slidesPerView,
    ).toBe(1)
    expect(
      resolveCarouselBehavior({ slidesPerView: 99 }, motion).slidesPerView,
    ).toBe(MAX_SLIDES_PER_VIEW)
    expect(
      resolveCarouselBehavior({ slidesPerView: 2.9 }, motion).slidesPerView,
    ).toBe(2)
    expect(resolveCarouselBehavior({}, motion).slidesPerView).toBe(1)
  })

  it('exposes the mobile → desktop breakpoint the leaf keys its override on', () => {
    expect(resolveCarouselBehavior({}, motion).desktopBreakpoint).toBe(
      CAROUSEL_DESKTOP_BREAKPOINT_PX,
    )
  })

  it('passes loop through and defaults navigation/pagination on', () => {
    expect(resolveCarouselBehavior({ loop: true }, motion).loop).toBe(true)
    expect(resolveCarouselBehavior({}, motion).loop).toBe(false)

    const defaults = resolveCarouselBehavior({}, motion)
    expect(defaults.navigation).toBe(true)
    expect(defaults.pagination).toBe(true)

    const off = resolveCarouselBehavior(
      { navigation: false, pagination: false },
      motion,
    )
    expect(off.navigation).toBe(false)
    expect(off.pagination).toBe(false)
  })

  it('always keeps keyboard navigation on', () => {
    expect(resolveCarouselBehavior({}, motion).keyboard).toBe(true)
    expect(resolveCarouselBehavior({}, reduced).keyboard).toBe(true)
  })

  // ── expo (#62): the ported UI-Initiative parallax + scale showcase ─────────

  it('recognizes the expo effect and does not normalize it away', () => {
    expect(resolveCarouselBehavior({ effect: 'expo' }, motion).effect).toBe(
      'expo',
    )
  })

  it('forces a fractional slides-per-view for expo, exempt from the whole-number clamp', () => {
    const b = resolveCarouselBehavior({ effect: 'expo' }, motion)
    // The default `1` would hide the neighbours, so expo falls back to its
    // fractional default rather than the clamped `1` a plain track would use.
    expect(b.slidesPerView).toBe(EXPO_SLIDES_PER_VIEW)
    expect(b.slidesPerViewMobile).toBe(EXPO_SLIDES_PER_VIEW_MOBILE)
    expect(b.slidesPerView).not.toBe(1)
  })

  it('lets an editor override the expo count with a fractional value, capped at MAX', () => {
    const b = resolveCarouselBehavior(
      { effect: 'expo', slidesPerView: 2.5, slidesPerViewMobile: 1.3 },
      motion,
    )
    expect(b.slidesPerView).toBe(2.5)
    expect(b.slidesPerViewMobile).toBe(1.3)
    expect(
      resolveCarouselBehavior({ effect: 'expo', slidesPerView: 99 }, motion)
        .slidesPerView,
    ).toBe(MAX_SLIDES_PER_VIEW)
  })

  it('forces centeredSlides and passes the expoEffect params only for expo', () => {
    const expo = resolveCarouselBehavior({ effect: 'expo' }, motion)
    expect(expo.centeredSlides).toBe(true)
    expect(expo.expoEffect).toEqual(EXPO_EFFECT_DEFAULTS)

    const slide = resolveCarouselBehavior({ effect: 'slide' }, motion)
    expect(slide.centeredSlides).toBe(false)
    expect(slide.expoEffect).toBeUndefined()
  })

  it('collapses expo to a plain slide under reduced motion, dropping the effect params', () => {
    const b = resolveCarouselBehavior({ effect: 'expo' }, reduced)
    expect(b.effect).toBe('slide')
    expect(b.centeredSlides).toBe(false)
    expect(b.expoEffect).toBeUndefined()
    // And it is no longer forced fractional — it maps like any plain track.
    expect(b.slidesPerView).toBe(1)
  })

  // ── expo editor controls (#62 addendum): direction / rotate / grayscale ────

  it('resolves the expo direction, defaulting horizontal, and never vertical off expo', () => {
    expect(resolveCarouselBehavior({ effect: 'expo' }, motion).direction).toBe(
      'horizontal',
    )
    expect(
      resolveCarouselBehavior({ effect: 'expo', direction: 'vertical' }, motion)
        .direction,
    ).toBe('vertical')
    // Direction is expo-only: a vertical value on a plain track is ignored.
    expect(
      resolveCarouselBehavior(
        { effect: 'slide', direction: 'vertical' },
        motion,
      ).direction,
    ).toBe('horizontal')
  })

  it('carries rotate and grayscale into the resolved expoEffect, merged over the Pro defaults', () => {
    const b = resolveCarouselBehavior(
      { effect: 'expo', rotate: 20, grayscale: false },
      motion,
    )
    expect(b.expoEffect).toEqual({
      ...EXPO_EFFECT_DEFAULTS,
      rotate: 20,
      grayscale: false,
    })
  })

  it('defaults rotate to 0 and grayscale to true when the editor sets neither', () => {
    const b = resolveCarouselBehavior({ effect: 'expo' }, motion)
    expect(b.expoEffect?.rotate).toBe(0)
    expect(b.expoEffect?.grayscale).toBe(true)
  })

  it('clamps the expo rotate angle into [0, EXPO_MAX_ROTATE]', () => {
    expect(
      resolveCarouselBehavior({ effect: 'expo', rotate: -10 }, motion)
        .expoEffect?.rotate,
    ).toBe(0)
    expect(
      resolveCarouselBehavior({ effect: 'expo', rotate: 999 }, motion)
        .expoEffect?.rotate,
    ).toBe(EXPO_MAX_ROTATE)
  })

  it('resets direction to horizontal (and drops rotate/grayscale) under reduced motion', () => {
    const b = resolveCarouselBehavior(
      { effect: 'expo', direction: 'vertical', rotate: 30, grayscale: false },
      reduced,
    )
    expect(b.effect).toBe('slide')
    expect(b.direction).toBe('horizontal')
    expect(b.expoEffect).toBeUndefined()
  })

  // ── full bleed (#68.2): horizontal-Expo-only breakout, default on ──────────

  it('defaults fullBleed ON for a horizontal expo', () => {
    expect(resolveCarouselBehavior({ effect: 'expo' }, motion).fullBleed).toBe(
      true,
    )
    expect(
      resolveCarouselBehavior(
        { effect: 'expo', direction: 'horizontal', fullBleed: true },
        motion,
      ).fullBleed,
    ).toBe(true)
  })

  it('lets an editor turn fullBleed off on a horizontal expo', () => {
    expect(
      resolveCarouselBehavior({ effect: 'expo', fullBleed: false }, motion)
        .fullBleed,
    ).toBe(false)
  })

  it('never breaks out a vertical expo, another effect, or a reduced-motion collapse', () => {
    // Vertical expo: the breakout is horizontal-only.
    expect(
      resolveCarouselBehavior(
        { effect: 'expo', direction: 'vertical', fullBleed: true },
        motion,
      ).fullBleed,
    ).toBe(false)
    // Other effects never full-bleed, even if the stored flag says true.
    expect(
      resolveCarouselBehavior({ effect: 'slide', fullBleed: true }, motion)
        .fullBleed,
    ).toBe(false)
    expect(
      resolveCarouselBehavior({ effect: 'fade', fullBleed: true }, motion)
        .fullBleed,
    ).toBe(false)
    // Reduced motion collapses expo → slide, so the degraded plain slide stays
    // inside its column.
    expect(
      resolveCarouselBehavior({ effect: 'expo', fullBleed: true }, reduced)
        .fullBleed,
    ).toBe(false)
  })
})
