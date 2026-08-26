'use client'

import { useConsentManager } from '@c15t/react'

import { Button } from '@/components/ui/button'

import { shouldShowBanner, markExplicitConsentChoice } from './consent-config'
import { useConsentConfig } from './consent-context'

/**
 * Custom cookie-consent banner in bp's own design system (zinc/teal, Tailwind
 * v4) — headless c15t, no built-in `<ConsentBanner>` and no "Secured by c15t"
 * badge. Shown only where consent is required (the `cookieConsentRequired`
 * cookie, resolved to `consentRequired`), until the visitor makes a choice.
 *
 * @remarks
 * Copy and button labels come from the CMS-driven {@link useConsentConfig}
 * (defaults reproduce today's strings). The "Customize" button is gated on the
 * `showManageButton` toggle; Accept-all / Reject-non-essential are explicit
 * choices, so they clear the #103 auto-grant marker
 * ({@link markExplicitConsentChoice}). Enter animation via `tw-animate-css`,
 * disabled under `prefers-reduced-motion`. Buttons are real `<button>`s so the
 * sitewide teal `:focus-visible` outline applies.
 */
export function CookieBanner({
  consentRequired,
}: {
  consentRequired: boolean | null
}) {
  const { hasConsented, saveConsents, setActiveUI, activeUI } =
    useConsentManager()
  const { banner, features } = useConsentConfig()

  const visible =
    shouldShowBanner({ consentRequired, hasConsented: hasConsented() }) &&
    activeUI !== 'dialog'

  if (!visible) return null

  const accept = () => {
    markExplicitConsentChoice()
    void saveConsents('all')
  }
  const reject = () => {
    markExplicitConsentChoice()
    void saveConsents('necessary')
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 animate-in px-3 duration-300 fade-in slide-in-from-bottom-4 motion-reduce:animate-none sm:px-4"
    >
      <div className="mx-auto mb-3 flex max-w-3xl flex-col gap-3 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700/60 dark:bg-zinc-900/95">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          {banner.title ? (
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {banner.title}
            </p>
          ) : null}
          <p>
            {banner.message} See{' '}
            <button
              type="button"
              onClick={() => setActiveUI('dialog', { force: true })}
              className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
            >
              {banner.cookieDetailsLabel}
            </button>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={accept}>
            {banner.acceptAllLabel}
          </Button>
          <Button size="sm" variant="outline" onClick={reject}>
            {banner.rejectNonEssentialLabel}
          </Button>
          {features.showManageButton ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveUI('dialog', { force: true })}
            >
              {banner.customizeLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
