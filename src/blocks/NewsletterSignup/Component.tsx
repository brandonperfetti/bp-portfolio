import { CardChromeHeader } from '@/blocks/CardChromeHeader'
import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import { Newsletter } from '@/components/home/Newsletter'
import { cn } from '@/lib/utils'
import type { NewsletterSignupBlock } from '@/payload-types'

/**
 * Newsletter section (CMS page builder): the standard signup card, under an
 * optional heading + intro.
 *
 * @param props - The stored block (`heading` / `intro`, #40), plus `hosted`:
 * where the block is rendering. At root it keeps its reading measure; inside
 * a column it fills the width the editor picked, so a signup card in a tinted
 * panel covers the band instead of half of it.
 * @remarks With both chrome fields empty — every block stored before #40 —
 * `CardChromeHeader` renders nothing, so this is byte for byte the section
 * the block shipped before.
 */
export function NewsletterSignupComponent({
  heading,
  intro,
  hosted,
}: Partial<NewsletterSignupBlock> & { hosted?: BlockHostContext }) {
  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      <CardChromeHeader heading={heading} intro={intro} />
      <Newsletter />
    </section>
  )
}
