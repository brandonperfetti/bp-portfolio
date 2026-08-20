import { type BlockHostContext } from '@/blocks/hostContext'
import { LeadView } from '@/blocks/Lead/LeadView'
import type { LeadBlock } from '@/payload-types'

/**
 * Lead paragraph (CMS page builder): resolves the stored block to
 * {@link LeadView}'s plain props.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks Thin by design. `hosted` is accepted for a uniform dispatcher
 * signature but ignored: a lead lays out identically in either context — its
 * spacing is its own `mt-6` (the about page's gap under the headline), not the
 * host-dependent block rhythm the width-owning leaf blocks switch on
 * (`hostContext.ts`), so it carries no context margin to drop. `LeadView`
 * emits no margin utility that a column's stack spacing would have to undo.
 */
export function LeadBlockComponent(
  props: LeadBlock & { hosted?: BlockHostContext },
) {
  return <LeadView text={props.text} reveal={Boolean(props.reveal)} />
}
