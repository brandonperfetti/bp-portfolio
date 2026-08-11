import { ColumnBlockComponent } from '@/blocks/Column/Component'
import { ContainerGrid } from '@/blocks/Container/ContainerGrid'
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
 */
export function ContainerBlockComponent(props: ContainerBlock) {
  const { columns, gap, section, verticalAlign } = props
  if (section?.hidden) return null
  if (!columns?.length) return null

  return (
    <ContainerGrid
      gap={gap}
      verticalAlign={verticalAlign}
      width={section?.width}
      paddingY={section?.paddingY}
      anchorId={section?.anchorId}
      background={section?.background}
    >
      {columns.map((column, index) => (
        <ColumnBlockComponent key={column.id ?? index} {...column} />
      ))}
    </ContainerGrid>
  )
}
