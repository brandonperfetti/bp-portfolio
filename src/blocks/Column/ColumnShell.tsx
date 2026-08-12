import type { ReactNode } from 'react'

import { columnInsetClass } from '@/blocks/Column/inset'
import { type ColumnRevealParams } from '@/blocks/Column/reveal'
import { columnSizeClass } from '@/blocks/Column/sizes'
import { stickyColumnClass } from '@/blocks/Column/sticky'
import { COLUMN_STACK_SPACING_CLASS } from '@/blocks/hostContext'
import { visibilityClass } from '@/blocks/visibility'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { cn } from '@/lib/utils'

/**
 * Presentational shell for one column of a Container grid: takes a width
 * from the shared size vocabulary, an optional desktop sticky behaviour, an
 * optional left content inset, and stacks its children.
 *
 * @param size - Stored column size; anything unrecognised falls back to
 * full width so a stale value renders readably instead of collapsing.
 * @param sticky - Follow the scroll from `lg` up (see `sticky.ts`). Also
 * pins the column to the top of its row, overriding the container's vertical
 * alignment for this column — a stretched column has nothing to stick in.
 * @param inset - Push the column's content in from its left edge from `lg`
 * up (see `inset.ts`). Empty by default, so a column with no inset renders
 * exactly where it always has.
 * @param visibility - Responsive visibility for the whole column (see
 * `visibility.ts`). Empty by default (`always`), so a column with no value set
 * renders at every width exactly as before. `desktopOnly` is what lets the
 * about page's portrait rail exist on desktop yet vanish on a phone, where the
 * portrait instead rides inline in the content column.
 * @param reveal - When present, the column's children reveal on scroll with
 * these params (see `reveal.ts`), each child expected to carry the
 * `data-reveal-item` marker. When absent, no `ScrollReveal` is emitted at all
 * — the default, byte-identical to before this control existed.
 * @param children - Rendered block content for this column.
 * @param className - Extra classes for the column element.
 * @remarks Plain props, no CMS types — the block Component resolves data
 * and hands it here, and the stories drive this layer directly.
 *
 * The column owns the space between the blocks it stacks
 * ({@link COLUMN_STACK_SPACING_CLASS}). Blocks rendered here drop the
 * `my-12` they carry at root, so the rhythm is stated once, by the host,
 * instead of every block's margin stacking on top of the grid's row gap —
 * which is what put 128px between two stacked cards where the design wants
 * the homepage rail's 40.
 *
 * When `reveal` is on, that stack spacing moves onto the `ScrollReveal`
 * wrapper rather than the outer grid item, so it still falls *between* the
 * revealed children (the wrapper's direct children) rather than around the
 * single wrapper — the same place the homepage's `space-y-10` sits, one level
 * inside its rail's `ScrollReveal`.
 */
export function ColumnShell({
  size,
  sticky,
  inset,
  visibility,
  reveal,
  children,
  className,
}: {
  size?: string | null
  sticky?: boolean | null
  inset?: string | null
  visibility?: string | null
  reveal?: ColumnRevealParams
  children?: ReactNode
  className?: string
}) {
  if (reveal) {
    return (
      <div
        className={cn(
          columnSizeClass(size),
          stickyColumnClass(sticky),
          columnInsetClass(inset),
          visibilityClass(visibility),
          className,
        )}
      >
        <ScrollReveal
          className={COLUMN_STACK_SPACING_CLASS}
          targets={reveal.targets}
          y={reveal.y}
          stagger={reveal.stagger}
        >
          {children}
        </ScrollReveal>
      </div>
    )
  }

  return (
    <div
      className={cn(
        columnSizeClass(size),
        stickyColumnClass(sticky),
        columnInsetClass(inset),
        visibilityClass(visibility),
        COLUMN_STACK_SPACING_CLASS,
        className,
      )}
    >
      {children}
    </div>
  )
}
