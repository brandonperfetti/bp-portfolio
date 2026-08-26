'use client'

import { useEffect, useMemo, useState } from 'react'

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
  readAutoGrantMarker,
  readGaEnv,
  setAutoGrantMarker,
  shouldAutoGrantMeasurement,
  shouldRepromptOnRegionChange,
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
function ConsentSurface() {
  const { hasConsented, setConsent } = useConsentManager()
  const [consentRequired, setConsentRequired] = useState<boolean | null>(null)

  useEffect(() => {
    setConsentRequired(readConsentRequiredCookie(document.cookie))
  }, [])

  useEffect(() => {
    if (consentRequired === null) return

    const wasAutoGranted = readAutoGrantMarker()
    // An explicit choice is any grant NOT flagged as an auto-grant: the marker
    // is set on auto-grant and cleared the moment the visitor chooses.
    const hasExplicitChoice = hasConsented() && !wasAutoGranted

    // #103: a visitor auto-granted in an opt-out region who moved into a
    // required region must be re-prompted — revoke the auto-grant so the banner
    // reappears (hasConsented() → false).
    if (
      shouldRepromptOnRegionChange({
        wasAutoGranted,
        consentRequired,
        hasExplicitChoice,
      })
    ) {
      setConsent('measurement', false)
      setAutoGrantMarker(false)
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
      setConsent('measurement', true)
      setAutoGrantMarker(true)
    }
    // Runs once the cookie resolves and on every region change; hasConsented/
    // setConsent are stable store methods, intentionally not in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentRequired])

  return (
    <>
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
    const { measurementId, isProduction } = readGaEnv()
    return buildConsentManagerOptions({
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
