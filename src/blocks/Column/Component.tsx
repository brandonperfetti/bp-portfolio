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
  const { content, size } = props

  return (
    <ColumnShell size={size}>
      <RenderBlocks blocks={content} />
    </ColumnShell>
  )
}
