/**
 * Route vertical rhythm — how the `[slug]` route spaces a page's hero and the
 * flow into its blocks. The opt-in vocabulary that lets a Home-shaped page
 * reproduce live Home's rhythm without changing any existing page.
 *
 * @remarks Live Home and the page-builder route wrap their hero differently:
 * Home uses `<section className="isolate">` with the hero in a
 * `<Container className="pt-9 pb-16 sm:pb-20">`, flush to the top; the route
 * wraps everything in `<Container className="isolate mt-16 sm:mt-32">` and puts
 * `<div className="mt-8">` before the blocks. That difference sits the route's
 * H1 higher than Home's (measured on staging, #42). This module names the two
 * rhythms as data so a page can select Home's, and so the orchestrator can dial
 * the exact class values to pixel parity in one place.
 *
 * Classes are complete literal strings so Tailwind's source scan finds them;
 * never interpolate a stored value into a class name (the rule
 * `src/blocks/Container/section.ts` established).
 */

import {
  HERO_FULL_BLEED_FRAME_CLASS,
  HERO_FULL_BLEED_HOME_FRAME_CLASS,
  HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS,
} from '@/heros/presentation'

/**
 * Route rhythm vocabulary shared by the Payload select and the route.
 *
 * - `standard` — the page-builder default: the hero sits below the route
 *   Container's `mt-16 sm:mt-32`, with `mt-8` before the blocks. Every page
 *   written before this field existed is this, and renders byte-identically.
 * - `homeParity` — live Home's rhythm: the hero pulled flush to the top with
 *   the homepage's `pt-9 pb-16 sm:pb-20`, and no extra margin before the
 *   blocks so a full-bleed photoStrip butts straight against the hero.
 */
export const ROUTE_RHYTHMS = [
  { value: 'standard', label: 'Standard (page-builder default)' },
  { value: 'homeParity', label: 'Home parity (flush hero, homepage rhythm)' },
] as const

/** A route rhythm value, derived from {@link ROUTE_RHYTHMS}. */
export type RouteRhythm = (typeof ROUTE_RHYTHMS)[number]['value']

/**
 * Rhythm for a page that has never set the field — the current route
 * behaviour, so adding the field regresses nothing.
 */
export const DEFAULT_ROUTE_RHYTHM: RouteRhythm = 'standard'

/** Select options for the hero group's `rhythm` field. */
export const ROUTE_RHYTHM_OPTIONS: { label: string; value: RouteRhythm }[] =
  ROUTE_RHYTHMS.map(({ label, value }) => ({ label, value }))

/**
 * Postgres enum backing the `rhythm` select.
 *
 * @remarks Explicit for the same reason as `enum_pages_hero_presentation`:
 * Payload's generated name would differ between `pages` and `_pages_v` and
 * both approach the 63-character identifier limit; naming it here makes one
 * enum serve both tables.
 */
export const ROUTE_RHYTHM_ENUM_NAME = 'enum_pages_hero_rhythm'

/**
 * Rhythm for a stored value, tolerating `string | null | undefined`.
 *
 * @param value - Stored rhythm value, if any.
 * @returns A known rhythm, falling back to {@link DEFAULT_ROUTE_RHYTHM} so a
 * page written before this field existed (or carrying a value from a future
 * vocabulary) keeps the current route rhythm rather than breaking.
 */
export function routeRhythm(value: string | null | undefined): RouteRhythm {
  return ROUTE_RHYTHMS.some((option) => option.value === value)
    ? (value as RouteRhythm)
    : DEFAULT_ROUTE_RHYTHM
}

/**
 * The class knobs a rhythm turns, kept together so the two rhythms stay a set
 * and the orchestrator dials one place.
 */
export interface RouteRhythmProfile {
  /**
   * Classes on the route's outer `<Container>` — the element that owns the
   * full-bleed hero's stacking context, so it always carries
   * {@link HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS}.
   */
  containerClass: string
  /**
   * Classes on a wrapper around `RenderHero`, or `null` to render it bare.
   * `null` for `standard` so the default route emits exactly the DOM it did
   * before this field existed (no extra wrapper element).
   */
  heroWrapperClass: string | null
  /** Classes on the `<div>` that wraps `RenderBlocks`. */
  blocksWrapperClass: string
  /**
   * Full-bleed shader-canvas frame for this rhythm — the vertical pull differs
   * because each rhythm places the hero at a different document offset.
   * {@link HeroView} reads it via {@link routeRhythmProfile}.
   */
  heroFullBleedFrameClass: string
}

/**
 * The two route rhythms, as class data.
 *
 * @remarks `standard` is the literal the route has always rendered; the route
 * keeps that branch verbatim and `[slug]/page.test.tsx` asserts the two agree,
 * so a future edit here can't silently drift the default page. `homeParity`
 * carries this batch's sensible defaults — the orchestrator dials them to pixel
 * parity with live Home via the compose+diff, so treat the numbers as a
 * starting point, not a measurement.
 */
export const ROUTE_RHYTHM_PROFILES: Record<RouteRhythm, RouteRhythmProfile> = {
  standard: {
    containerClass: `${HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS} mt-16 sm:mt-32`,
    heroWrapperClass: null,
    blocksWrapperClass: 'mt-8',
    heroFullBleedFrameClass: HERO_FULL_BLEED_FRAME_CLASS,
  },
  homeParity: {
    containerClass: HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS,
    heroWrapperClass: 'pt-9 pb-16 sm:pb-20',
    blocksWrapperClass: '',
    heroFullBleedFrameClass: HERO_FULL_BLEED_HOME_FRAME_CLASS,
  },
}

/**
 * Resolve a stored rhythm value straight to its profile.
 *
 * @param value - Stored rhythm value, if any.
 * @returns The matching {@link RouteRhythmProfile}, defaulting to `standard`.
 */
export function routeRhythmProfile(
  value: string | null | undefined,
): RouteRhythmProfile {
  return ROUTE_RHYTHM_PROFILES[routeRhythm(value)]
}
