import { ColumnShell } from '@/blocks/Column/ColumnShell'
import {
  columnRevealParams,
  COLUMN_REVEAL_TARGET_ATTR,
} from '@/blocks/Column/reveal'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { ColumnBlock } from '@/payload-types'

/**
 * One column of a Container grid (CMS page builder): resolves the stored
 * size, inset and nested blocks, then hands plain props to {@link ColumnShell}.
 *
 * @remarks Dispatches its own content through `RenderBlocks`, which is what
 * makes the hierarchy recursive — and why this module and `RenderBlocks`
 * import each other. Both sides are hoisted function declarations used only
 * at render time, so the cycle resolves before anything is called.
 *
 * When `revealChildren` is on, each block is dispatched on its own and
 * wrapped in a `data-reveal-item` element so the column's `ScrollReveal`
 * (targets `[data-reveal-item]`) can stagger them — the homepage rail
 * treatment. Off (the default), the blocks are dispatched as one batch with
 * no wrapper, byte-identical to before this control existed.
 */
export function ColumnBlockComponent(props: ColumnBlock) {
  const { content, contentInset, revealChildren, size, sticky } = props
  const reveal = columnRevealParams(revealChildren)

  return (
    <ColumnShell
      size={size}
      sticky={sticky}
      inset={contentInset}
      reveal={reveal}
    >
      {/* `column` is what tells a leaf block it no longer owns the page
          width: it drops its own outer margin (the shell stacks the blocks
          instead) and fills the width the editor picked here. */}
      {reveal ? (
        (content ?? []).map((block, index) => (
          <div key={block.id ?? index} {...{ [COLUMN_REVEAL_TARGET_ATTR]: '' }}>
            <RenderBlocks blocks={[block]} hosted="column" />
          </div>
        ))
      ) : (
        <RenderBlocks blocks={content} hosted="column" />
      )}
    </ColumnShell>
  )
}
