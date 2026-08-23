import { CardChromeHeader } from '@/blocks/CardChromeHeader'
import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import { Messenger } from '@/components/home/Messenger'
import { cn } from '@/lib/utils'
import type { ContactFormBlock } from '@/payload-types'

/**
 * Contact-form section (CMS page builder): the standard site form, under an
 * optional heading + intro.
 *
 * @param props - The stored block (`heading` / `intro`, #40), plus `hosted`:
 * where the block is rendering. At root it keeps its reading measure; inside
 * a column it fills the width the editor picked, instead of hugging the left
 * of a wide column and stranding the rest of the band.
 * @remarks With both chrome fields empty — every block stored before #40 —
 * `CardChromeHeader` renders nothing, so this is byte for byte the section
 * the block shipped before.
 */
export function ContactFormComponent({
  heading,
  intro,
  hosted,
}: Partial<ContactFormBlock> & { hosted?: BlockHostContext }) {
  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      <CardChromeHeader heading={heading} intro={intro} />
      <Messenger />
    </section>
  )
}
