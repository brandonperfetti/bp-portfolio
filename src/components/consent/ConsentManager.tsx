'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'

import { readConsentRequiredCookie } from '@/lib/consent/cookie'

import {
  type ConsentConfig,
  DEFAULT_CONSENT_CONFIG,
  enabledC15tCategories,
} from './consent-content'
import { ConsentConfigProvider } from './consent-context'
import {
  buildConsentManagerOptions,
  buildConsentScripts,
  discardStoredConsent,
  readAutoGrantMarker,
  readGaEnv,
  setAutoGrantMarker,
  shouldAutoGrantMeasurement,
  shouldDiscardStoredAutoGrant,
  shouldRepromptOnRegionChange,
  stopGoogleAnalytics,
} from './consent-config'
import { CookieBanner } from './CookieBanner'
import { CookieDialog } from './CookieDialog'

/**
 * Reads the geo-consent cookie (client-side) and drives the opt-out-aware
 * default: where consent is confidently NOT required, `measurement` is granted
 * so analytics run unconsented; where required or unknown, it stays denied
 * until the visitor chooses. Renders the custom banner + dialog. Must be inside
 * `ConsentManagerProvider`.
 *
 * @remarks
 * #103 (region change): an auto-grant is tracked with a localStorage marker
 * (`setAutoGrantMarker`) so it can be told apart from an explicit save. When the
 * geo cookie re-resolves to a consent-required region and the current grant is
 * an auto-grant (never an explicit choice), the auto-grant is revoked and the
 * banner re-shows — instead of an opt-out auto-grant silently suppressing the
 * banner forever. Explicit choices and stable regions are untouched.
 */
/**
 * Suspense-isolated leaf that re-reads the geo-consent cookie on every client
 * navigation and reports the resolved tri-state up to {@link ConsentSurface}.
 *
 * @remarks
 * `src/proxy.ts` rewrites the `cookieConsentRequired` cookie on each matched
 * request, so a visitor can cross a consent jurisdiction mid-session through
 * client-side navigation alone — no remount, no full reload. Reading the cookie
 * only on mount would freeze `consentRequired` at its first value, leaving an
 * opt-out auto-grant (GA4 enabled, banner hidden) live after the visitor enters
 * a consent-required region, and never firing the #103 region-change reprompt.
 * Keying the read on `usePathname` re-resolves it on each navigation. Because
 * `usePathname` suspends during the static-shell prerender under
 * `cacheComponents`, it lives behind its own `Suspense` boundary — like
 * {@link PreviousPathnameTracker} — so the surrounding consent tree stays
 * static and never forces the app dynamic.
 */
function ConsentGeoCookieSignal({
  onResolved,
}: {
  onResolved: (consentRequired: boolean | null) => void
}) {
  const pathname = usePathname()

  useEffect(() => {
    onResolved(readConsentRequiredCookie(document.cookie))
  }, [pathname, onResolved])

  return null
}

