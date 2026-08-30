import Link from 'next/link'
import clsx from 'clsx'

import { getExternalLinkProps } from '@/lib/link-utils'

const variantStyles = {
  // Hover DARKENS rather than lightens, and that direction is the
  // accessibility call, not a taste one — the same fix `src/components/ui/
  // button.tsx`'s `teal` variant took. White on teal-600 is 3.67:1, under the
  // 4.5:1 WCAG AA floor for this button's text size, so a teal-600 hover
  // dropped the control below AA for exactly as long as the pointer rested on
  // it, in BOTH themes (the dark variant mirrors the light one). teal-700 is
  // 5.36:1 and teal-800 is 7.54:1, computed from the Tailwind 4.3.3 OKLCH
  // tokens this project resolves — not from hex approximations — so hover is
  // now the higher-contrast state of the two rather than the lower. teal-700
  // would also pass, but it is the resting fill, so it would read as no hover
  // at all. `active` keeps its teal-800 fill and stays distinguishable by its
  // `text-white/80` step; moving it to teal-900 is a separate, non-a11y call.
  primary:
    'bg-teal-700 font-semibold text-white hover:bg-teal-800 active:bg-teal-800 active:text-white/80 dark:bg-teal-700 dark:hover:bg-teal-800 dark:active:bg-teal-800 dark:active:text-white/80',
  secondary:
    'bg-zinc-50 font-medium text-zinc-900 hover:bg-zinc-100 active:bg-zinc-100 active:text-zinc-900/60 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:active:bg-zinc-800/50 dark:active:text-zinc-50/70',
}

type ButtonProps = {
  variant?: keyof typeof variantStyles
} & (
  | (React.ComponentPropsWithoutRef<'button'> & { href?: undefined })
  | React.ComponentPropsWithoutRef<typeof Link>
)

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  className = clsx(
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm outline-offset-2 transition active:transition-none disabled:cursor-not-allowed',
    variantStyles[variant],
    className,
  )

  return typeof props.href === 'undefined' ? (
    <button className={className} {...props} />
  ) : (
    <Link
      className={className}
      {...getExternalLinkProps(props.href)}
      {...props}
    />
  )
}
