import { ColumnShell } from '@/blocks/Column/ColumnShell'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { ColumnBlock } from '@/payload-types'

/**
 * One column of a Container grid (CMS page builder): resolves the stored
 * size and nested blocks, then hands plain props to {@link ColumnShell}.
 *
 * @remarks Dispatches its own content through `RenderBlocks`, which is what
 * makes the hierarchy recursive — and why this module and `RenderBlocks`
 * import each other. Both sides are hoisted function declarations used only
 * at render time, so the cycle resolves before anything is called.
 */
export function ColumnBlockComponent(props: ColumnBlock) {
  const { content, size, sticky } = props

  return (
    <ColumnShell size={size} sticky={sticky}>
      {/* `column` is what tells a leaf block it no longer owns the page
          width: it drops its own outer margin (the shell stacks the blocks
          instead) and fills the width the editor picked here. */}
      <RenderBlocks blocks={content} hosted="column" />
    </ColumnShell>
  )
}
