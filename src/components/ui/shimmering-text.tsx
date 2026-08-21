'use client'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

export interface ShimmeringTextProps {
  /** The text to render — no markup, this is a plain label. */
  text: string
  className?: string
}

/**
 * A short label with a subtle light-sweep shimmer, for "in progress" copy
 * (e.g. an assistant "thinking…" indicator).
 *
 * @remarks Pure CSS: an animated `background-position` on a
 * `background-clip: text` gradient (`.animate-text-shimmer` /
 * `@keyframes text-shimmer` in `src/styles/tailwind.css`) — no Motion/GSAP
 * dependency for something this small. Reduced motion is honored twice:
 * this component swaps to a flat, non-animated fill when
 * {@link usePrefersReducedMotion} is true, and the stylesheet's own
 * `@media (prefers-reduced-motion: reduce)` guard disables the animation
 * class outright for any other consumer that applies it directly.
 */
export function ShimmeringText({ text, className }: ShimmeringTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <span
      data-slot="shimmering-text"
      className={cn(
        'bg-clip-text text-transparent',
        prefersReducedMotion
          ? 'bg-zinc-500 dark:bg-zinc-400'
          : 'animate-text-shimmer bg-gradient-to-r from-zinc-500 via-zinc-200 to-zinc-500 bg-[length:200%_100%] dark:from-zinc-400 dark:via-zinc-50 dark:to-zinc-400',
        className,
      )}
    >
      {text}
    </span>
  )
}
