/**
 * UI Initiative Carousel Slider
 *
 * Infinite 3D carousel slider
 *
 * https://uiinitiative.com
 *
 * Copyright 2024 UI Initiative
 *
 * Released under the UI Initiative Regular License
 *
 * September 12, 2024
 *
 * ---------------------------------------------------------------------------
 * Port note (bp-portfolio, #63): a faithful TypeScript port of the Pro
 * `dist/effect-carousel.esm.js` module Brandon supplied under his UI Initiative
 * Regular License — NOT a re-implementation. The per-slide transform maths
 * (`progress` → translateX + scale + zIndex + opacity), the animate-opacity
 * fade (the `swiper-carousel-animate-opacity` wrapper), the `beforeInit`
 * overwrite params, and the `progress`/`setTransition`/`resize` event wiring
 * are byte-for-byte the source.
 * Three deliberate, documented deviations:
 *   1. TypeScript types over the plain-JS original (numeric `style` writes are
 *      `String()`-wrapped; the custom `carousel3dEffect` param is cast).
 *   2. The effect string guard is `'carousel3d'`, not the Pro `'carousel'` —
 *      Brandon's chosen enum value avoids colliding with Swiper's built-in
 *      effects and the `carousel` block name. `effect: 'carousel3d'` is what the
 *      leaf passes `<Swiper>`; no Swiper native effect module is registered.
 *   3. The container-modifier class and the params key follow that rename
 *      (`swiper-carousel3d`, `carousel3dEffect`) so the whole effect lives in
 *      one namespace; `effectCarousel3D.css` targets `.swiper-carousel3d`.
 * Verified against the installed Swiper 14.1.0 (self-contained — the module uses
 * only stable Swiper internals: `classNames`, `containerModifierClass`,
 * `originalParams`, `slides[].progress`, `rtlTranslate`, and the event hooks;
 * no `swiper/effect-utils` import, unlike Expo).
 */

import type { SwiperModule } from 'swiper/types'

import {
  CAROUSEL3D_EFFECT_DEFAULTS,
  type Carousel3DEffectParams,
} from '@/blocks/Carousel/options'

/** A Swiper slide element carries the per-slide `progress` the effect reads. */
type Carousel3DSlide = HTMLElement & { progress: number }

/**
 * The Carousel-3D custom Swiper effect (infinite 3D carousel). A faithful port
 * of the Pro module — see the file header. Drives each slide's transform
 * (translateX / scale / zIndex / opacity) and fades the animate-opacity wrapper
 * children from each `slide.progress`.
 */
const EffectCarousel3D: SwiperModule = ({ swiper, on, extendParams }) => {
  extendParams({
    carousel3dEffect: { ...CAROUSEL3D_EFFECT_DEFAULTS },
  })

  const getParams = (): Carousel3DEffectParams =>
    (swiper.params as { carousel3dEffect: Carousel3DEffectParams })
      .carousel3dEffect

  on('beforeInit', () => {
    if (swiper.params.effect !== 'carousel3d') return
    swiper.classNames.push(`${swiper.params.containerModifierClass}carousel3d`)
    const overwriteParams = {
      watchSlidesProgress: true,
      centeredSlides: true,
    }
    Object.assign(swiper.params, overwriteParams)
    Object.assign(
      (swiper as typeof swiper & { originalParams: Record<string, unknown> })
        .originalParams,
      overwriteParams,
    )
  })

  on('progress', () => {
    if (swiper.params.effect !== 'carousel3d') return
    const { scaleStep, opacityStep } = getParams()
    const sideSlides = Math.max(Math.min(getParams().sideSlides, 3), 1)
    const modifyMultiplier = ({ 1: 2, 2: 1, 3: 0.2 } as Record<number, number>)[
      sideSlides
    ]
    const translateModifier = (
      { 1: 50, 2: 50, 3: 67 } as Record<number, number>
    )[sideSlides]

    const zIndexMax = swiper.slides.length

    for (let i = 0; i < swiper.slides.length; i += 1) {
      const slideEl = swiper.slides[i] as Carousel3DSlide
      const slideProgress = (swiper.slides[i] as Carousel3DSlide).progress
      const absProgress = Math.abs(slideProgress)
      let modify = 1

      if (absProgress > 1) {
        modify = (absProgress - 1) * 0.3 * modifyMultiplier + 1
      }
      const opacityEls = slideEl.querySelectorAll<HTMLElement>(
        '.swiper-carousel-animate-opacity',
      )
      const translate = `${
        slideProgress *
        modify *
        translateModifier *
        (swiper.rtlTranslate ? -1 : 1)
      }%`

      const scale = 1 - absProgress * scaleStep
      const zIndex = zIndexMax - Math.abs(Math.round(slideProgress))
      slideEl.style.transform = `translateX(${translate}) scale(${scale})`
      slideEl.style.zIndex = String(zIndex)
      if (absProgress > sideSlides + 1) {
        slideEl.style.opacity = '0'
      } else {
        slideEl.style.opacity = '1'
      }

      opacityEls.forEach((opacityEl) => {
        opacityEl.style.opacity = String(1 - absProgress * opacityStep)
      })
    }
  })

  on('resize', () => {
    if (
      swiper.virtual &&
      swiper.params.virtual &&
      swiper.params.virtual.enabled
    ) {
      requestAnimationFrame(() => {
        if (swiper.destroyed) return
        swiper.updateSlides()
        swiper.updateProgress()
      })
    }
  })

  on('setTransition', (_s, duration: number) => {
    if (swiper.params.effect !== 'carousel3d') return
    for (let i = 0; i < swiper.slides.length; i += 1) {
      const slideEl = swiper.slides[i]
      const opacityEls = slideEl.querySelectorAll<HTMLElement>(
        '.swiper-carousel-animate-opacity',
      )
      slideEl.style.transitionDuration = `${duration}ms`
      opacityEls.forEach((opacityEl) => {
        opacityEl.style.transitionDuration = `${duration}ms`
      })
    }
  })
}

export default EffectCarousel3D
