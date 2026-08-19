/**
 * How a shader hero presents itself on a CMS-built page — the vocabulary the
 * Payload select and `RenderHero` share, plus the geometry that lets the
 * full-bleed variant escape the route's `<Container>`.
 *
 * @remarks Classes are complete literal strings so Tailwind's source scan
 * finds them; never interpolate a stored value into a class name (the rule
 * `src/blocks/Container/section.ts` established).
 */

import {
  type CarouselEffect,
  DEFAULT_CAROUSEL_EFFECT,
} from '@/blocks/Carousel/options'

/**
 * Presentation vocabulary of the shader hero.
 *
 * - `fullBleed` — the homepage treatment: the canvas is pulled up behind the
 *   site header and out to the content panel's edges, with the legibility
 *   scrim and the fade into the page below. Hero text stays in normal flow
 *   on top of it.
 * - `card` — the bounded rounded panel the `shaderHero` block renders today:
 *   the canvas fills a `min-h-[20rem]` card and the hero text sits inside it.
 *   No scrim and no bottom fade — both exist to blend a page-top background
 *   into the page, which a card must not do.
 */
export const HERO_PRESENTATIONS = [
  {
    value: 'fullBleed',
    label: 'Full bleed (behind the header)',
  },
  {
    value: 'card',
    label: 'Card (bounded panel)',
  },
] as const

/** Presentation of a shader hero, derived from {@link HERO_PRESENTATIONS}. */
export type HeroPresentation = (typeof HERO_PRESENTATIONS)[number]['value']

/** What a shader hero presents as when the editor hasn't chosen — the ticket's headline behaviour. */
export const DEFAULT_HERO_PRESENTATION: HeroPresentation = 'fullBleed'

/** Select options for the hero group's `presentation` field. */
export const HERO_PRESENTATION_OPTIONS: {
  label: string
  value: HeroPresentation
}[] = HERO_PRESENTATIONS.map(({ label, value }) => ({ label, value }))

/**
 * Postgres enum backing the `presentation` select.
 *
 * @remarks Explicit because Payload's generated name would differ between
 * `pages` and `_pages_v` and both are close to the 63-character identifier
 * limit; naming it here makes one enum serve both tables (the pattern
 * `enum_container_section_width` established).
 */
export const HERO_PRESENTATION_ENUM_NAME = 'enum_pages_hero_presentation'

/**
 * Presentation for a stored value, tolerating `string | null | undefined`.
 *
 * @param value - Stored presentation value, if any.
 * @returns A known presentation, falling back to the default so a page
 * written before this field existed (or carrying a value from a future
 * vocabulary) renders as a full-bleed hero rather than nothing.
 */
export function heroPresentation(
  value: string | null | undefined,
): HeroPresentation {
  return HERO_PRESENTATIONS.some((option) => option.value === value)
    ? (value as HeroPresentation)
    : DEFAULT_HERO_PRESENTATION
}

/**
 * Height of the site header on every route except `/` (px).
 *
 * @remarks `Header` renders a `h-16` bar and sets `--header-height` to
 * `avatarTop + height`; `avatarTop` is 0 off the homepage (the enlarged
 * avatar only mounts there), and the growing height it sets while scrolling
 * is cancelled by an equal negative `--header-mb`. So the header occupies a
 * constant 64px of document height above `<main>`.
 */
export const ROUTE_HEADER_HEIGHT_PX = 64

/**
 * Height of the site header on `/` at rest (px).
 *
 * @remarks Unlike every other route (see {@link ROUTE_HEADER_HEIGHT_PX}), `/`
 * mounts the enlarged-avatar home header, which occupies ~180px of document
 * height above `<main>` rather than the 64px `h-16` bar — measured on staging
 * 2026-08-13 (`--header-height` = 180px; header spans y=0..180 at 1440/768/390,
 * no breakpoint variance). The home-parity full-bleed canvas has to reach up
 * past all of it, so its pull is derived from this, not from
 * {@link ROUTE_HEADER_HEIGHT_PX}. See {@link HERO_FULL_BLEED_HOME_FRAME_CLASS}.
 */
