/**
 * The hero *content* stack — headline, subtitle, social row — as vocabulary
 * and class strings shared between the Payload config, `HeroView` and the
 * hard-coded homepage.
 *
 * @remarks Split from `presentation.ts` on purpose: that module is about what
 * runs *behind* a hero (the shader canvas and its geometry), this one about
 * what a reader actually reads. Both are pulled into the Payload config, so
 * neither may import a `'use client'` module — the class strings below are
 * therefore repeated rather than imported from the components that also use
 * them, and `content.test.ts` asserts each one still matches the homepage
 * source it was lifted from.
 *
 * Classes are complete literal strings so Tailwind's source scan finds them;
 * never interpolate a stored value into a class name.
 */

/**
 * How the hero headline animates in.
 *
 * - `line` — words rise and fade in a stagger. The site's default for
 *   ordinary pages, and what every hero rendered before this field existed.
 * - `typewriter` — characters reveal one at a time with a blinking caret.
 *   The homepage and About treatment; the reason this field exists at all is
 *   that `RenderHero` used to hard-code `line`, so a CMS page could never
 *   reproduce it.
 *
 * Both are variants of {@link AnimatedHeadline}, which renders static text
 * for `prefers-reduced-motion` either way — so this field chooses an
 * animation, never whether the headline is readable.
 */
export const HERO_HEADLINE_VARIANTS = [
  { value: 'line', label: 'Line (staggered words)' },
  { value: 'typewriter', label: 'Typewriter (character reveal)' },
] as const

/** Headline animation of a hero, derived from {@link HERO_HEADLINE_VARIANTS}. */
export type HeroHeadlineVariant =
  (typeof HERO_HEADLINE_VARIANTS)[number]['value']

/**
 * What a headline animates as when the editor hasn't chosen.
 *
 * @remarks `line` because that is the literal `RenderHero` hard-coded before
 * the field existed: every page already in the database keeps the headline it
 * has today, and only a deliberate edit changes it.
 */
export const DEFAULT_HERO_HEADLINE_VARIANT: HeroHeadlineVariant = 'line'

/** Select options for the hero group's `headlineVariant` field. */
export const HERO_HEADLINE_VARIANT_OPTIONS: {
  label: string
  value: HeroHeadlineVariant
}[] = HERO_HEADLINE_VARIANTS.map(({ label, value }) => ({ label, value }))

/**
 * Postgres enum backing the `headlineVariant` select.
 *
 * @remarks Explicit for the reason `enum_pages_hero_presentation` is: Payload
 * would otherwise mint a different name per table and one enum has to serve
 * both `pages` and `_pages_v`. 32 characters, well inside the 63-character
 * identifier limit.
 */
export const HERO_HEADLINE_VARIANT_ENUM_NAME =
  'enum_pages_hero_headline_variant'

/**
 * Headline variant for a stored value, tolerating `string | null | undefined`.
 *
 * @param value - Stored variant, if any.
 * @returns A known variant, falling back to the default so a page written
 * before this field existed — or carrying a value from a vocabulary this
 * build doesn't know — still renders its headline.
 */
export function heroHeadlineVariant(
  value: string | null | undefined,
): HeroHeadlineVariant {
  return HERO_HEADLINE_VARIANTS.some((option) => option.value === value)
    ? (value as HeroHeadlineVariant)
    : DEFAULT_HERO_HEADLINE_VARIANT
}

/**
 * Headline type scale — lifted verbatim from the homepage hero so a migrated
 * Home renders the same H1 it does today.
 */
export const HERO_HEADLINE_CLASS =
  'text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100'

/**
 * The intro line under the headline, from the same homepage source.
 *
 * @remarks It renders the Pages doc's own top-level `subtitle` field. The
 * hero group deliberately has **no** subtitle of its own: `subtitle` already
 * exists on `Pages` ("Page intro line under the headline"), the homepage
 * already reads it (`homePage?.subtitle`), and `generateMetadata` already
 * falls back to it for the meta description. A second field would give one
 * paragraph two competing sources.
 */
export const HERO_SUBTITLE_CLASS =
  'mt-6 text-base text-zinc-600 dark:text-zinc-400'

/**
 * Space above the social icon row.
 *
 * @remarks The row itself is the `socialLinks` block's `iconRow` view, which
 * carries no margin of its own when it is told the host owns the rhythm — so
 * this one class is the whole gap, and it is the homepage's `mt-6`.
 */
export const HERO_SOCIAL_ROW_SPACING_CLASS = 'mt-6'

/**
 * The homepage's `ScrollReveal` params for the hero subtitle and social row,
 * lifted from the route's two wrappers verbatim:
 *
 * - subtitle — `<ScrollReveal y={14} duration={0.78} delay={0.26}>`
 * - social row — `<ScrollReveal y={10} duration={0.68} delay={0.37}>`
 *
 * @remarks Fixed capability, not editor-tunable — the numbers are Home's.
 * `content.test.ts` reads them back out of the homepage source so a change on
 * either side fails loudly. Plain numbers, so no Tailwind-scan concern; the
 * `ScrollReveal` import stays out of this module (it is pulled into the
 * Payload config, which may not import a `'use client'` module) and lives in
 * `HeroView` instead.
 */
export const HERO_SUBTITLE_REVEAL = {
  y: 14,
  duration: 0.78,
  delay: 0.26,
} as const

/** Homepage `ScrollReveal` params for the hero social row (see {@link HERO_SUBTITLE_REVEAL}). */
export const HERO_SOCIAL_REVEAL = {
  y: 10,
  duration: 0.68,
  delay: 0.37,
} as const