function ConsentSurface() {
  const {
    hasConsented,
    setSelectedConsent,
    saveConsents,
    resetConsents,
    consents,
  } = useConsentManager()
  // The auto-grant save still in flight, if any; see the reprompt below.
  const pendingAutoGrant = useRef<Promise<unknown> | null>(null)
  const [consentRequired, setConsentRequired] = useState<boolean | null>(null)

  // #361: a withdrawal has to reach gtag.js from this app. c15t drops a
  // consent-gated script from its bookkeeping when the category is revoked and
  // runs no callback for it. A revoking save reloads the page, and the stop
  // for that case is made synchronously in `onBeforeRevocationReload`; this
  // effect covers a revoke that does not reload. Runs on mount too, where it
  // is a no-op unless the tag is somehow present.
  const measurementGranted = consents?.measurement === true
  useEffect(() => {
    if (!measurementGranted) stopGoogleAnalytics(readGaEnv())
  }, [measurementGranted])

  useEffect(() => {
    if (consentRequired === null) return

    const wasAutoGranted = readAutoGrantMarker()
    // An explicit choice is any grant NOT flagged as an auto-grant: the marker
    // is set on auto-grant and cleared the moment the visitor chooses.
    const hasExplicitChoice = hasConsented() && !wasAutoGranted

    // #103: a visitor auto-granted in an opt-out region who moved into a
    // required region must be re-prompted. The auto-grant is forgotten, not
    // answered: `resetConsents` clears the record (`consentInfo` → null), so
    // `hasConsented()` is false again and the banner comes back. Saving a
    // denial with `setConsent('measurement', false)`, as this did until #361's
    // review, records a choice the visitor never made: c15t then reports
    // `hasConsented()` true and the banner stays hidden for good. The tag that
    // the auto-grant loaded is still in this document, so it is stopped first.
    if (
      shouldRepromptOnRegionChange({
        wasAutoGranted,
        consentRequired,
        hasExplicitChoice,
      })
    ) {
      const forgetAutoGrant = () => {
        stopGoogleAnalytics(readGaEnv())
        resetConsents()
        setAutoGrantMarker(false)
      }
      // An auto-grant is a save, and c15t commits a save asynchronously (it
      // awaits a digest first). One still in flight would land AFTER a reset
      // made now, restore the grant, load the tag and hide the banner, with no
      // marker left to say it was automatic. So the reset waits for it.
      const pending = pendingAutoGrant.current
      if (pending) {
        void pending.then(forgetAutoGrant, forgetAutoGrant)
      } else {
        forgetAutoGrant()
      }
      return
    }

    if (
      shouldAutoGrantMeasurement({
        consentRequired,
        hasConsented: hasConsented(),
      })
    ) {
      // Persisted opt-out grant, flagged as an auto-grant so a later region
      // change (above) can tell it apart from an explicit choice.
      // `setSelectedConsent` + `saveConsents('custom')` is what c15t's own
      // `setConsent` does; done by hand because only `saveConsents` returns
      // the promise the reprompt above has to wait on.
      setSelectedConsent('measurement', true)
      setAutoGrantMarker(true)
      const save = Promise.resolve(saveConsents('custom')).finally(() => {
        if (pendingAutoGrant.current === save) pendingAutoGrant.current = null
      })
      pendingAutoGrant.current = save
    }
    // Runs once the cookie resolves and on every region change; the store
    // methods are stable, intentionally not in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentRequired])

  return (
    <>
      {/* Re-reads the geo cookie on each client navigation (Suspense-isolated,
          so the static shell stays static); drives the region-change reprompt
          above. */}
      <Suspense fallback={null}>
        <ConsentGeoCookieSignal onResolved={setConsentRequired} />
      </Suspense>
      <CookieBanner consentRequired={consentRequired} />
      <CookieDialog />
    </>
  )
}

/**
 * App-wide consent runtime, mounted once inside `Providers`. Headless c15t
 * (`noStyle`, `mode:'offline'`, no built-in components, no `styles.css`) — the
 * banner/dialog are bp's own components in the site's design system, and the
 * geo decision comes from `src/proxy.ts`'s cookie, not c15t. GA4 is wired via
 * c15t's Consent Mode v2 script loader, gated to production + a present id.
 *
 * @remarks
 * The offered categories and every string/toggle come from `consentConfig`
 * (CMS-driven; defaults reproduce today's copy). Only enabled categories are
 * passed to c15t as `consentCategories`. `disableAutomaticBlocking` is accepted
 * for parity but is a no-op in this headless offline setup (see
 * `buildConsentManagerOptions`). The config is provided to the banner/dialog/
 * persistent link via {@link ConsentConfigProvider}.
 *
 * @see docs/ANALYTICS.md for the analytics + consent architecture.
 */
export function ConsentManager({
  children,
  consentConfig = DEFAULT_CONSENT_CONFIG,
}: {
  children: React.ReactNode
  consentConfig?: ConsentConfig
}) {
  const options = useMemo(() => {
    // #361: before c15t's store exists (it reads storage as it is created,
    // further down this render), drop an auto-grant that was written where
    // consent is not required if this page is not being served there. In the
    // browser only; the server has neither storage nor the cookie.
    if (
      typeof document !== 'undefined' &&
      shouldDiscardStoredAutoGrant({
        wasAutoGranted: readAutoGrantMarker(),
        consentRequired: readConsentRequiredCookie(document.cookie),
      })
    ) {
      discardStoredConsent()
    }
    const { measurementId, isProduction } = readGaEnv()
    return buildConsentManagerOptions({
      // Synchronous, just before c15t reloads on a revoking save: the effect
      // in ConsentSurface would not get to run first.
      onBeforeRevocationReload: (preferences) => {
        if (preferences.measurement !== true) stopGoogleAnalytics(readGaEnv())
      },
      scripts: buildConsentScripts({ measurementId, isProduction }),
      categories: enabledC15tCategories(consentConfig),
      disableAutomaticBlocking: consentConfig.features.disableAutomaticBlocking,
    })
  }, [consentConfig])

  return (
    <ConsentManagerProvider options={options}>
      <ConsentConfigProvider value={consentConfig}>
        {children}
        <ConsentSurface />
      </ConsentConfigProvider>
    </ConsentManagerProvider>
  )
}
