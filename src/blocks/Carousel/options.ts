/**
 * The generic CMS→Swiper mapping vocabulary — one source for the Payload
 * `carousel` block config, the client Swiper leaf, and their tests, in the
 * shape `Image/treatment.ts` and `visibility.ts` established.
 *
 * @remarks This module is the foundation #41 exists to build: the translation
 * from the editor's stored knobs (`slidesPerView` + a mobile override,
 * `autoplay` + interval, `loop`, `effect`, `navigation`, `pagination`) into a
 * plain, serializable behaviour descriptor. Keeping the translation a pure
 * function — {@link resolveCarouselBehavior} — is what lets the reduced-motion
 * and autoplay-default-off rules be unit-tested without ever mounting Swiper,
 * and lets every later Wave-6 variant reuse one mapping instead of re-deriving
 * it. The non-serializable Swiper module wiring stays in the client leaf; only
 * this descriptor crosses the server→client boundary.
 */

import type { SelectField } from 'payload'

/** The generic carousel flavours. Pro-derived variants arrive later (#61–#64). */
export const CAROUSEL_VARIANTS = [
  { label: 'Cards', value: 'cards' },
  { label: 'Media', value: 'media' },
] as const

/** Carousel variant vocabulary, derived from {@link CAROUSEL_VARIANTS}. */
export type CarouselVariant = (typeof CAROUSEL_VARIANTS)[number]['value']

/** The variant a carousel starts at when nothing says otherwise. */
export const DEFAULT_CAROUSEL_VARIANT: CarouselVariant = 'cards'

/**
 * Postgres enum backing the `variant` select. Named explicitly because the
 * block nests three levels deep inside a column (`pages.layout` → `container`
 * → `column` → here), where the generated identifier crowds Postgres's
 * 63-character limit and would change the moment the block moves.
 */
export const CAROUSEL_VARIANT_ENUM_NAME = 'enum_carousel_variant'

/** The transition between slides. `slide` translates; `fade` cross-fades. */
export const CAROUSEL_EFFECTS = [
  { label: 'Slide', value: 'slide' },
  { label: 'Fade', value: 'fade' },
] as const

/** Carousel effect vocabulary, derived from {@link CAROUSEL_EFFECTS}. */
export type CarouselEffect = (typeof CAROUSEL_EFFECTS)[number]['value']

/** The effect a carousel starts at — a plain horizontal slide. */
export const DEFAULT_CAROUSEL_EFFECT: CarouselEffect = 'slide'

/** Postgres enum backing the `effect` select (see {@link CAROUSEL_VARIANT_ENUM_NAME}). */
export const CAROUSEL_EFFECT_ENUM_NAME = 'enum_carousel_effect'

/** Slides shown at once on desktop when the editor sets nothing. */
export const DEFAULT_SLIDES_PER_VIEW = 1

/** Slides shown at once below {@link CAROUSEL_DESKTOP_BREAKPOINT_PX}. */
export const DEFAULT_SLIDES_PER_VIEW_MOBILE = 1

/** Upper bound on slides-per-view — past this a slide is an unreadable strip. */
export const MAX_SLIDES_PER_VIEW = 6

/** Autoplay dwell per slide (ms) when the editor enables autoplay but sets no interval. */
export const DEFAULT_AUTOPLAY_INTERVAL_MS = 5000

/** Floor on the autoplay interval (ms) — faster reads as a flicker, not a carousel. */
export const MIN_AUTOPLAY_INTERVAL_MS = 1000

/**
 * Viewport width (px) at which the desktop `slidesPerView` takes over from the
 * mobile override. Below it the mobile count applies; from it up, the desktop
 * count. A single Swiper `breakpoints` entry, so the two counts are the only
 * responsive knobs an editor has to reason about.
 */
export const CAROUSEL_DESKTOP_BREAKPOINT_PX = 768

/** The stored, serializable knobs the mapping layer reads (a mirror of the config fields). */
export interface CarouselBehaviorInput {
  slidesPerView?: number | null
  slidesPerViewMobile?: number | null
  autoplay?: boolean | null
  interval?: number | null
  loop?: boolean | null
  effect?: CarouselEffect | string | null
  navigation?: boolean | null
  pagination?: boolean | null
}

/** Resolved autoplay settings, shaped for Swiper's `autoplay` prop. */
export interface ResolvedAutoplay {
  /** Dwell per slide, in milliseconds. */
  delay: number
  /** A manual interaction stops autoplay — the reader took over. */
  disableOnInteraction: boolean
  /** Hovering pauses autoplay so a reader can dwell without it moving on. */
  pauseOnMouseEnter: boolean
}

/**
 * The plain behaviour descriptor the client leaf consumes — every value
 * serializable, so it crosses the server→client boundary intact and the
 * Swiper module wiring is the leaf's only non-serializable concern.
 */
export interface ResolvedCarouselBehavior {
  /** Slides at once below the desktop breakpoint. */
  slidesPerViewMobile: number
  /** Slides at once from the desktop breakpoint up. */
  slidesPerView: number
  /** Where {@link slidesPerView} takes over from {@link slidesPerViewMobile}. */
  desktopBreakpoint: number
  /** Whether the track wraps seamlessly. */
  loop: boolean
  /** The resolved transition — never `fade` under reduced motion. */
  effect: CarouselEffect
  /** Autoplay settings, or `false` when autoplay is off (the default) or suppressed. */
  autoplay: ResolvedAutoplay | false
  /** Whether prev/next arrows show. */
  navigation: boolean
  /** Whether the pagination dots show. */
  pagination: boolean
  /** Keyboard navigation is always on — arrows/tab reach slides (an AC of #41). */
  keyboard: true
}

