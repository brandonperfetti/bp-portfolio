/**
 * UI Initiative Expo Slider
 *
 * Parallax & scale effects slider
 *
 * https://uiinitiative.com
 *
 * Copyright 2025 UI Initiative
 *
 * Released under the UI Initiative Regular License
 *
 * June 27, 2025
 *
 * ---------------------------------------------------------------------------
 * Port note (bp-portfolio, #62): this is a faithful TypeScript port of the Pro
 * `dist/effect-expo.esm.js` module Brandon supplied under his UI Initiative
 * Regular License — NOT a re-implementation. The transform maths, the
 * `effectInit` wiring, and the `overwriteParams` are byte-for-byte the source;
 * the only changes are (1) TypeScript types over the plain-JS original and
 * (2) the custom-element global guard is typed rather than duck-checked. The
 * required per-slide DOM (`.expo-container` containing `.expo-image` +
 * `.expo-content`)
 * and the accompanying `effectExpo.css` are unchanged in contract. Registered
 * like any Swiper module (`modules={[…, EffectExpo]}`) and activated with
 * `effect: 'expo'` + an `expoEffect` params object. Verified against the
 * installed Swiper 14.1.0 `swiper/effect-utils` `effectInit` signature.
 */

import { effectInit } from 'swiper/effect-utils'
import type { SwiperModule } from 'swiper/types'

import {
  EXPO_EFFECT_DEFAULTS,
  type ExpoEffectParams,
} from '@/blocks/Carousel/options'

/** A Swiper slide element carries the per-slide `progress` the effect reads. */
type ExpoSlideEl = HTMLElement & { progress: number }

/** The custom-element registration hook Swiper Element exposes on `window`. */
type SwiperElementWindow = typeof window & {
  SwiperElementRegisterParams?: (params: string[]) => void
}

if (
  typeof window !== 'undefined' &&
  (window as SwiperElementWindow).SwiperElementRegisterParams
) {
  ;(window as SwiperElementWindow).SwiperElementRegisterParams!(['expoEffect'])
}

/**
 * The Expo custom Swiper effect (parallax + scale). A faithful port of the Pro
 * module — see the file header. Drives `.expo-container` / `.expo-content` /
 * `.expo-image` transforms from each slide's `progress`.
 */
const EffectExpo: SwiperModule = ({ swiper, on, extendParams }) => {
  extendParams({
    expoEffect: { ...EXPO_EFFECT_DEFAULTS },
  })

  const setTranslate = () => {
    const { slides, rtlTranslate: rtl } = swiper
    const spv = swiper.params.slidesPerView as number
    const isHorizontal = swiper.isHorizontal()
    let translateOffset = 0.5
    const params = (swiper.params as { expoEffect: ExpoEffectParams })
      .expoEffect
    const imageOffset = Math.max(1.25, params.imageOffset)
    if (spv > 1.5) {
      const minTranslateOffset = (imageOffset - 1) / 2 / imageOffset
      translateOffset = Math.max(minTranslateOffset, 0.5 - (spv - 1.5))
    }
    const imageScale = Math.max(1.125, params.imageScale)
    const scale = Math.max(1.25, params.scale)
    const rtlMultiplier = rtl ? -1 : 1

    for (let i = 0; i < slides.length; i += 1) {
      const slideEl = slides[i] as ExpoSlideEl
      const contentWrapEl =
        slideEl.querySelector<HTMLElement>('.expo-container')
      const contentEl = slideEl.querySelector<HTMLElement>('.expo-content')
      const imageEl = slideEl.querySelector<HTMLElement>('.expo-image')
      const progress = slideEl.progress
      const progressLimited = Math.max(Math.min(progress, 1), -1)

      if (imageEl) {
        imageEl.style.transform = `translate${isHorizontal ? 'X' : 'Y'}(${
          progressLimited * translateOffset * 100 * rtlMultiplier
        }%) scale(${1 + (imageScale - 1) * Math.abs(progressLimited)})`
        if (params.grayscale) {
          imageEl.style.filter = `grayscale(${Math.abs(progressLimited)})`
        }
      }
      const sides = isHorizontal
        ? rtl
          ? ['right', 'left']
          : ['left', 'right']
        : ['top', 'bottom']
      if (Math.abs(progress) > 0.01) {
        if (imageEl) {
          imageEl.style.transformOrigin = progress > 0 ? sides[0] : sides[1]
        }
        if (contentWrapEl) {
          contentWrapEl.style.transformOrigin =
            progress > 0 ? sides[1] : sides[0]
        }
      }
      if (contentWrapEl) {
        contentWrapEl.style.transform = `scale(${
          1 + (scale - 1) * Math.abs(progressLimited)
        }) rotate${isHorizontal ? 'Y' : 'X'}(${
          params.rotate *
          progressLimited *
          (isHorizontal ? 1 : -1) *
          rtlMultiplier
        }deg)`
      }
      if (contentEl) {
        contentEl.style.transform = `translate${isHorizontal ? 'X' : 'Y'}(${
          progressLimited * 100 * rtlMultiplier
        }%)`
        contentEl.style.opacity = String(1 - Math.abs(progressLimited) * 2)
      }
    }
  }

  const setTransition = (duration: number) => {
    const { slides } = swiper
    for (let i = 0; i < slides.length; i += 1) {
      const slideEl = slides[i]
      ;[
        ...slideEl.querySelectorAll<HTMLElement>(
          '.expo-container, .expo-image, .expo-content',
        ),
      ].forEach((el) => {
        el.style.transitionDuration = `${duration}ms`
      })
    }
  }

  const setSize = () => {
    const box = swiper.el.getBoundingClientRect()
    const size = swiper.isHorizontal() ? box.height : box.width
    const { rotate, scale, imageOffset } = (
      swiper.params as { expoEffect: ExpoEffectParams }
    ).expoEffect
    swiper.el.style.setProperty('--expo-image-offset', String(imageOffset))
    const currentValue = swiper.el.style.getPropertyValue('--expo-padding')
    const currentValueNumber = parseInt(currentValue, 10) || 0

    const activeSlideSize = size / scale
    let newValue = (size - activeSlideSize) / 2
    if (rotate) {
      newValue = newValue * 1.35
    }
    newValue = Math.round(newValue)

    if (currentValue && !Number.isNaN(currentValueNumber)) {
      if (Math.abs(newValue - currentValueNumber) < 5) return
    }

    swiper.el.style.setProperty('--expo-padding', `${newValue}px`)
  }

  on('init', setSize)
  on('resize', setSize)
  on('update', setSize)

  effectInit({
    effect: 'expo',
    swiper,
    on,
    setTranslate,
    setTransition,
    perspective: () => true,
    overwriteParams: () => ({
      centeredSlides: true,
      slidesPerGroup: 1,
      watchSlidesProgress: true,
    }),
  })
}

export default EffectExpo
