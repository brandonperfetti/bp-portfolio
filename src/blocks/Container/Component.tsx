import { ColumnBlockComponent } from '@/blocks/Column/Component'
import { ContainerGrid } from '@/blocks/Container/ContainerGrid'
import type { ContainerBlock } from '@/payload-types'

/**
 * Multi-column layout block (CMS page builder): resolves the stored columns
 * and renders them into the shared 12-column grid.
 *
 * @remarks An empty container renders nothing rather than an empty grid, so
 * a half-built section in the admin doesn't leave a gap on the page.
 */
export function ContainerBlockComponent(props: ContainerBlock) {
  const { columns } = props
  if (!columns?.length) return null

  return (
    <ContainerGrid>
      {columns.map((column, index) => (
        <ColumnBlockComponent key={column.id ?? index} {...column} />
      ))}
    </ContainerGrid>
  )
}
