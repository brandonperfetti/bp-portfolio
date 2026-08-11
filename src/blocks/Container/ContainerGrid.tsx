import type { ReactNode } from 'react'

import {
  type SectionBackgroundValue,
  sectionBackgroundClass,
  sectionBackgroundStyle,
} from '@/blocks/Container/background'
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
 * @param background - Optional tint or gradient, resolved through the
 * CSS-variable bridge rather than into class names.
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
 * their existing wrapping untouched.
 *
 * The background arrives as custom properties on `style` and is read by a
 * static class pair, so an editor's choice never produces a class name the
 * Tailwind scan has not already seen (see `background.ts`). A section with no
 * background gets no `style` attribute at all.
 */
export function ContainerGrid({
  children,
  gap,
  verticalAlign,
  width,
  paddingY,
  anchorId,
  background,
  className,
  sectionClassName,
}: {
  children: ReactNode
  gap?: string | null
  verticalAlign?: string | null
  width?: string | null
  paddingY?: string | null
  anchorId?: string | null
  background?: SectionBackgroundValue
  className?: string
  sectionClassName?: string
}) {
  const id = anchorIdAttribute(anchorId)

  return (
    <section
      id={id}
      style={sectionBackgroundStyle(background)}
      className={cn(
        'my-12',
        sectionWidthClass(width),
        sectionPaddingYClass(paddingY),
        sectionBackgroundClass(background),
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
