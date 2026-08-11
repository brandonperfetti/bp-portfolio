import type { ReactNode } from 'react'

import { columnSizeClass } from '@/blocks/Column/sizes'
import { cn } from '@/lib/utils'

/**
 * Presentational shell for one column of a Container grid: takes a width
 * from the shared size vocabulary and stacks its children.
 *
 * @param size - Stored column size; anything unrecognised falls back to
 * full width so a stale value renders readably instead of collapsing.
 * @param children - Rendered block content for this column.
 * @param className - Extra classes for the column element.
 * @remarks Plain props, no CMS types — the block Component resolves data
 * and hands it here, and the stories drive this layer directly.
 */
export function ColumnShell({
  size,
  children,
  className,
}: {
  size?: string | null
  children?: ReactNode
  className?: string
}) {
  return <div className={cn(columnSizeClass(size), className)}>{children}</div>
}
