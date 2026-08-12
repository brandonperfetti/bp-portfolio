import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import { Resume } from '@/components/home/Resume'
import { cn } from '@/lib/utils'

/**
 * Work-history section (CMS page builder): the home Work card, backed by
 * the work-history collection. Server component.
 *
 * @param hosted - Where the block is rendering. At root it keeps its reading
 * measure; inside a column it fills the width the editor picked, rather than
 * leaving the right half of a full-width column empty.
 */
export function WorkHistoryCardComponent({
  hosted,
}: {
  hosted?: BlockHostContext
}) {
  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      <Resume />
    </section>
  )
}
