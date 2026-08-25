'use client'

import { useEffect, useMemo, useState } from 'react'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'

import { readConsentRequiredCookie } from '@/lib/consent/cookie'

import { CookieBanner } from './CookieBanner'
import { CookieDialog } from './CookieDialog'
import {
  buildConsentManagerOptions,
  buildConsentScripts,
  readGaEnv,
  shouldAutoGrantMeasurement,
} from './consent-config'

/**
 * Reads the geo-consent cookie (client-side) and drives the opt-out-aware
 * default: where consent is confidently NOT required, `measurement` is granted
 * so analytics run unconsented; where required or unknown, it stays denied
 * until the visitor chooses. Renders the custom banner + dialog. Must be inside
 * `ConsentManagerProvider`.
 */
function ConsentSurface() {
  const { hasConsented, setConsent } = useConsentManager()
  const [consentRequired, setConsentRequired] = useState<boolean | null>(null)

  useEffect(() => {
    setConsentRequired(readConsentRequiredCookie(document.cookie))
  }, [])

  useEffect(() => {
    if (consentRequired === null) return
    if (
      shouldAutoGrantMeasurement({
        consentRequired,
        hasConsented: hasConsented(),
      })
    ) {
      // Persisted opt-out grant (short-lived geo cookie re-resolves on
      // navigation; an explicit later choice via the manage dialog wins).
      setConsent('measurement', true)
    }
    // Runs once the cookie resolves; hasConsented/setConsent are stable store
    // methods, intentionally not in the dep array.
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
 * @see docs/ANALYTICS.md for the analytics + consent architecture.
 */
export function ConsentManager({ children }: { children: React.ReactNode }) {
  const options = useMemo(() => {
    const { measurementId, isProduction } = readGaEnv()
    return buildConsentManagerOptions({
      scripts: buildConsentScripts({ measurementId, isProduction }),
    })
  }, [])

  return (
    <ConsentManagerProvider options={options}>
      {children}
      <ConsentSurface />
    </ConsentManagerProvider>
  )
}
