'use client'

import { useConsentManager } from '@c15t/react'

import { Button } from '@/components/ui/button'

import { shouldShowBanner } from './consent-config'

/**
 * Custom cookie-consent banner in bp's own design system (zinc/teal, Tailwind
 * v4) — headless c15t, no built-in `<ConsentBanner>` and no "Secured by c15t"
 * badge. Shown only where consent is required (the `cookieConsentRequired`
 * cookie, resolved to `consentRequired`), until the visitor makes a choice.
 *
 * @remarks
 * Enter animation via `tw-animate-css`, disabled under
 * `prefers-reduced-motion`. Buttons are real `<button>`s so the sitewide teal
 * `:focus-visible` outline applies. "Customize" opens the manage dialog
 * (c15t's `activeUI` state).
 */
export function CookieBanner({
  consentRequired,
}: {
  consentRequired: boolean | null
}) {
  const { hasConsented, saveConsents, setActiveUI, activeUI } =
    useConsentManager()

  const visible =
    shouldShowBanner({ consentRequired, hasConsented: hasConsented() }) &&
    activeUI !== 'dialog'

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 animate-in duration-300 fade-in slide-in-from-bottom-4 motion-reduce:animate-none"
    >
      <div className="mx-auto mb-3 flex max-w-3xl flex-col gap-3 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm sm:mx-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700/60 dark:bg-zinc-900/95">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          This site uses a cookieless analytics baseline always, and Google
          Analytics only with your consent. See{' '}
          <button
            type="button"
            onClick={() => setActiveUI('dialog', { force: true })}
            className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
          >
            cookie details
          </button>
          .
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={() => void saveConsents('all')}>
            Accept all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void saveConsents('necessary')}
          >
            Reject non-essential
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveUI('dialog', { force: true })}
          >
            Customize
          </Button>
        </div>
      </div>
    </div>
  )
}
