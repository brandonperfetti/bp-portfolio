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

/**
 * The transition between slides. `slide` translates; `fade` cross-fades;
 * `expo` is the ported UI-Initiative parallax + scale photo showcase (#62),
 * which pairs with `variant: 'media'` and runs a centred, fractional track.
 */
export const CAROUSEL_EFFECTS = [
  { label: 'Slide', value: 'slide' },
  { label: 'Fade', value: 'fade' },
  { label: 'Expo (parallax + scale)', value: 'expo' },
] as const

/** Carousel effect vocabulary, derived from {@link CAROUSEL_EFFECTS}. */
export type CarouselEffect = (typeof CAROUSEL_EFFECTS)[number]['value']

/** The effect a carousel starts at — a plain horizontal slide. */
export const DEFAULT_CAROUSEL_EFFECT: CarouselEffect = 'slide'

/** Postgres enum backing the `effect` select (see {@link CAROUSEL_VARIANT_ENUM_NAME}). */
export const CAROUSEL_EFFECT_ENUM_NAME = 'enum_carousel_effect'

/**
 * Track orientation. Only the `expo` effect surfaces this to editors (#62
 * addendum) — the Pro Expo demo's HORIZONTAL / VERTICAL toggle. `slide` and
 * `fade` are always horizontal, so the field is expo-gated in admin.
 */
export const CAROUSEL_DIRECTIONS = [
  { label: 'Horizontal', value: 'horizontal' },
  { label: 'Vertical', value: 'vertical' },
] as const

/** Carousel direction vocabulary, derived from {@link CAROUSEL_DIRECTIONS}. */
export type CarouselDirection = (typeof CAROUSEL_DIRECTIONS)[number]['value']

/** The orientation a carousel starts at — a normal horizontal track. */
export const DEFAULT_CAROUSEL_DIRECTION: CarouselDirection = 'horizontal'

/** Postgres enum backing the `direction` select (see {@link CAROUSEL_VARIANT_ENUM_NAME}). */
export const CAROUSEL_DIRECTION_ENUM_NAME = 'enum_carousel_direction'

/** Slides shown at once on desktop when the editor sets nothing. */
export const DEFAULT_SLIDES_PER_VIEW = 1

/** Slides shown at once below {@link CAROUSEL_DESKTOP_BREAKPOINT_PX}. */
export const DEFAULT_SLIDES_PER_VIEW_MOBILE = 1

/** Upper bound on slides-per-view — past this a slide is an unreadable strip. */
export const MAX_SLIDES_PER_VIEW = 6

/**
 * Slides shown at once for the `expo` effect on desktop. Expo is a *centred*
 * carousel that shows a sliver of the neighbouring slides so the parallax +
 * scale reads — it needs a fractional count and does NOT support Swiper's
 * `slidesPerView: 'auto'`. 1.5 is the value the Pro effect is designed around.
 */
export const EXPO_SLIDES_PER_VIEW = 1.5

/** Slides shown at once for the `expo` effect below the desktop breakpoint. */
export const EXPO_SLIDES_PER_VIEW_MOBILE = 1.15

/**
 * The Pro `expoEffect` params object the ported effect reads. Kept here (not in
 * the Swiper-coupled leaf) so it stays a plain, serializable data shape and the
 * mapping layer can hand it to the client without importing any Swiper code —
 * the same server→client discipline the rest of this module keeps.
 */
export interface ExpoEffectParams {
  /** Image scale multiplier for the centred slide (1.125 is the Pro minimum). */
  imageScale: number
  /** Image overscan multiplier that drives the parallax (1.25 is the Pro minimum). */
  imageOffset: number
  /** Side-slide scale multiplier (1.25 is the Pro minimum). */
  scale: number
  /** Side-slide rotate angle, in degrees (0 = flat). */
  rotate: number
  /** Desaturate off-centre slides as they leave the centre. */
  grayscale: boolean
}

/**
 * The Pro Expo defaults. The mapper merges the two editor-surfaced params
 * (`rotate`, `grayscale`) over this, so an unset field keeps the Pro value;
 * `imageScale`/`imageOffset`/`scale` are not editor-exposed and always hold.
 *
 * @remarks `grayscale: true` is a deliberate brand default, kept from the Pro
 * source: desaturating the off-centre slides concentrates attention on the
 * full-colour centred photo and reads as intentional editorial restraint on the
 * site's zinc palette — the opposite of a distracting, equally-saturated wall of
 * images. The active slide is always full colour. Editors can turn it off per
 * carousel (#62 addendum). `rotate` defaults flat (`0`).
 */