export const HOME_HEADER_HEIGHT_PX = 180

/**
 * Top padding the home-parity hero wrapper (`pt-9`) puts between the isolate
 * Container's top and `RenderHero`'s `<header>` (px).
 *
 * @remarks The home-parity rhythm drops the route Container's `mt-16 sm:mt-32`
 * and instead wraps the hero in the homepage's `pt-9 pb-16 sm:pb-20`
 * (`ROUTE_RHYTHM_PROFILES.homeParity` in `src/heros/routeRhythm.ts`). `pt-9` is
 * `2.25rem` = 36px, breakpoint-independent, so it is the only gap between the
 * site header and the hero `<header>` under home parity.
 */
export const HOME_HERO_TOP_PADDING_PX = 36

/**
 * Top margin the `[slug]` route's `<Container className="mt-16 sm:mt-32">`
 * puts between `<main>` and the hero (px, per breakpoint).
 */
export const ROUTE_CONTAINER_TOP_MARGIN_PX = { base: 64, sm: 128 }

/**
 * Positioning box of the full-bleed canvas, relative to `RenderHero`'s own
 * `relative` `<header>`.
 *
 * @remarks Two escapes from the route's `<Container>`, each the smallest
 * mechanism that works:
 *
 * - *Vertical*: `-top-32` (128px) = the 64px header + the Container's 64px
 *   `mt-16`; `sm:-top-48` (192px) = 64px + the 128px `sm:mt-32`. That puts
 *   the canvas top at document top, where the homepage's is, so it runs
 *   behind the header exactly as the original does. Nothing between the
 *   Container and the hero adds vertical padding, so these two numbers are
 *   the whole offset. See {@link ROUTE_HEADER_HEIGHT_PX} /
 *   {@link ROUTE_CONTAINER_TOP_MARGIN_PX}.
 * - *Horizontal*: the same `w-screen` breakout a full-bleed container
 *   section uses (`src/blocks/Container/section.ts`) — the hero sits inside
 *   `ContainerInner`'s centered `max-w-2xl lg:max-w-5xl` measure, whose
 *   distance to the panel edge changes with the viewport, so no fixed
 *   negative inset can reach the edges. Centring 100vw on the hero and then
 *   clipping with {@link HERO_FULL_BLEED_PANEL_CLASS} reproduces the
 *   homepage's box: the canvas still stops at the `max-w-7xl` panel, per
 *   Brandon's staging review, rather than bleeding past it. `w-screen`
 *   counts a classic scrollbar; the frontend layout root carries
 *   `overflow-x-clip` for exactly that (W1B4).
 *
 * The offsets are anchored to `RenderHero`'s own `<header>` rather than to
 * whichever ancestor happens to be positioned, so the containing block is
 * always the element two lines above the canvas in the same file.
 */
export const HERO_FULL_BLEED_FRAME_CLASS =
  'pointer-events-none absolute -top-32 left-1/2 -z-10 h-[36rem] w-screen -translate-x-1/2 sm:-top-48 sm:px-8'

