/**
 * The pure resolution layer for the testimonials "Cards Stack" deck (#61).
 *
 * @remarks Kept separate from the `'use client'` Swiper leaf — and free of any
 * `swiper/css` side-effect imports — so the deck's two contracts (autoplay stays
 * OFF, and the stacked `EffectCards` flourish degrades to a plain slide under
 * reduced motion) can be unit-tested without ever mounting Swiper, exactly as
 * the generic carousel's {@link resolveCarouselBehavior} is. The behaviour
 * itself is resolved *through* that shared mapper rather than re-derived, so the
 * autoplay-off / reduced-motion / keyboard rules stay single-sourced with #41.
 */

import {
  type CarouselBehaviorInput,
  type ResolvedCarouselBehavior,
  resolveCarouselBehavior,
} from '@/blocks/Carousel/options'

/**
 * The fixed, CMS-independent behaviour a testimonials deck runs with. Fed
 * through the shared mapper so autoplay resolves OFF (never passed `true`) and
 * navigation/pagination default on. A deck shows one card at a time, so the
 * track-only knobs (`slidesPerView`, `loop`, `effect`) are left at their mapper
 * defaults; the stacked look comes from `EffectCards` in the leaf, not `effect`.
 */
export const TESTIMONIALS_DECK_BEHAVIOR: CarouselBehaviorInput = {
  navigation: true,
  pagination: true,
}

/** The resolved deck: the shared behaviour plus whether the stacked effect mounts. */
export interface ResolvedTestimonialsDeck {
  /** The shared carousel behaviour (autoplay/loop/nav/pagination/keyboard). */
  behavior: ResolvedCarouselBehavior
  /**
   * Whether the stacked `EffectCards` transform mounts. A motion flourish, so
   * it is dropped under reduced motion — the deck then renders as a plain
   * one-at-a-time slide list rather than an animated 3D stack.
   */
  stacked: boolean
}

/**
 * Resolve the testimonials deck for the reader's motion preference.
 *
 * @param reducedMotion - The reader's platform reduced-motion state, read
 * synchronously in the client leaf via `usePrefersReducedMotion()`.
 * @returns The shared {@link ResolvedCarouselBehavior} plus the `stacked` flag
 * the leaf keys the `EffectCards` mount on.
 */
export function resolveTestimonialsDeck(
  reducedMotion: boolean,
): ResolvedTestimonialsDeck {
  return {
    behavior: resolveCarouselBehavior(TESTIMONIALS_DECK_BEHAVIOR, {
      reducedMotion,
    }),
    stacked: !reducedMotion,
  }
}
