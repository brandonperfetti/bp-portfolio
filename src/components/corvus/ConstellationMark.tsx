import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

export interface ConstellationMarkProps extends ComponentPropsWithoutRef<'svg'> {
  /**
   * Enables the subtle per-star twinkle animation. Defaults to `true`. The
   * animation itself is pure CSS (`.corvus-constellation-twinkle` in
   * `src/styles/tailwind.css`) and is unconditionally disabled under
   * `prefers-reduced-motion: reduce` — no JS gate needed for that part. This
   * prop is a separate, explicit off-switch for callers that want a
   * guaranteed-static rendering regardless of motion preference (e.g. a
   * screenshot/export context).
   */
  animate?: boolean
}

/**
 * Corvus constellation identity mark — five stars connected by faint lines,
 * tracing the raven constellation's shape.
 *
 * @remarks Inline SVG (source: `_corvus_marks/corvus-constellation.svg`),
 * kept at `viewBox="0 0 64 64"` with `fill`/`stroke="currentColor"` so it
 * inherits color from an ancestor — set `color: var(--corvus-accent)` to
 * render it gold. All props (including `className`) spread onto the root
 * `<svg>`. Used as a low-opacity backdrop element behind the Corvus page
 * header/hero — pass `aria-hidden="true"` for that decorative usage, since
 * it sits alongside the visible wordmark it's tracing.
 */
export function ConstellationMark({
  animate = true,
  className,
  ...props
}: ConstellationMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Corvus constellation mark"
      className={cn(animate && 'corvus-constellation-twinkle', className)}
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      >
        <path d="M18 15 L46 20 L50 45 L22 41 Z" />
        <path d="M22 41 L11 33" />
      </g>
      <g fill="currentColor">
        <circle cx={18} cy={15} r={2.4} />
        <circle cx={46} cy={20} r={3.2} />
        <circle cx={50} cy={45} r={2.6} />
        <circle cx={22} cy={41} r={3.4} />
        <circle cx={11} cy={33} r={1.8} />
      </g>
    </svg>
  )
}
