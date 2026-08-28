'use client'

import { useState } from 'react'

import { useConsentManager } from '@c15t/react'

import { Button } from '@/components/ui/button'

import { shouldShowBanner, markExplicitConsentChoice } from './consent-config'
import { useConsentConfig } from './consent-context'
import { CONSENT_TRIGGER_ATTR, captureConsentTrigger } from './consent-focus'
import { useConsentBannerInset } from './consent-inset'

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

  // Consent required and still undecided — the condition the #115 shell inset
  // tracks. Deliberately NOT the same as `visible`: the banner un-renders while
  // the dialog is open, but opening the dialog is not a *choice*, so the
  // reserved space must survive it (releasing it there would shrink the
  // document mid-open and re-introduce the #110 scroll jump).
  const consentUndecided = shouldShowBanner({
    consentRequired,
    hasConsented: hasConsented(),
  })
  const visible = consentUndecided && activeUI !== 'dialog'

  // State-backed ref callback (not `useRef`): the effect must re-run when the
  // banner unmounts for the dialog and again when it comes back.
  const [bannerEl, setBannerEl] = useState<HTMLElement | null>(null)
  useConsentBannerInset(consentUndecided, bannerEl)

  // #112: record the opener synchronously, before React unmounts this banner —
  // by the time `CookieDialog`'s open effect runs, `document.activeElement` has
  // already fallen back to `<body>`.
  const openDialogFrom =
    (id: 'banner-customize' | 'banner-cookie-details') =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      captureConsentTrigger(id, event.currentTarget)
      setActiveUI('dialog', { force: true })
    }

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
      ref={setBannerEl}
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
              {...{ [CONSENT_TRIGGER_ATTR]: 'banner-cookie-details' }}
              onClick={openDialogFrom('banner-cookie-details')}
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
              {...{ [CONSENT_TRIGGER_ATTR]: 'banner-customize' }}
              onClick={openDialogFrom('banner-customize')}
            >
              {banner.customizeLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
