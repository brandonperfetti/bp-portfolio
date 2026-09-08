import { ColumnBlockComponent } from '@/blocks/Column/Component'
import { ContainerGrid } from '@/blocks/Container/ContainerGrid'
import type { BlockHostDocument } from '@/blocks/hostContext'
import type { ContainerBlock } from '@/payload-types'

/**
 * Multi-column layout block (CMS page builder): resolves the stored columns
 * and section settings and renders them into the shared 12-column grid.
 *
 * @remarks A hidden section returns `null` before anything else runs, so its
 * content never reaches the browser — the editor's "hide" is a real removal,
 * not `display: none`. An empty container likewise renders nothing rather
 * than an empty grid, so a half-built section in the admin doesn't leave a
 * gap on the page.
 *
 * @remarks This block lays nothing out for itself beyond the grid, and it
 * reads `hostDoc` for nothing at all — it only forwards it. That forwarding is
 * not optional: `RenderBlocks` → `container` → `column` → `RenderBlocks` is
 * the *only* path a nested block has, so a fact the dispatcher cannot hand
 * through here is a fact a column-nested block can never learn. Dropping it
 * would make a column-nested post rollup behave differently from a
 * root-level one, which is precisely the split #177 exists to avoid.
 *
 * @param props - The stored container block, plus `hostDoc`: the document
 * these columns were composed on ({@link BlockHostDocument}), passed straight
 * to each column.
 */
export function ContainerBlockComponent(
  props: ContainerBlock & { hostDoc?: BlockHostDocument },
) {
  const { columns, gap, section, verticalAlign } = props
  if (section?.hidden) return null
  if (!columns?.length) return null

  return (
    <ContainerGrid
      gap={gap}
      verticalAlign={verticalAlign}
      width={section?.width}
      paddingY={section?.paddingY}
      rhythm={section?.rhythm}
      anchorId={section?.anchorId}
      background={section?.background}
    >
      {columns.map((column, index) => (
        <ColumnBlockComponent
          key={column.id ?? index}
          {...column}
          hostDoc={props.hostDoc}
        />
      ))}
    </ContainerGrid>
  )
}
