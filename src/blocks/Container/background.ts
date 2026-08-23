/**
 * The Container section's background vocabulary — flat tints and two-stop
 * gradients — plus the CSS-variable bridge that renders them.
 *
 * @remarks The mechanism is the point. A stored value never becomes part of a
 * class name; it selects a **CSS value** that the renderer writes into custom
 * properties on the section's `style` attribute, and a **static** utility
 * class reads those properties back out. Every class string in this file is a
 * complete literal Tailwind can scan, so the JIT compiles them whether or not
 * an editor ever picks the option.
 *
 * Light/dark parity comes from the same bridge: each option carries a light
 * value and a dark value, both written to the element, and the class pairs a
 * base utility with a `dark:` one. No `@media` query, no theme detection in
 * JS, and nothing to add to the stylesheet.
 *
 * The palette is deliberately narrow (MPD §6): a curated zinc set, no free
 * colour input, no background images.
 */

import type { CSSProperties } from 'react'

/**
 * Zinc steps as CSS values, each referencing the Tailwind theme token with
 * the token's own value as a fallback.
 *
 * @remarks The token reference is what makes a background part of the design
 * system rather than a copy of it. The fallback exists because these values
 * are consumed from a `style` attribute, which Tailwind's source scan never
 * sees: if no utility class in the app happens to use a given zinc step, the
 * theme variable is not emitted and a bare `var(--color-zinc-800)` would
 * resolve to nothing. `background.test.ts` asserts every fallback still equals
 * the value Tailwind ships for that step, so the two cannot drift apart
 * silently.
 */
export const SECTION_BACKGROUND_ZINC = {
  white: 'var(--color-white, #fff)',
  zinc100: 'var(--color-zinc-100, oklch(96.7% 0.001 286.375))',
  zinc200: 'var(--color-zinc-200, oklch(92% 0.004 286.32))',
  zinc800: 'var(--color-zinc-800, oklch(27.4% 0.006 286.033))',
  zinc900: 'var(--color-zinc-900, oklch(21% 0.006 285.885))',
  zinc950: 'var(--color-zinc-950, oklch(14.1% 0.005 285.823))',
  transparent: 'transparent',
} as const

/** Custom property carrying the light-theme background colour. */
export const SECTION_BACKGROUND_COLOR_VAR = '--section-bg-color'

/** Custom property carrying the dark-theme background colour. */
export const SECTION_BACKGROUND_COLOR_DARK_VAR = '--section-bg-color-dark'

/** Custom property carrying the light-theme background image (a gradient). */
export const SECTION_BACKGROUND_IMAGE_VAR = '--section-bg-image'

/** Custom property carrying the dark-theme background image (a gradient). */
export const SECTION_BACKGROUND_IMAGE_DARK_VAR = '--section-bg-image-dark'

/**
 * How a section is painted: not at all, a flat tint, or a two-stop gradient.
 *
 * @remarks Each entry's `className` is the static pair that reads the custom
 * properties the renderer writes — a colour utility for `tint`, an
 * `image:`-typed one for `gradient`, because the same property name cannot
 * feed both `background-color` and `background-image`.
 */
export const SECTION_BACKGROUND_STYLES = [
  {
    value: 'none',
    label: 'None (default)',
    className: '',
  },
  {
    value: 'tint',
    label: 'Tint (flat colour)',
    className:
      'bg-[var(--section-bg-color)] dark:bg-[var(--section-bg-color-dark)]',
  },
  {
    value: 'gradient',
    label: 'Gradient (two stops)',
    className:
      'bg-[image:var(--section-bg-image)] dark:bg-[image:var(--section-bg-image-dark)]',
  },
] as const

/** Background style vocabulary, derived from {@link SECTION_BACKGROUND_STYLES}. */
export type SectionBackgroundStyle =
  (typeof SECTION_BACKGROUND_STYLES)[number]['value']

/** Style a new section starts at — none, the behaviour every container had. */
export const DEFAULT_SECTION_BACKGROUND_STYLE: SectionBackgroundStyle = 'none'

/** Select options for the background group's `style` field. */
export const SECTION_BACKGROUND_STYLE_OPTIONS: {
  label: string
  value: SectionBackgroundStyle
}[] = SECTION_BACKGROUND_STYLES.map(({ label, value }) => ({ label, value }))

/** Background classes by style — the renderer's only class lookup. */
export const SECTION_BACKGROUND_STYLE_CLASSES = Object.fromEntries(
  SECTION_BACKGROUND_STYLES.map(({ className, value }) => [value, className]),
) as Record<SectionBackgroundStyle, string>

/**
 * The curated flat tints.
 *
 * @remarks Read them against the frontend's page background — `zinc-50` in
 * light, pure black in dark. In light a tint can sit either side of the page:
 * `subtle` and `muted` step down into the greys, `panel` steps up to white.
 * In dark there is nothing below black, so every tint lifts off the page
 * instead; `panel` lifts least, which keeps its "quiet surface" reading in
 * both themes. None of them approaches the body text colour, so foreground
 * contrast survives the switch — that is the reason no inverted option is
 * offered.
 */
