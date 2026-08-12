import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import { Newsletter } from '@/components/home/Newsletter'
import { cn } from '@/lib/utils'

/**
 * Newsletter section (CMS page builder): the standard signup card.
 *
 * @param hosted - Where the block is rendering. At root it keeps its reading
 * measure; inside a column it fills the width the editor picked, so a signup
 * card in a tinted panel covers the band instead of half of it.
 */
export function NewsletterSignupComponent({
  hosted,
}: {
  hosted?: BlockHostContext
}) {
  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      <Newsletter />
    </section>
  )
}
