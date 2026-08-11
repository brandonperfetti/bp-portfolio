import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Presentational shell for the Container block: a 12-column grid holding
 * column elements, inside whatever width the route's own container sets.
 *
 * @param children - Column elements (each supplies its own `col-span-*`).
 * @param className - Extra classes for the grid element.
 * @remarks Takes plain children rather than CMS data so Storybook can drive
 * it directly. Columns span all 12 tracks below `lg`, so the same grid
 * stacks on small screens without a breakpoint branch here. Width,
 * background and padding are deliberately not its job (#29/#30/#37).
 */
export function ContainerGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className="my-12">
      <div className={cn('grid grid-cols-12 gap-8', className)}>{children}</div>
    </section>
  )
}
