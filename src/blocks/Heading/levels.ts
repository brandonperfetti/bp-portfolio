/**
 * Heading vocabulary for the `heading` block: the semantic levels an editor
 * may choose and the class string the site already dresses each one in.
 *
 * @remarks Complete literal strings so Tailwind's source scan finds them;
 * never build one by interpolating a value. `levels.test.ts` reads the h1 and
 * h2 strings back out of the components that own them, so a site-wide type
 * change can't leave this block behind.
 */

/** Semantic levels the block offers. Deeper levels belong inside prose. */
export type HeadingBlockLevel = 'h1' | 'h2' | 'h3'

/** How a heading animates in — the two variants `AnimatedHeadline` has. */
export type HeadingBlockVariant = 'line' | 'typewriter'

/**
 * The site's heading styles, by level.
 *
 * - `h1` is the page title every route renders (`SimpleLayout`,
 *   `ArticleHeader`, the home and about heroes) — one string, four places.
 * - `h2` is the section heading the block library already shares
 *   (`articlesArchive`, `featureCardGrid`, `faqList`, `testimonials`).
 * - `h3` has no single owner to copy: the one literal `h3` on the site (the
 *   about page's fallback body) writes `text-xl … sm:text-3xl`, which ties
 *   h3 with h2 at `sm` and overtakes it — a slip in a hand-built fallback,
 *   not a scale worth reproducing. It steps down from h2 instead.
 */
export const HEADING_LEVEL_CLASSES: Record<HeadingBlockLevel, string> = {
  h1: 'text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100',
  h2: 'text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100',
  h3: 'text-xl font-bold tracking-tight text-zinc-800 sm:text-2xl dark:text-zinc-100',
}

/**
 * Default level: `h2`. A page-builder block lands inside a page that already
 * has an `h1` (the hero title), so section heading is the safe default —
 * the editor opts into `h1` for the pages that need one, e.g. an about page
 * whose typewriter title sits outside any hero.
 */
export const DEFAULT_HEADING_LEVEL: HeadingBlockLevel = 'h2'

/** Default animation: `line`, the site's quieter of the two. */
export const DEFAULT_HEADING_VARIANT: HeadingBlockVariant = 'line'

/** Admin options for the level select. */
export const HEADING_LEVEL_OPTIONS = [
  { label: 'Heading 1 (page title)', value: 'h1' },
  { label: 'Heading 2 (section)', value: 'h2' },
  { label: 'Heading 3 (sub-section)', value: 'h3' },
] as const

/** Admin options for the animation select. */
export const HEADING_VARIANT_OPTIONS = [
  { label: 'Line — words rise into place', value: 'line' },
  { label: 'Typewriter — characters, then a caret', value: 'typewriter' },
] as const