/**
 * Full-bleed canvas frame for the **home-parity** route rhythm (see
 * {@link ROUTE_RHYTHM_PROFILES} in `src/heros/routeRhythm.ts`).
 *
 * @remarks Same box as {@link HERO_FULL_BLEED_FRAME_CLASS} — a `w-screen`
 * breakout centred on the hero and clipped to the panel — but a different
 * vertical pull, because the home-parity rhythm changes what sits above the
 * hero. There the route Container drops its `mt-16 sm:mt-32` and the hero
 * instead carries the homepage's `pt-9`, so the hero `<header>` starts
 * {@link HOME_HEADER_HEIGHT_PX} (180px) + {@link HOME_HERO_TOP_PADDING_PX}
 * (36px, `pt-9`) = **216px** below the document top at every breakpoint — a
 * single, breakpoint-independent offset, unlike the standard rhythm whose two
 * margins need two values.
 *
 * *Chosen fix (Option A — dial + extend).* The pull that shipped, `-top-24`
 * (96px), was a documented sensible default that was never dialed, and its
 * arithmetic silently assumed the 64px {@link ROUTE_HEADER_HEIGHT_PX} bar. But
 * `/` renders the *tall* enlarged-avatar home header (~180px). At 96px of pull
 * the canvas landed at 216 − 96 = **120px**, leaving a constant 120px dark band
 * at y=0..120 behind the header at every width (staging 2026-08-13). The
 * original hard-coded Home never had this: `SHADER_HERO_FRAME_CLASS` anchors its
 * canvas `top-0` to the `<section className="isolate">` that overlaps the
 * header, so it self-adjusts. Re-anchoring that way here (Option B) would mean
 * dropping `relative` from `HeroView`'s shared `<header>` and positioning the
 * Container — which is shared with the standard rhythm and would risk the
 * `[slug]` byte-parity the tests pin. So instead we *dial the pull* to reach the
 * document top and *extend the height* to hold the bottom, both derived and both
 * scoped to this one string.
 *
 * - *Pull* `-top-[216px]` = {@link HOME_HEADER_HEIGHT_PX} +
 *   {@link HOME_HERO_TOP_PADDING_PX} = the hero `<header>`'s own top, so the
 *   canvas top lands at document top (0), painting the aurora behind the full
 *   180px header — no gap. The pull is at least the home header height by
 *   construction, which is the "covers the header" guarantee the test pins.
 * - *Height* `h-[43.5rem]` (696px) keeps the canvas bottom exactly where it was
 *   (216 − 96 + 576 = 696px, the current fade-into-content point). The pull grew
 *   by 120px, so the height grows by the same 120px (576 → 696) and the bottom
 *   fade does not move up — a +120px correction of upward reach, nothing else.
 *
 * This is the one knob to turn for the hero-canvas position under home parity;
 * the standard rhythm keeps {@link HERO_FULL_BLEED_FRAME_CLASS} unchanged.
 */
export const HERO_FULL_BLEED_HOME_FRAME_CLASS =
  'pointer-events-none absolute -top-[216px] left-1/2 -z-10 h-[43.5rem] w-screen -translate-x-1/2 sm:px-8'

/**
 * The class a route must put on the element that wraps **both** `RenderHero`
 * and the page's blocks, for a `fullBleed` hero to stack correctly.
 *
 * @remarks This is the hero's one contract with its route, and it is not
 * optional — `src/heros/presentation.test.ts` asserts the `[slug]` route
 * carries it.
 *
 * The canvas is `-z-10`, so where it lands depends entirely on which ancestor
 * owns the nearest stacking context:
 *
 * - *No stacking context anywhere* — `-z-10` resolves against the root, which
 *   paints the negative layer **below** the `fixed` white panel `Layout`
 *   draws. The canvas disappears behind the page background.
 * - *Stacking context on the hero's own `<header>`* (what shipped in #31 and
 *   what staging QA caught) — the canvas is correctly behind the hero text,
 *   but the whole isolated header then paints as one atomic unit in the
 *   positioned layer, i.e. **above** every following in-flow block. Any block
 *   inside the canvas's 36rem span is occluded. Measured in Chrome: an
 *   isolated ancestor paints as if it were `position: relative; z-index: 0`,
 *   which is after in-flow block backgrounds either way — so dropping
 *   `position: relative` from the header does *not* help.
 * - *Stacking context on an ancestor of hero **and** blocks* — the canvas
 *   sinks below every sibling in that container while the container as a whole
 *   still paints above the fixed panel. Correct on both counts.
 *
 * The homepage does exactly the third thing: its `<section className="isolate">`
 * wraps the canvas together with the content that must sit on top of it.
 */
export const HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS = 'isolate'

