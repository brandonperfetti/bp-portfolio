import { CardChromeHeader } from '@/blocks/CardChromeHeader'
import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import { Resume } from '@/components/home/Resume'
import { cn } from '@/lib/utils'
import type { WorkHistoryCardBlock } from '@/payload-types'

/**
 * Work-history section (CMS page builder): the home Work card, backed by
 * the work-history collection, under an optional heading + intro. Server
 * component.
 *
 * @param props - The stored block (`heading` / `intro`, #40), plus `hosted`:
 * where the block is rendering. At root it keeps its reading measure; inside
 * a column it fills the width the editor picked, rather than leaving the
 * right half of a full-width column empty.
 * @remarks With both chrome fields empty — every block stored before #40 —
 * `CardChromeHeader` renders nothing, so this is byte for byte the section
 * the block shipped before.
 */
export function WorkHistoryCardComponent({
  heading,
  intro,
  hosted,
}: Partial<WorkHistoryCardBlock> & { hosted?: BlockHostContext }) {
  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      <CardChromeHeader heading={heading} intro={intro} />
      <Resume />
    </section>
  )
}
