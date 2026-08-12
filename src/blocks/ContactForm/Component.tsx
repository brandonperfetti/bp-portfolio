import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import { Messenger } from '@/components/home/Messenger'
import { cn } from '@/lib/utils'

/**
 * Contact-form section (CMS page builder): the standard site form.
 *
 * @param hosted - Where the block is rendering. At root it keeps its reading
 * measure; inside a column it fills the width the editor picked, instead of
 * hugging the left of a wide column and stranding the rest of the band.
 */
export function ContactFormComponent({
  hosted,
}: {
  hosted?: BlockHostContext
}) {
  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      <Messenger />
    </section>
  )
}
