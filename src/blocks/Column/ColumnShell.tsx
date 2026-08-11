import type { ReactNode } from 'react'

import { columnSizeClass } from '@/blocks/Column/sizes'
import { stickyColumnClass } from '@/blocks/Column/sticky'
import { cn } from '@/lib/utils'

/**
 * Presentational shell for one column of a Container grid: takes a width
 * from the shared size vocabulary, an optional desktop sticky behaviour, and
 * stacks its children.
 *
 * @param size - Stored column size; anything unrecognised falls back to
 * full width so a stale value renders readably instead of collapsing.
 * @param sticky - Follow the scroll from `lg` up (see `sticky.ts`). Also
 * pins the column to the top of its row, overriding the container's vertical
 * alignment for this column — a stretched column has nothing to stick in.
 * @param children - Rendered block content for this column.
 * @param className - Extra classes for the column element.
 * @remarks Plain props, no CMS types — the block Component resolves data
 * and hands it here, and the stories drive this layer directly.
 */
export function ColumnShell({
  size,
  sticky,
  children,
  className,
}: {
  size?: string | null
  sticky?: boolean | null
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        columnSizeClass(size),
        stickyColumnClass(sticky),
        className,
      )}
    >
      {children}
    </div>
  )
}
