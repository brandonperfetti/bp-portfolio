/**
 * UI Initiative Spring Slider
 *
 * Fancy "spring" transition effect between slides
 *
 * https://uiinitiative.com
 *
 * Copyright 2026 UI Initiative
 *
 * Released under the UI Initiative Regular License
 *
 * ---------------------------------------------------------------------------
 * Port note (bp-portfolio, #64): a faithful TypeScript port of the Pro
 * `demo-vite/spring-slider.js` wrapper Brandon supplied under his UI Initiative
 * Regular License — NOT a re-implementation. Unlike the Expo (#62) and
 * Carousel-3D (#63) adoptions, Spring is NOT a self-contained custom Swiper
 * effect module: the Pro source builds a Swiper with the NATIVE `EffectCreative`
 * (`effect: 'creative'` + a ±100% `creativeEffect` translate, `speed: 720`,
 * `followFinger: false`) and layers a `progress` handler that staggers each
 * slide's `transitionDelay` by direction × index-distance × `speed / 16`, over a
 * `cubic-bezier(0.76, 0.09, 0.215, 1)` slide timing-function (`effectSpring.css`).
 * That cascade of trailing delays over the creative translate is the springy
 * trail.
 *
 * This factory ports exactly that behaviour into the five event callbacks the
 * client leaf wires onto `<Swiper>` (`onProgress` / `onTouchStart` /
 * `onTouchEnd` / `onTransitionEnd` / `onResize`). The delay maths, the
 * `previousProgress` direction tracking, the `isTouched` drag guard, the
 * `animating` rAF deferral, and the `resetDelay` on transition-end / resize /
 * touch-start are byte-for-byte the source. Deliberate, documented deviations
 * for the React + Swiper-14 CMS context:
 *   1. The Pro source instantiates Swiper itself and registers `EffectCreative`
 *      + the `creativeEffect` config inside `createSpringSlider`; here the leaf
 *      owns the `<Swiper>` (module registration, the `creativeEffect` prop, and
 *      `speed`/`followFinger`) and this factory only supplies the stagger event
 *      handlers — so the CMS `effect: 'spring'` → Swiper `effect: 'creative'`
 *      indirection lives in the leaf, not here.
 *   2. Closure state (`previousProgress`, `isTouched`) is held per factory
 *      instance rather than on `window`, so a page may hold several independent
 *      Spring carousels; the source's `window.swiper` global is dropped.
 *   3. TypeScript types over the plain-JS original (a minimal structural
 *      {@link SpringStaggerSwiper} the installed Swiper 14.1.0 instance satisfies).
 * Verified against the installed Swiper 14.1.0: `EffectCreative` is exported from
 * `swiper/modules` and `swiper/css/effect-creative` resolves — no new dependency
 * (core Swiper). The effect only reads stable Swiper internals: `progress`,
 * `animating`, `slides`, `visibleSlidesIndexes`, and `params.speed`.
 */

/**
 * The minimal Swiper surface the Spring stagger reads. The live Swiper 14.1.0
 * instance satisfies it structurally, so the leaf can pass its `SwiperClass`
 * straight to these callbacks; keeping the type narrow is also what makes the
 * delay maths unit-testable against a plain mock, no Swiper mount required.
 */
export interface SpringStaggerSwiper {
  /** Overall track progress in `[0, 1]` — its direction of change drives the stagger. */
  progress: number
  /** Whether a slide transition is in flight (defer the delay a frame if so). */
  animating: boolean
  /** The slide elements the stagger writes `transitionDelay` onto. */
  slides: HTMLElement[]
  /** Indexes of the currently visible slides (needs `watchSlidesProgress`, which Creative sets). */
  visibleSlidesIndexes: number[]
  /** Resolved Swiper params — the stagger reads `speed` to size each delay step. */
  params: { speed?: number }
}

