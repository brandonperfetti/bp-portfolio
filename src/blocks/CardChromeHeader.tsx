import {
  CARD_CHROME_HEADING_CLASS,
  CARD_CHROME_INTRO_CLASS,
  CARD_CHROME_INTRO_SPACING_CLASS,
  CARD_CHROME_SPACING_CLASS,
  type CardChrome,
  hasCardChrome,
} from '@/blocks/cardChrome'
import { cn } from '@/lib/utils'

/**
 * Optional heading + intro above one of the three zero-config cards (#40).
 *
 * @param heading - Stored heading, if any.
 * @param intro - Stored intro line, if any.
 * @returns `null` when neither field has content — which is what makes a
 * card with no chrome render exactly the DOM it rendered before #40, in both
 * host contexts. Not an empty `<header>`, not a wrapper: nothing.
 *
 * @remarks Rendered inside the block's own `<section>`, so at layout root it
 * inherits the card's `max-w-xl` measure and lines up with the card's left
 * edge, and inside a column it spans whatever width the editor picked —
 * the same rule `zeroConfigCardWidthClass` applies to the card itself.
 */
export function CardChromeHeader({ heading, intro }: CardChrome) {
  if (!hasCardChrome({ heading, intro })) return null

  return (
    <header className={CARD_CHROME_SPACING_CLASS}>
      {heading?.trim() ? (
        <h2 className={CARD_CHROME_HEADING_CLASS}>{heading}</h2>
      ) : null}
      {intro?.trim() ? (
        <p
          className={cn(
            heading?.trim() && CARD_CHROME_INTRO_SPACING_CLASS,
            CARD_CHROME_INTRO_CLASS,
          )}
        >
          {intro}
        </p>
      ) : null}
    </header>
  )
}
