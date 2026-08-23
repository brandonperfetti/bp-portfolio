/**
 * The optional heading + intro the three zero-config cards gained in #40 —
 * the Payload fields, the classes that render them, and the emptiness test
 * that keeps "no chrome" byte-identical to what those blocks shipped before.
 *
 * One source for `ContactForm`, `NewsletterSignup` and `WorkHistoryCard`
 * (config *and* renderer), in the shape `hostContext.ts` established: three
 * blocks with literally the same chrome should not carry three copies of it.
 *
 * @remarks Deliberately plain text + textarea rather than rich text. The
 * three blocks need a section heading and one line under it, which is
 * exactly the `featureCardGrid` pair (`heading: text` + `intro: textarea`)
 * this repo already ships and styles; an editor who needs real prose above a
 * card has the `prose` block for it. It is also the smaller change on every
 * axis that matters here — two nullable text columns per block table instead
 * of a Lexical JSON column, no editor feature set to register (which is what
 * reordered the generated import map and broke CI last round), and no second
 * typography scale competing with the card's own headings.
 *
 * Classes are complete literal strings so Tailwind's source scan finds them.
 */
import type { Field } from 'payload'

/**
 * Section heading above a card — the site's block heading treatment,
 * character for character what `articlesArchive`, `faqList` and
 * `featureCardGrid` render (`cardChrome.test.ts` reads it back out of
 * `ArticlesArchiveView.tsx` so the four cannot drift apart).
 */
export const CARD_CHROME_HEADING_CLASS =
  'text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100'

/** Intro line under the heading: muted body text, capped to a reading measure. */
export const CARD_CHROME_INTRO_CLASS =
  'max-w-2xl text-base text-zinc-600 dark:text-zinc-400'

/** Gap between the heading and the intro, when both are set. */
export const CARD_CHROME_INTRO_SPACING_CLASS = 'mt-3'

/**
 * Gap between the chrome and the card below it.
 *
 * @remarks On the chrome rather than on the card, so a card with no chrome
 * has nothing extra on it at all — the #40 "no visual change to root-level
 * rendering" clause is an emptiness guarantee about the *card*, and the
 * cheapest way to keep it is to not touch the card. Same 32px the other
 * heading-bearing blocks put between a heading and their content, in both
 * host contexts (it is a margin inside the block, so the column's
 * `space-y-*` never sees it).
 */
export const CARD_CHROME_SPACING_CLASS = 'mb-8'

/** The stored chrome of one of the three zero-config cards. */
export interface CardChrome {
  heading?: string | null
  intro?: string | null
}

/**
 * Whether a block stored any chrome at all.
 *
 * @param chrome - The block's `heading` / `intro` values, as stored.
 * @returns `true` when either field has non-blank content. Whitespace counts
 * as empty: a heading of `' '` would otherwise render an empty `<h2>` and
 * 32px of air above the card, which is the "no visual change" clause
 * breaking on a stray keystroke.
 */
export function hasCardChrome({ heading, intro }: CardChrome): boolean {
  return Boolean(heading?.trim() || intro?.trim())
}

/**
 * The `heading` + `intro` field pair for a zero-config card block.
 *
 * @returns Fresh field objects on every call, so Payload's config
 * sanitization cannot leak state between the three blocks that use them
 * (the reason `fields/link.ts` is a factory too).
 * @remarks Both optional and nullable — the migration is additive and every
 * stored block predates them. No `admin.condition`: they are always
 * available, and an empty pair renders nothing.
 */
export function cardChromeFields(): Field[] {
  return [
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Optional section heading rendered above the card.',
      },
    },
    {
      name: 'intro',
      type: 'textarea',
      admin: {
        description: 'Optional intro line under the heading.',
      },
    },
  ]
}
