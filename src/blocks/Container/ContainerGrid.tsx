import type { ReactNode } from 'react'

import {
  containerGapClass,
  containerVerticalAlignClass,
} from '@/blocks/Container/layout'
import {
  anchorIdAttribute,
  sectionPaddingYClass,
  sectionWidthClass,
} from '@/blocks/Container/section'
import { cn } from '@/lib/utils'

/**
 * Presentational shell for the Container block: a section wrapper (width,
 * vertical padding, anchor) around a 12-column grid holding column elements.
 *
 * @param children - Column elements (each supplies its own `col-span-*`).
 * @param gap - Space between columns, from the shared gap vocabulary.
 * @param verticalAlign - Cross-axis alignment for columns of unequal height.
 * @param width - Section width: the route's container, a narrow reading
 * measure, or a full-bleed breakout to the viewport edges.
 * @param paddingY - Extra vertical padding on the section.
 * @param anchorId - Optional `id`, making the section linkable as `#anchor`.
 * @param className - Extra classes for the grid element.
 * @param sectionClassName - Extra classes for the section element.
 * @remarks Takes plain, permissive props rather than CMS data so Storybook
 * can drive it directly and stale stored values fall back instead of
 * throwing. Columns span all 12 tracks below `lg`, so the same grid stacks on
 * small screens without a breakpoint branch here.
 *
 * `fullBleed` is a breakout, not a different wrapper: the `[slug]` route
 * wraps every block in `<Container>`, and the section centers itself on the
 * viewport from inside that wrapper. Legacy root-level blocks therefore keep
 * their existing wrapping untouched. Backgrounds remain out of scope (#37).
 */
export function ContainerGrid({
  children,
  gap,
  verticalAlign,
  width,
  paddingY,
  anchorId,
  className,
  sectionClassName,
}: {
  children: ReactNode
  gap?: string | null
  verticalAlign?: string | null
  width?: string | null
  paddingY?: string | null
  anchorId?: string | null
  className?: string
  sectionClassName?: string
}) {
  const id = anchorIdAttribute(anchorId)

  return (
    <section
      id={id}
      className={cn(
        'my-12',
        sectionWidthClass(width),
        sectionPaddingYClass(paddingY),
        // Scroll margin only matters once the section is a link target; it
        // affects nothing about layout, only where an anchor jump lands.
        id && 'scroll-mt-16',
        sectionClassName,
      )}
    >
      <div
        className={cn(
          'grid grid-cols-12',
          containerGapClass(gap),
          containerVerticalAlignClass(verticalAlign),
          className,
        )}
      >
        {children}
      </div>
    </section>
  )
}
