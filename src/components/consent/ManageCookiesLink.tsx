'use client'

import { useConsentManager } from '@c15t/react'

import { cn } from '@/lib/utils'

import { useConsentConfig } from './consent-context'

/**
 * Persistent "Manage Cookies" entry point (the Brytecore `ManageCookiesLink`
 * pattern) — reopens the custom consent dialog from anywhere, including where
 * the banner is suppressed (jurisdictions that don't require consent).
 *
 * @remarks
 * A real button that drives c15t's `activeUI` state — it opens the dialog via
 * `setActiveUI`, which `CookieDialog` reads. Must render inside
 * `ConsentManagerProvider` (the footer is). Self-gated on the CMS
 * `showPersistentCookieButton` toggle (default on): when off, it renders
 * nothing, removing the footer affordance without threading config through the
 * footer. The sitewide teal `:focus-visible` outline applies; classes match the
 * footer's other links.
 */
export function ManageCookiesLink({ className }: { className?: string }) {
  const { setActiveUI } = useConsentManager()
  const { banner, features } = useConsentConfig()

  if (!features.showPersistentCookieButton) return null

  return (
    <button
      type="button"
      onClick={() => setActiveUI('dialog', { force: true })}
      className={cn(
        'rounded-md px-1 py-0.5 transition hover:text-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:hover:text-teal-400 dark:focus-visible:ring-teal-400/80',
        className,
      )}
    >
      {banner.manageCookiesLabel}
    </button>
  )
}
