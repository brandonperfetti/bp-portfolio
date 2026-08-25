'use client'

import { ConsentDialogLink } from '@c15t/react'

import { cn } from '@/lib/utils'

/**
 * Persistent "Manage cookies" entry point (the Brytecore `ManageCookiesLink`
 * pattern) — opens the consent dialog from anywhere the banner is dismissed or
 * suppressed (e.g. opt-out jurisdictions where no banner shows).
 *
 * @remarks
 * `ConsentDialogLink` renders a real, unstyled `<button>`, so the sitewide teal
 * `:focus-visible` outline (`@layer base` in tailwind.css) applies for free and
 * the classes below match the footer's other links.
 */
export function ManageCookiesLink({ className }: { className?: string }) {
  return (
    <ConsentDialogLink
      className={cn(
        'rounded-md px-1 py-0.5 transition hover:text-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:hover:text-teal-400 dark:focus-visible:ring-teal-400/80',
        className,
      )}
    >
      Manage cookies
    </ConsentDialogLink>
  )
}
