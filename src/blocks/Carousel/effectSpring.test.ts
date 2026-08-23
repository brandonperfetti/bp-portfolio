// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSpringStagger,
  type SpringStaggerSwiper,
} from '@/blocks/Carousel/effectSpring'

/**
 * A plain slide stand-in carrying only the `style.transitionDelay` the stagger
 * writes — enough to prove the delay maths without a real DOM or a Swiper mount.
 */
function makeSlides(count: number): HTMLElement[] {
  return Array.from(
    { length: count },
    () => ({ style: { transitionDelay: '' } }) as unknown as HTMLElement,
  )
}

/** Read back the `transitionDelay` each slide element carries, in order. */
function delays(slides: HTMLElement[]): string[] {
  return slides.map((s) => s.style.transitionDelay)
}

/** A minimal Swiper stand-in the stagger reads (speed 720 → a 45ms delay step). */
function makeSwiper(
  overrides: Partial<SpringStaggerSwiper> & { slideCount?: number } = {},
): SpringStaggerSwiper {
  const { slideCount = 6, ...rest } = overrides
  return {
    progress: 0,
    animating: false,
    slides: makeSlides(slideCount),
    visibleSlidesIndexes: [2, 3],
    params: { speed: 720 },
    ...rest,
  }
}

/**
 * The ported UI-Initiative Spring stagger (#64): the per-slide `transitionDelay`
 * cascade that, over the native Creative translate, makes the cards spring in on
 * a trail. Tested as a pure factory so the delay maths, the direction tracking,
 * the drag guard, and the resets are proven without ever mounting Swiper.
 */
describe('createSpringStagger', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('staggers forward: visible + trailing slides grow by speed/16, earlier slides zero', () => {
    const spring = createSpringStagger()
    const swiper = makeSwiper({ progress: 0.5 }) // 0.5 > 0 → direction 'next'

    spring.onProgress(swiper)

    // firstIndex = 2, step = 720/16 = 45ms. Indexes < 2 fall to the else (0ms);
    // indexes ≥ 2 get (index - first + 1) * 45.
    expect(delays(swiper.slides)).toEqual([
      '0ms', // 0 (< firstIndex)
      '0ms', // 1 (< firstIndex)
      '45ms', // 2 → (2-2+1)*45
      '90ms', // 3 → (3-2+1)*45
      '135ms', // 4 → (4-2+1)*45
      '180ms', // 5 → (5-2+1)*45
    ])
  })

  it('staggers backward: slides up to lastIndex+1 grow, later slides zero', () => {
    const spring = createSpringStagger()
    const swiper = makeSwiper()

    // First tick moves previousProgress up so the next can be a decrease.
    swiper.progress = 0.5
    spring.onProgress(swiper)
    // Second tick decreases → direction 'prev'. lastIndex = 3, step 45ms.
    swiper.progress = 0.2
    spring.onProgress(swiper)

    expect(delays(swiper.slides)).toEqual([
      '180ms', // 0 → (3-0+1)*45
      '135ms', // 1 → (3-1+1)*45
      '90ms', // 2 → (3-2+1)*45
      '45ms', // 3 → (3-3+1)*45
      '0ms', // 4 → (3-4+1)*45 = 0
      '0ms', // 5 (> lastIndex+1) → else
    ])
  })

  it('skips the stagger entirely while the reader is dragging (isTouched)', () => {
    const spring = createSpringStagger()
    const swiper = makeSwiper({ progress: 0.5 })

    // touchStart flags the drag AND resets delays to 0ms…
    spring.onTouchStart(swiper)
    expect(delays(swiper.slides)).toEqual(Array(6).fill('0ms'))

    // …so a progress tick during the drag writes nothing.
    swiper.progress = 0.8
    spring.onProgress(swiper)
    expect(delays(swiper.slides)).toEqual(Array(6).fill('0ms'))

    // touchEnd releases the guard; the stagger runs again.
    spring.onTouchEnd(swiper)
    swiper.progress = 0.9
    spring.onProgress(swiper)
    expect(delays(swiper.slides).some((d) => d !== '0ms')).toBe(true)
  })

  it('resets every slide delay on transitionEnd and on resize', () => {
    const spring = createSpringStagger()
    const swiper = makeSwiper({ progress: 0.5 })

    spring.onProgress(swiper)
    expect(delays(swiper.slides).some((d) => d !== '0ms')).toBe(true)

    spring.onTransitionEnd(swiper)
    expect(delays(swiper.slides)).toEqual(Array(6).fill('0ms'))

    // And again for resize, after re-staggering.
    swiper.progress = 0.8
    spring.onProgress(swiper)
    expect(delays(swiper.slides).some((d) => d !== '0ms')).toBe(true)
    spring.onResize(swiper)
    expect(delays(swiper.slides)).toEqual(Array(6).fill('0ms'))
  })

  it('defers the delay a frame while a transition is animating', () => {
    const rafCbs: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCbs.push(cb)
      return rafCbs.length
    })

    const spring = createSpringStagger()
    const swiper = makeSwiper({ progress: 0.5, animating: true })

    spring.onProgress(swiper)
    // Mid-transition the delay is zeroed this frame…
    expect(delays(swiper.slides)).toEqual(Array(6).fill('0ms'))
    expect(rafCbs).toHaveLength(6)

    // …and the real staggered delay lands next frame.
    rafCbs.forEach((cb) => cb(0))
    expect(delays(swiper.slides)).toEqual([
      '0ms',
      '0ms',
      '45ms',
      '90ms',
      '135ms',
      '180ms',
    ])
  })

  it('no-ops on the earliest ticks before visibleSlidesIndexes is populated', () => {
    const spring = createSpringStagger()
    const swiper = makeSwiper({ progress: 0.5, visibleSlidesIndexes: [] })

    expect(() => spring.onProgress(swiper)).not.toThrow()
    expect(delays(swiper.slides)).toEqual(Array(6).fill(''))
  })
})