export const SECTION_BACKGROUND_TINTS = [
  {
    value: 'subtle',
    label: 'Subtle',
    light: SECTION_BACKGROUND_ZINC.zinc100,
    dark: SECTION_BACKGROUND_ZINC.zinc900,
  },
  {
    value: 'muted',
    label: 'Muted (one step deeper)',
    light: SECTION_BACKGROUND_ZINC.zinc200,
    dark: SECTION_BACKGROUND_ZINC.zinc800,
  },
  {
    value: 'panel',
    label: 'Panel (a quiet raised surface)',
    light: SECTION_BACKGROUND_ZINC.white,
    dark: SECTION_BACKGROUND_ZINC.zinc950,
  },
] as const

/** Tint vocabulary, derived from {@link SECTION_BACKGROUND_TINTS}. */
export type SectionBackgroundTint =
  (typeof SECTION_BACKGROUND_TINTS)[number]['value']

/** Tint a section starts at once an editor chooses the tint style. */
export const DEFAULT_SECTION_BACKGROUND_TINT: SectionBackgroundTint = 'subtle'

/** Select options for the background group's `tint` field. */
export const SECTION_BACKGROUND_TINT_OPTIONS: {
  label: string
  value: SectionBackgroundTint
}[] = SECTION_BACKGROUND_TINTS.map(({ label, value }) => ({ label, value }))

/** Light/dark tint values by name — the renderer's only tint lookup. */
export const SECTION_BACKGROUND_TINT_VALUES = Object.fromEntries(
  SECTION_BACKGROUND_TINTS.map(({ dark, light, value }) => [
    value,
    { light, dark },
  ]),
) as Record<SectionBackgroundTint, { light: string; dark: string }>

/**
 * The curated two-stop gradients.
 *
 * @remarks Two stops only, both from the zinc set, so a gradient reads as
 * depth rather than decoration. `fade` ends at `transparent`, which lets the
 * page background finish the ramp and makes it the safe choice for a section
 * that sits between two untinted ones.
 */
export const SECTION_BACKGROUND_GRADIENTS = [
  {
    value: 'fade',
    label: 'Fade (into the page)',
    light: {
      from: SECTION_BACKGROUND_ZINC.zinc100,
      to: SECTION_BACKGROUND_ZINC.transparent,
    },
    dark: {
      from: SECTION_BACKGROUND_ZINC.zinc900,
      to: SECTION_BACKGROUND_ZINC.transparent,
    },
  },
  {
    value: 'depth',
    label: 'Depth (soft zinc ramp)',
    light: {
      from: SECTION_BACKGROUND_ZINC.zinc100,
      to: SECTION_BACKGROUND_ZINC.zinc200,
    },
    dark: {
      from: SECTION_BACKGROUND_ZINC.zinc900,
      to: SECTION_BACKGROUND_ZINC.zinc800,
    },
  },
  {
    value: 'panel',
    label: 'Panel (surface to shadow)',
    light: {
      from: SECTION_BACKGROUND_ZINC.white,
      to: SECTION_BACKGROUND_ZINC.zinc200,
    },
    dark: {
      from: SECTION_BACKGROUND_ZINC.zinc950,
      to: SECTION_BACKGROUND_ZINC.zinc800,
    },
  },
] as const

/** Gradient vocabulary, derived from {@link SECTION_BACKGROUND_GRADIENTS}. */
export type SectionBackgroundGradient =
  (typeof SECTION_BACKGROUND_GRADIENTS)[number]['value']

/** Gradient a section starts at once an editor chooses the gradient style. */
export const DEFAULT_SECTION_BACKGROUND_GRADIENT: SectionBackgroundGradient =
  'fade'

/** Select options for the background group's `gradient` field. */
export const SECTION_BACKGROUND_GRADIENT_OPTIONS: {
  label: string
  value: SectionBackgroundGradient
}[] = SECTION_BACKGROUND_GRADIENTS.map(({ label, value }) => ({ label, value }))

/** Light/dark gradient stops by name — the renderer's only gradient lookup. */
export const SECTION_BACKGROUND_GRADIENT_STOPS = Object.fromEntries(
  SECTION_BACKGROUND_GRADIENTS.map(({ dark, light, value }) => [
    value,
    { light, dark },
  ]),
) as Record<
  SectionBackgroundGradient,
  { light: { from: string; to: string }; dark: { from: string; to: string } }
>

/**
 * Directions a gradient may run in.
 *
 * @remarks `to top` is not redundant with `to bottom`: it is how an editor
 * reverses a ramp without the palette needing a mirrored copy of every
 * gradient.
 */
export const SECTION_BACKGROUND_DIRECTIONS = [
  {
    value: 'toBottom',
    label: 'Downwards',
    css: 'to bottom',
  },
  {
    value: 'toTop',
    label: 'Upwards',
    css: 'to top',
  },
  {
    value: 'toRight',
    label: 'Rightwards',
    css: 'to right',
  },
] as const

