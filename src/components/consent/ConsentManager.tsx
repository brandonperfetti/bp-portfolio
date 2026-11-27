'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'
import { type ConsentManagerOptions, getOrCreateConsentRuntime } from 'c15t'

import { readConsentRequiredCookie } from '@/lib/consent/cookie'

import {
  type ConsentStoreLike,
  clearAutomaticGrant,
  discardStoredAutomaticGrantOnce,
  grantAutomatically,
  installLandingRouteGuard,
  isAutomaticGrantLive,
} from './automatic-grant'
import {
  type ConsentConfig,
  DEFAULT_CONSENT_CONFIG,
  enabledC15tCategories,
} from './consent-content'
import { ConsentConfigProvider, ConsentStoreProvider } from './consent-context'
import {
  buildConsentManagerOptions,
  buildConsentScripts,
  readGaEnv,
  shouldAutoGrantMeasurement,
  shouldClearAutomaticGrant,
  stopGoogleAnalytics,
} from './consent-config'
import { CookieBanner } from './CookieBanner'
import { CookieDialog } from './CookieDialog'

/**
 * Suspense-isolated leaf that re-reads the geo-consent cookie and reports the
 * resolved tri-state up to {@link ConsentSurface}.
 *
 * @remarks
 * `src/proxy.ts` rewrites the `cookieConsentRequired` cookie on each matched
 * request, so a visitor can cross a consent jurisdiction mid-session through
 * client-side navigation alone: no remount, no full reload. The cookie is
 * re-read:
 *
 * - on every navigation, keyed on `usePathname`;
 * - when the page is restored from the back-forward cache (`pageshow` with
 *   `persisted`), which keeps its pathname, so the key above would not fire;
 * - when the tab becomes visible again, after it may have sat idle past the
 *   cookie's one-hour life (#375, the design's rule 6).
 *
 * Because `usePathname` suspends during the static-shell prerender under
 * `cacheComponents`, it lives behind its own `Suspense` boundary, like
 * `PreviousPathnameTracker`, so the surrounding consent tree stays static and
 * never forces the app dynamic.
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

  useEffect(() => {
    const reread = () => onResolved(readConsentRequiredCookie(document.cookie))
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reread()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reread()
    }
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [onResolved])

  return null
}

/**
 * Reads the region and holds the automatic Analytics grant, then renders the
 * banner and dialog. Must be inside `ConsentManagerProvider`.
 *
 * @remarks
 * #375 (option C, signed 2026-11-26): where consent is confidently not
 * required and the visitor has made no choice, `measurement` is granted **in
 * memory only** (`grantAutomatically`). Nothing is saved, so a fresh page has
 * nothing automatic to restore, no automatic save can land late, and no other
 * tab sees it. When the region asks, or cannot be read, the grant is cleared
 * in memory (`clearAutomaticGrant`): no denial is recorded, so c15t still
 * reports no choice and the banner returns. Explicit choices are never
 * touched. See `docs/designs/375-automatic-grant-region.md`.
 */
function ConsentSurface({ store }: { store: ConsentStoreLike | null }) {
  const { consents } = useConsentManager()
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
    if (!store) return
    // Before any grant can load the tag, so this wrapper sits inside gtag's.
    installLandingRouteGuard()

    // Read live from the store, not from the render's snapshot: a save that
    // committed since the last render is an explicit choice and must win.
    const hasConsented = store.getState().consentInfo != null

    if (
      shouldClearAutomaticGrant({
        automaticGrantLive: isAutomaticGrantLive(),
        consentRequired,
        hasConsented,
      })
    ) {
      clearAutomaticGrant(store)
      return
    }

    if (shouldAutoGrantMeasurement({ consentRequired, hasConsented })) {
      grantAutomatically(store)
    }
  }, [consentRequired, store])

  return (
    <ConsentStoreProvider value={store}>
      {/* Re-reads the geo cookie on each client navigation (Suspense-isolated,
          so the static shell stays static). */}
      <Suspense fallback={null}>
        <ConsentGeoCookieSignal onResolved={setConsentRequired} />
      </Suspense>
      <CookieBanner consentRequired={consentRequired} />
      <CookieDialog />
    </ConsentStoreProvider>
  )
}

/**
 * The store `ConsentManagerProvider` created for these options.
 *
 * @remarks Rendered inside the provider, so the provider has already created
 * the store and this returns it from c15t's cache; the cache key does not
 * depend on anything the call could change. `null` on the server, where there
 * is nothing to grant.
 */
function useConsentRuntimeStore(
  options: ConsentManagerOptions,
): ConsentStoreLike | null {
  return useMemo(() => {
    if (typeof window === 'undefined') return null
    return getOrCreateConsentRuntime(options)
      .consentStore as unknown as ConsentStoreLike
  }, [options])
}

function ConsentSurfaceWithStore({
  options,
}: {
  options: ConsentManagerOptions
}) {
  const store = useConsentRuntimeStore(options)
  return <ConsentSurface store={store} />
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
  // #375: before the provider below creates c15t's store, which restores
  // whatever is stored. A record production saved as an automatic grant is
  // deleted here once per document, so it is never restored (the design's
  // rule 4).
  discardStoredAutomaticGrantOnce()

  const options = useMemo(() => {
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
        <ConsentSurfaceWithStore options={options} />
      </ConsentConfigProvider>
    </ConsentManagerProvider>
  )
}