/**
 * Clip panel inside the full-bleed frame — the centered `max-w-7xl` panel
 * the Layout paints.
 *
 * @remarks Deliberately the same string as the homepage hero's default panel
 * (`SHADER_HERO_PANEL_CLASS`), asserted equal in `presentation.test.ts`.
 * It is repeated rather than imported because this module is pulled into the
 * Payload config, which must not reach into a `'use client'` component.
 */
export const HERO_FULL_BLEED_PANEL_CLASS =
  'mx-auto h-full w-full max-w-7xl lg:px-8'

/**
 * The card shell: the `shaderHero` block's own panel classes, minus its
 * `my-12` flow rhythm — a hero is the first thing on the page and the route
 * Container already supplies the space above it.
 */
export const HERO_CARD_SHELL_CLASS =
  'relative isolate min-h-[20rem] overflow-hidden rounded-2xl'

/** Positioning box of the card canvas: the whole card, behind its content. */
export const HERO_CARD_FRAME_CLASS =
  'pointer-events-none absolute inset-0 -z-10'

/** Clip panel inside the card frame — the card shell owns the rounding. */
export const HERO_CARD_PANEL_CLASS = 'h-full w-full'

/**
 * Default transition for a `carousel` hero, single-sourced from the carousel
 * block's own default ({@link DEFAULT_CAROUSEL_EFFECT}) so the hero and the
 * block agree on what "unset" means.
 */
export const DEFAULT_HERO_CAROUSEL_EFFECT: CarouselEffect =
  DEFAULT_CAROUSEL_EFFECT

/**
 * Postgres enum backing the `carousel` hero's `effect` select.
 *
 * @remarks Explicit and **hero-scoped**, distinct from the block's
 * `enum_carousel_effect` (see {@link CAROUSEL_EFFECT_ENUM_NAME}): the hero
 * carries its own `effect` column on `pages`/`_pages_v`, and one enum has to
 * serve both tables, so — like `enum_pages_hero_presentation` /
 * `enum_pages_hero_headline_variant` — it is named here rather than left to
 * Payload's per-table generator. 31 characters, inside the 63-char limit.
 */
export const HERO_CAROUSEL_EFFECT_ENUM_NAME = 'enum_pages_hero_carousel_effect'

/**
 * The horizontal full-bleed breakout for the `image` and `carousel` heroes —
 * the hero-owned frame that reaches the viewport edges.
 *
 * @remarks The same `left-1/2 w-screen -translate-x-1/2` idiom
 * `Container/section.ts` established (and the carousel block reuses), repeated
 * here rather than imported so this module — pulled into the Payload config —
 * stays free of the `'use client'` block leaf. Unlike the shader's
 * {@link HERO_FULL_BLEED_FRAME_CLASS}, this is a **positive-flow** breakout, not
 * a `-z-10` decoration pull: the carousel hero must stay interactive (its slides
 * drag, its arrows click), so it can't sit in the negative layer. The `w-screen`
 * breakout inherits the classic-scrollbar caveat the route layout's
 * `overflow-x: clip` absorbs (W1B4), the same arrangement the block relies on.
 */
export const HERO_MEDIA_FULL_BLEED_CLASS =
  'relative left-1/2 w-screen -translate-x-1/2'

/**
 * Legibility scrim over an overlaid-content hero (`image`, `carousel`) — the
 * same left-to-right wash the shader hero paints (`ShaderHero`'s `scrim`), so
 * the title stays readable over a busy photo in both themes. `pointer-events-none`
 * so it never intercepts a drag meant for the carousel beneath it.
 */
export const HERO_MEDIA_SCRIM_CLASS =
  'pointer-events-none absolute inset-0 bg-gradient-to-r from-white/60 via-white/20 to-transparent dark:from-zinc-900/70 dark:via-zinc-900/20 dark:to-transparent'

/**
 * The text-shadow the overlaid content stack wears when it sits directly on a
 * photo or a carousel — the same literal the shader card path uses, so every
 * on-media hero shares one legibility treatment.
 */
export const HERO_MEDIA_TEXT_SHADOW_CLASS =
  '[text-shadow:0_1px_8px_rgba(0,0,0,0.25)]'