export const EXPO_EFFECT_DEFAULTS: ExpoEffectParams = {
  imageScale: 1.125,
  imageOffset: 1.25,
  scale: 1.25,
  rotate: 0,
  grayscale: true,
}

/** The flat default for the editor-facing expo `rotate` angle (degrees). */
export const DEFAULT_EXPO_ROTATE = 0

/**
 * Upper bound on the expo side-slide rotate angle (degrees). Past ~30° the 3D
 * tilt reads as a gimmick and the effect's `setSize` padding bump (×1.35) eats
 * too much vertical room; 30 keeps it tasteful. The field is a number of
 * degrees rather than a boolean so an editor can dial the tilt (the faithful
 * Pro param), not just flip a fixed angle on.
 */
export const EXPO_MAX_ROTATE = 30

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
  /** Expo-only track orientation (ignored for `slide`/`fade`). */
  direction?: CarouselDirection | string | null
  /** Expo-only side-slide rotate angle, in degrees. */
  rotate?: number | null
  /** Expo-only: desaturate off-centre slides. */
  grayscale?: boolean | null
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
  /** The resolved transition — never `fade` or `expo` under reduced motion. */
  effect: CarouselEffect
  /**
   * The resolved track orientation, passed to Swiper's `direction` for a
   * correct first paint. Only `expo` can resolve to `vertical`; every other
   * effect — and any reduced-motion collapse — resolves to `horizontal`, so a
   * degraded reader never gets the vertical height treatment.
   */
  direction: CarouselDirection
  /**
   * Whether Swiper centres the active slide. Forced on for `expo` (a centred
   * carousel), off otherwise. The `expo` effect also forces this internally via
   * `overwriteParams`, but the leaf passes it so the very first paint is centred
   * rather than snapping after init.
   */
  centeredSlides: boolean
  /**
   * The `expoEffect` params, present only when {@link effect} is `expo` (so the
   * leaf both keys the module mount and passes the params off one field). Absent
   * for every other effect, including when reduced motion has collapsed `expo`
   * to `slide` — the transforms and the module must NOT mount then.
   */
  expoEffect?: ExpoEffectParams
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

/** The recognized effect values, derived from {@link CAROUSEL_EFFECTS}. */
const KNOWN_EFFECTS: readonly CarouselEffect[] = CAROUSEL_EFFECTS.map(
  (e) => e.value,
)

/** Normalize a stored effect string to a known {@link CarouselEffect}. */
function normalizeEffect(
  value: CarouselEffect | string | null | undefined,
): CarouselEffect {
  return KNOWN_EFFECTS.includes(value as CarouselEffect)
    ? (value as CarouselEffect)
    : DEFAULT_CAROUSEL_EFFECT
}

/**
 * Resolve the slides-per-view for the `expo` effect. Expo is centred and needs
 * a fractional count, so it is exempt from the whole-number clamp the plain
 * track uses: an editor's fractional value passes through (capped at MAX), and
 * anything that is not a usable fractional count (unset, or the default `1`
 * that would hide the neighbouring slides) falls back to the Pro-designed
 * default rather than being floored to `1`.
 */
function expoPerView(
  value: number | null | undefined,
  fallback: number,
): number {
  const usable =
    typeof value === 'number' && Number.isFinite(value) && value > 1
  return Math.min(usable ? value : fallback, MAX_SLIDES_PER_VIEW)
}

/** Normalize a stored direction to a known {@link CarouselDirection}. */
function normalizeDirection(
  value: CarouselDirection | string | null | undefined,
): CarouselDirection {
  return value === 'vertical' ? 'vertical' : DEFAULT_CAROUSEL_DIRECTION
}

/** Clamp a stored expo rotate angle into `[0, EXPO_MAX_ROTATE]` degrees. */
function clampRotate(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EXPO_ROTATE
  }
  return Math.min(Math.max(value, 0), EXPO_MAX_ROTATE)
}

