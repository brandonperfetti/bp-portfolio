// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  CAROUSEL_DESKTOP_BREAKPOINT_PX,
  DEFAULT_AUTOPLAY_INTERVAL_MS,
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
})
