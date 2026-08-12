/**
 * How a shader hero presents itself on a CMS-built page — the vocabulary the
 * Payload select and `RenderHero` share, plus the geometry that lets the
 * full-bleed variant escape the route's `<Container>`.
 *
 * @remarks Classes are complete literal strings so Tailwind's source scan
 * finds them; never interpolate a stored value into a class name (the rule
 * `src/blocks/Container/section.ts` established).
 */

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