/** Direction vocabulary, derived from {@link SECTION_BACKGROUND_DIRECTIONS}. */
export type SectionBackgroundDirection =
  (typeof SECTION_BACKGROUND_DIRECTIONS)[number]['value']

/** Direction a gradient starts at — downwards, the conventional reading. */
export const DEFAULT_SECTION_BACKGROUND_DIRECTION: SectionBackgroundDirection =
  'toBottom'

/** Select options for the background group's `direction` field. */
export const SECTION_BACKGROUND_DIRECTION_OPTIONS: {
  label: string
  value: SectionBackgroundDirection
}[] = SECTION_BACKGROUND_DIRECTIONS.map(({ label, value }) => ({
  label,
  value,
}))

/** Gradient direction CSS by name — the renderer's only direction lookup. */
export const SECTION_BACKGROUND_DIRECTION_CSS = Object.fromEntries(
  SECTION_BACKGROUND_DIRECTIONS.map(({ css, value }) => [value, css]),
) as Record<SectionBackgroundDirection, string>

/**
 * The stored background group, as permissively as CMS data can arrive.
 *
 * @remarks Everything is nullable and typed `string`, not a union: stored data
 * can predate an option, outlive one, or come from a draft written by an older
 * deployment. Each lookup falls back rather than throwing.
 */
export type SectionBackgroundValue = {
  style?: string | null
  tint?: string | null
  gradient?: string | null
  direction?: string | null
} | null

/**
 * Resolve a stored style value to one this module can render.
 *
 * @param style - Stored style value, if any.
 * @returns A known style, falling back to `none` so an unrecognised value
 * paints nothing rather than painting something arbitrary.
 */
function resolveStyle(
  style: string | null | undefined,
): SectionBackgroundStyle {
  return style === 'tint' || style === 'gradient'
    ? style
    : DEFAULT_SECTION_BACKGROUND_STYLE
}

/**
 * Static utility classes for a stored background.
 *
 * @param background - The stored background group, if any.
 * @returns One of the three literal class strings — never a constructed one.
 */
export function sectionBackgroundClass(
  background: SectionBackgroundValue | undefined,
): string {
  return SECTION_BACKGROUND_STYLE_CLASSES[resolveStyle(background?.style)]
}

/**
 * The custom properties a stored background needs on the section element.
 *
 * @param background - The stored background group, if any.
 * @returns A `style` object carrying the light and dark values the utility
 * classes read, or `undefined` when the section has no background — so React
 * omits the attribute entirely rather than writing an empty one.
 * @remarks Only the pair the chosen style actually consumes is written, which
 * is what keeps a stale tint from surfacing under a gradient.
 */
export function sectionBackgroundStyle(
  background: SectionBackgroundValue | undefined,
): CSSProperties | undefined {
  const style = resolveStyle(background?.style)
  if (style === 'none') return undefined

  if (style === 'tint') {
    const tint =
      SECTION_BACKGROUND_TINT_VALUES[
        background?.tint as SectionBackgroundTint
      ] ?? SECTION_BACKGROUND_TINT_VALUES[DEFAULT_SECTION_BACKGROUND_TINT]

    return {
      [SECTION_BACKGROUND_COLOR_VAR]: tint.light,
      [SECTION_BACKGROUND_COLOR_DARK_VAR]: tint.dark,
    } as CSSProperties
  }

  const stops =
    SECTION_BACKGROUND_GRADIENT_STOPS[
      background?.gradient as SectionBackgroundGradient
    ] ?? SECTION_BACKGROUND_GRADIENT_STOPS[DEFAULT_SECTION_BACKGROUND_GRADIENT]
  const direction =
    SECTION_BACKGROUND_DIRECTION_CSS[
      background?.direction as SectionBackgroundDirection
    ] ?? SECTION_BACKGROUND_DIRECTION_CSS[DEFAULT_SECTION_BACKGROUND_DIRECTION]

  return {
    [SECTION_BACKGROUND_IMAGE_VAR]: linearGradient(direction, stops.light),
    [SECTION_BACKGROUND_IMAGE_DARK_VAR]: linearGradient(direction, stops.dark),
  } as CSSProperties
}

/**
 * Compose a two-stop `linear-gradient()` from curated parts.
 *
 * @param direction - A CSS gradient line, from {@link SECTION_BACKGROUND_DIRECTION_CSS}.
 * @param stops - The `from`/`to` colours, from {@link SECTION_BACKGROUND_GRADIENT_STOPS}.
 * @returns The CSS value written to the background-image custom property.
 * @remarks This builds a CSS *value*, never a class name — the distinction the
 * whole bridge exists for. Every part is a literal from a curated map, so the
 * set of strings this can produce is finite and enumerable in tests.
 */
function linearGradient(
  direction: string,
  stops: { from: string; to: string },
): string {
  return `linear-gradient(${direction}, ${stops.from}, ${stops.to})`
}
