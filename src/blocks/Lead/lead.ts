/**
 * The lead-paragraph vocabulary — the one plain lead paragraph the about page
 * sets under its H1, as class strings and reveal params shared between the
 * presentational view and the tests, in the shape `heros/content.ts` and
 * `Column/reveal.ts` established.
 *
 * @remarks A "lead" is *not* prose typography: the about page's subtitle is a
 * single `text-base text-zinc-600 dark:text-zinc-400` paragraph, styled by
 * hand rather than by the article-body pipeline the `prose` block renders
 * through. No column-hostable block reproduced that today (the `prose` block
 * is article typography; the `heading` block is headings), which is why this
 * block exists — so the about page's headline (`heading`), lead (`lead`) and
 * body (`prose`) can all be composed inside the left column.
 *
 * Classes are complete literal strings so Tailwind's source scan finds them;
 * never interpolate a stored value into a class name. `lead.test.ts` reads the
 * class and the reveal params back out of the hand-built `about/page.tsx`, so
 * neither side can drift from the treatment this block reproduces.
 */

/**
 * The lead paragraph's own classes — lifted verbatim from the about page's
 * subtitle wrapper.
 *
 * @remarks Carries `mt-6` (its gap under the headline) and `space-y-7` (the
 * gap between paragraphs, inert for the single paragraph the about page sets
 * but reproduced exactly), plus the `text-base` zinc treatment. The `mt-6` is
 * the lead's own spacing rather than the generic block rhythm precisely
 * because the block's reason to exist is that specific lead-under-headline
 * placement; it deliberately does not take the `my-12`/column rhythm the
 * width-owning leaf blocks do (`hostContext.ts`).
 */
export const LEAD_CLASS =
  'mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400'

/**
 * The about page's `ScrollReveal` params for its lead paragraph, lifted from
 * the route wrapper verbatim — `y` 14, `duration` 0.72, `delay` 0.24.
 *
 * @remarks Fixed capability, not editor-tunable — the numbers are the about
 * page's, the way `HERO_SUBTITLE_REVEAL` pins Home's. Opt-in and off by
 * default, so a lead written without the toggle emits no `ScrollReveal` at all
 * and renders exactly the bare paragraph it would have. Plain numbers, so no
 * Tailwind-scan concern; the `ScrollReveal` import stays out of this module
 * (it is not a `'use client'` module and is safe to reach from the Payload
 * config) and lives in `LeadView` instead.
 */
export const LEAD_REVEAL = {
  y: 14,
  duration: 0.72,
  delay: 0.24,
} as const