/**
 * Build the resolved {@link ExpoEffectParams} from the editor's two exposed
 * knobs, merged over the Pro defaults so an unset field keeps its default:
 * `rotate` is clamped to `[0, EXPO_MAX_ROTATE]`, `grayscale` defaults `true`.
 */
function resolveExpoEffect(input: CarouselBehaviorInput): ExpoEffectParams {
  return {
    ...EXPO_EFFECT_DEFAULTS,
    rotate: clampRotate(input.rotate),
    grayscale: input.grayscale ?? EXPO_EFFECT_DEFAULTS.grayscale,
  }
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
 * - **Reduced motion also neutralizes the `fade` and `expo` flourishes**,
 *   collapsing them to a plain `slide` so the transition is static-ish rather
 *   than a cross-fade or a parallax. When `expo` collapses this way the resolved
 *   `expoEffect` is left `undefined`, so the leaf mounts neither the Expo module
 *   nor its DOM/transforms.
 *
 * Fade forces a single slide per view (a cross-fade of a multi-slide track is
 * incoherent). Expo instead forces its own *fractional* count (~1.5) because it
 * is a centred carousel that must reveal its neighbours — the one effect exempt
 * from the whole-number clamp. Either way the mapping never hands Swiper an
 * impossible combination.
 *
 * The three Expo-only editor knobs (#62 addendum) are resolved here too, and
 * only for `expo`: `direction` (horizontal/vertical), and `rotate` + `grayscale`
 * merged over {@link EXPO_EFFECT_DEFAULTS} into the resolved {@link ExpoEffectParams}.
 * Under a reduced-motion collapse they all fall away — `direction` resolves
 * `horizontal` and `expoEffect` stays `undefined` — so the degraded reader gets
 * a plain horizontal media slide with no tilt, desaturation, or vertical height.
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
      : effect === 'expo'
        ? expoPerView(input.slidesPerView, EXPO_SLIDES_PER_VIEW)
        : clampPerView(input.slidesPerView, DEFAULT_SLIDES_PER_VIEW)
  const slidesPerViewMobile =
    effect === 'fade'
      ? 1
      : effect === 'expo'
        ? expoPerView(input.slidesPerViewMobile, EXPO_SLIDES_PER_VIEW_MOBILE)
        : clampPerView(
            input.slidesPerViewMobile,
            DEFAULT_SLIDES_PER_VIEW_MOBILE,
          )

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
    direction:
      effect === 'expo'
        ? normalizeDirection(input.direction)
        : DEFAULT_CAROUSEL_DIRECTION,
    centeredSlides: effect === 'expo',
    expoEffect: effect === 'expo' ? resolveExpoEffect(input) : undefined,
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
        'Slide moves the track horizontally; Fade cross-fades one slide at a time (a single slide per view); Expo is a centred parallax + scale photo showcase (pairs with the Media variant). Reduced motion collapses Fade and Expo to Slide.',
    },
  }
}

/**
 * Show a field only when the sibling `effect` select is `expo`. Mirrors the
 * `interval`-on-`autoplay` gate so the three Expo controls stay hidden for the
 * generic `slide`/`fade` carousels and never clutter the common case. Both the
 * live block config and the config test read this one predicate.
 *
 * @param _data - The full document data (unused; the effect is a sibling).
 * @param siblingData - The block's own data, where `effect` lives.
 * @returns Whether the Expo-only field should render.
 */
export const isExpoEffectSelected = (
  _data: unknown,
  siblingData: unknown,
): boolean =>
  (siblingData as { effect?: string } | undefined)?.effect === 'expo'

/**
 * Build the expo-only `direction` select field (horizontal / vertical).
 *
 * @returns A Payload select on {@link CAROUSEL_DIRECTION_ENUM_NAME}, defaulting
 * to {@link DEFAULT_CAROUSEL_DIRECTION}, shown only when `effect === 'expo'`.
 */
export function carouselDirectionField(): SelectField {
  return {
    name: 'direction',
    type: 'select',
    defaultValue: DEFAULT_CAROUSEL_DIRECTION,
    enumName: CAROUSEL_DIRECTION_ENUM_NAME,
    options: CAROUSEL_DIRECTIONS.map(({ label, value }) => ({ label, value })),
    admin: {
      condition: isExpoEffectSelected,
      description:
        'Expo only: run the parallax track horizontally or vertically. Vertical gets a bounded height so slides never collapse.',
    },
  }
}