/** Clamp a stored slides-per-view to a whole number in `[1, MAX_SLIDES_PER_VIEW]`. */
function clampPerView(
  value: number | null | undefined,
  fallback: number,
): number {
  const n =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.floor(value)
      : fallback
  return Math.min(Math.max(n, 1), MAX_SLIDES_PER_VIEW)
}

/** Normalize a stored effect string to a known {@link CarouselEffect}. */
function normalizeEffect(
  value: CarouselEffect | string | null | undefined,
): CarouselEffect {
  return value === 'fade' ? 'fade' : DEFAULT_CAROUSEL_EFFECT
}

/**
 * The mapping layer: translate the editor's stored knobs into a plain Swiper
 * behaviour descriptor, applying the two behaviour contracts #41 pins.
 *
 * @param input - The stored, serializable carousel knobs.
 * @param options - Carrier for `reducedMotion`, the reader's platform
 * reduced-motion state, read synchronously via `getPrefersReducedMotion()` in
 * the client leaf (a synchronous read, not a provider — the ticket's provider
 * wording is stale).
 * @returns A serializable {@link ResolvedCarouselBehavior}.
 *
 * @remarks Two hard rules live here so no variant can forget them:
 *
 * - **Autoplay defaults OFF** and is **disabled entirely under reduced
 *   motion.** Only an explicit `autoplay: true` with motion allowed yields an
 *   autoplay object; anything else is `false`, so the carousel never moves on
 *   its own unless the editor asked and the reader allows it.
 * - **Reduced motion also neutralizes the `fade` flourish**, collapsing it to
 *   a plain `slide` so the transition is static-ish rather than a cross-fade.
 *
 * Fade also forces a single slide per view (a cross-fade of a multi-slide
 * track is incoherent), keeping the mapping honest rather than passing an
 * impossible combination to Swiper.
 */
export function resolveCarouselBehavior(
  input: CarouselBehaviorInput,
  { reducedMotion }: { reducedMotion: boolean },
): ResolvedCarouselBehavior {
  const effect = reducedMotion
    ? DEFAULT_CAROUSEL_EFFECT
    : normalizeEffect(input.effect)

  const slidesPerView =
    effect === 'fade'
      ? 1
      : clampPerView(input.slidesPerView, DEFAULT_SLIDES_PER_VIEW)
  const slidesPerViewMobile =
    effect === 'fade'
      ? 1
      : clampPerView(input.slidesPerViewMobile, DEFAULT_SLIDES_PER_VIEW_MOBILE)

  const autoplayOn = input.autoplay === true && !reducedMotion
  const delay = Math.max(
    typeof input.interval === 'number' && Number.isFinite(input.interval)
      ? input.interval
      : DEFAULT_AUTOPLAY_INTERVAL_MS,
    MIN_AUTOPLAY_INTERVAL_MS,
  )

  return {
    slidesPerViewMobile,
    slidesPerView,
    desktopBreakpoint: CAROUSEL_DESKTOP_BREAKPOINT_PX,
    loop: input.loop === true,
    effect,
    autoplay: autoplayOn
      ? { delay, disableOnInteraction: true, pauseOnMouseEnter: true }
      : false,
    navigation: input.navigation ?? true,
    pagination: input.pagination ?? true,
    keyboard: true,
  }
}

/** Select options for the `variant` field, derived from {@link CAROUSEL_VARIANTS}. */
export const CAROUSEL_VARIANT_OPTIONS: {
  label: string
  value: CarouselVariant
}[] = CAROUSEL_VARIANTS.map(({ label, value }) => ({ label, value }))

/** Select options for the `effect` field, derived from {@link CAROUSEL_EFFECTS}. */
export const CAROUSEL_EFFECT_OPTIONS: {
  label: string
  value: CarouselEffect
}[] = CAROUSEL_EFFECTS.map(({ label, value }) => ({ label, value }))

/**
 * Build the shared `variant` select field.
 *
 * @returns A required Payload select on {@link CAROUSEL_VARIANT_ENUM_NAME},
 * defaulting to {@link DEFAULT_CAROUSEL_VARIANT}. A factory so config and tests
 * read one shape.
 */
export function carouselVariantField(): SelectField {
  return {
    name: 'variant',
    type: 'select',
    required: true,
    defaultValue: DEFAULT_CAROUSEL_VARIANT,
    enumName: CAROUSEL_VARIANT_ENUM_NAME,
    options: [...CAROUSEL_VARIANT_OPTIONS],
    admin: {
      description:
        'Cards render an image with a title and text; Media renders the image edge-to-edge. Both obey every behaviour knob below.',
    },
  }
}

/**
 * Build the shared `effect` select field.
 *
 * @returns A required Payload select on {@link CAROUSEL_EFFECT_ENUM_NAME},
 * defaulting to {@link DEFAULT_CAROUSEL_EFFECT}.
 */
export function carouselEffectField(): SelectField {
  return {
    name: 'effect',
    type: 'select',
    required: true,
    defaultValue: DEFAULT_CAROUSEL_EFFECT,
    enumName: CAROUSEL_EFFECT_ENUM_NAME,
    options: [...CAROUSEL_EFFECT_OPTIONS],
    admin: {
      description:
        'Slide moves the track horizontally; Fade cross-fades one slide at a time (a single slide per view). Reduced motion collapses Fade to Slide.',
    },
  }
}