/** The five Swiper event callbacks the client leaf wires to run the Spring stagger. */
export interface SpringStaggerCallbacks {
  /** Swiper `progress` → stagger each slide's `transitionDelay` (the spring trail). */
  onProgress: (swiper: SpringStaggerSwiper) => void
  /** Swiper `touchStart` → guard the stagger off while dragging + reset delays. */
  onTouchStart: (swiper: SpringStaggerSwiper) => void
  /** Swiper `touchEnd` → release the drag guard. */
  onTouchEnd: (swiper: SpringStaggerSwiper) => void
  /** Swiper `transitionEnd` → clear the trailing delays. */
  onTransitionEnd: (swiper: SpringStaggerSwiper) => void
  /** Swiper `resize` → clear the trailing delays. */
  onResize: (swiper: SpringStaggerSwiper) => void
}

/** The step (ms) each visible-index distance adds to a slide's delay, from the Pro `speed / 16`. */
const SPRING_DELAY_DIVISOR = 16

/** Zero every slide's `transitionDelay` — the source's `resetDelay`. */
function resetDelay(swiper: SpringStaggerSwiper): void {
  swiper.slides.forEach((slideEl) => {
    slideEl.style.transitionDelay = '0ms'
  })
}

/**
 * Build the Spring stagger callbacks — one independent, stateful instance per
 * carousel. The returned handlers reproduce the Pro `spring-slider.js` cascade:
 * on each `progress` tick, slides in the direction of travel get a
 * `transitionDelay` that grows with their distance from the leading visible
 * slide (so they spring in on a trail), guarded off while the reader is dragging
 * and reset whenever a transition ends or the track resizes.
 *
 * @returns The `{ onProgress, onTouchStart, onTouchEnd, onTransitionEnd, onResize }`
 * callbacks to hand the `<Swiper>` leaf, sharing closure state.
 */
export function createSpringStagger(): SpringStaggerCallbacks {
  let previousProgress = 0
  let isTouched = false

  const onProgress = (swiper: SpringStaggerSwiper): void => {
    // Skip the stagger while the reader is dragging (the source's guard).
    if (isTouched) return
    const visibleIndexes = swiper.visibleSlidesIndexes
    // Creative populates `visibleSlidesIndexes` via `watchSlidesProgress`; bail
    // on the earliest init ticks before it is filled so the maths stays sound.
    if (!visibleIndexes || visibleIndexes.length === 0) return

    const direction = swiper.progress > previousProgress ? 'next' : 'prev'
    previousProgress = swiper.progress
    const delay = (swiper.params.speed ?? 0) / SPRING_DELAY_DIVISOR
    const firstIndex = visibleIndexes[0]
    const lastIndex = visibleIndexes[visibleIndexes.length - 1]

    const setDelay = (slideEl: HTMLElement, slideIndex: number): void => {
      if (direction === 'next' && slideIndex >= firstIndex) {
        slideEl.style.transitionDelay = `${(slideIndex - firstIndex + 1) * delay}ms`
      } else if (direction === 'prev' && slideIndex <= lastIndex + 1) {
        slideEl.style.transitionDelay = `${(lastIndex - slideIndex + 1) * delay}ms`
      } else {
        slideEl.style.transitionDelay = `${0}ms`
      }
    }

    swiper.slides.forEach((slideEl, slideIndex) => {
      // Mid-transition, zero the delay for this frame and set the real one next
      // frame — the source's `animating` deferral, so a delay never lands late.
      if (swiper.animating) {
        slideEl.style.transitionDelay = '0ms'
        requestAnimationFrame(() => {
          setDelay(slideEl, slideIndex)
        })
      } else {
        setDelay(slideEl, slideIndex)
      }
    })
  }

  return {
    onProgress,
    onTouchStart(swiper) {
      // The source both flags the drag (`isTouched = true`, in the `touchStart`
      // handler) and resets delays (the `'transitionEnd resize touchStart'`
      // listener) on touch-start; React folds both into this one callback.
      isTouched = true
      resetDelay(swiper)
    },
    onTouchEnd() {
      isTouched = false
    },
    onTransitionEnd(swiper) {
      resetDelay(swiper)
    },
    onResize(swiper) {
      resetDelay(swiper)
    },
  }
}
