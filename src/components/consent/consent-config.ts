import type { ConsentManagerOptions } from '@c15t/react'
import { gtag } from '@c15t/scripts/google-tag'

import { readConsentRequiredCookie } from '@/lib/consent/cookie'

import type { C15tCategory } from './consent-content'

/**
 * Consent categories offered in the banner/dialog.
 *
 * @remarks
 * `necessary` is always-on and covers the site's only pre-existing cookies —
 * Clerk (auth session) and Cloudflare Turnstile (security) — which consent
 * frameworks exempt. `measurement` gates GA4. No `marketing`/`experience`
 * categories: #83 is analytics-only (no ads/marketing pixels).
 */
export const CONSENT_CATEGORIES = ['necessary', 'measurement'] as const

/** localStorage key c15t persists the offline consent state under. */
export const CONSENT_STORAGE_KEY = 'bp-consent'

type ConsentScripts = NonNullable<ConsentManagerOptions['scripts']>

/**
 * The window property gtag.js reads as its documented opt-out switch: while
 * `window['ga-disable-<measurement id>']` is `true`, the tag sends nothing to
 * Google Analytics for that id.
 */
export function gaDisableKey(measurementId: string): string {
  return `ga-disable-${measurementId}`
}

function setGaDisabled(measurementId: string, disabled: boolean): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>)[gaDisableKey(measurementId)] =
    disabled
}

/**
 * Stops Google Analytics for the rest of this page's life, once `measurement`
 * is no longer granted (#361).
 *
 * @remarks
 * c15t stops managing a consent-gated script the moment its category is
 * revoked: it runs no callback on unload, and it calls `onConsentChange` only
 * for scripts that still have consent. So a withdrawal reaches gtag.js through
 * here, not through c15t. It is called from two places: c15t's
 * `onBeforeConsentRevocationReload` callback, which runs synchronously just
 * before c15t reloads the page on a revoking save (its
 * `reloadOnConsentRevoked` default), and an effect in `ConsentSurface`, for
 * any revoke that does not reload. The effect alone would be too late for the
 * reloading case: c15t reloads in the same task as the save. Two things
 * happen, and the first is the one that
 * matters: gtag's own opt-out switch ({@link gaDisableKey}) is set, which
 * stops every hit, including the cookieless ping Consent Mode sends while
 * storage is denied; then, if the tag was ever installed on this page, it is
 * told storage is denied so it stops reading and writing its cookies. The
 * script that already ran stays in memory until the next page load; it has
 * nothing left it is allowed to send.
 *
 * A no-op without a measurement id or outside production, where no Google
 * code is registered at all, and safe to call when the tag never loaded.
 */
export function stopGoogleAnalytics(input: {
  measurementId: string | undefined
  isProduction: boolean
}): void {
  const { measurementId, isProduction } = input
  if (!measurementId || !isProduction || typeof window === 'undefined') return
  setGaDisabled(measurementId, true)
  const tag = (window as unknown as { gtag?: unknown }).gtag
  if (typeof tag === 'function') {
    ;(tag as (...args: unknown[]) => void)('consent', 'update', {
      analytics_storage: 'denied',
    })
  }
}

/**
 * GA4 gating — mirrors the repo's "empty var ⇒ zero code" idiom: no Google
 * code is registered unless a measurement id is present AND the build is
 * production.
 *
 * @remarks
 * Production is judged by `NEXT_PUBLIC_VERCEL_ENV === 'production'` (Vercel
 * injects it and it is client-readable), NOT `NODE_ENV` — a Vercel Preview
 * build is `NODE_ENV==='production'` too, so `NODE_ENV` would wrongly load GA4
 * on previews (code-review Sp-1). No new env var is introduced. Kept pure
 * (inputs, not `process.env`) so it is unit-testable.
 *
 * **The tag is gated on the `measurement` category, not always-loaded
 * (#361).** c15t's prebuilt Google tag ships `alwaysLoad: true`: gtag.js is
 * installed for every visitor and left to police itself through Consent Mode
 * v2, which still sends Google a cookieless `page_view` while storage is
 * denied. The banner promises "Google Analytics only with your consent", so
 * the override below turns that off: until `measurement` is granted c15t runs
 * none of the tag's setup (no `dataLayer`, no `gtag`, no script element), and
 * no request reaches a Google host. Which visitors are granted without asking
 * is decided in one place, {@link shouldAutoGrantMeasurement}; this function
 * knows nothing about regions.
 *
 * `persistAfterConsentRevoked` stays `true` on purpose. Removing the script
 * element on a withdrawal would not unload code that already ran, and a later
 * re-grant would append and execute gtag.js a second time on the same page.
 * Kept, a re-grant reuses the element and c15t replays the consent state
 * through `onConsentChange`. What stops the hits on withdrawal is
 * {@link stopGoogleAnalytics}; the two wrappers here lift that switch again
 * synchronously, before the tag can send, whenever c15t loads or re-syncs the
 * script with consent.
 */
export function buildConsentScripts(input: {
  measurementId: string | undefined
  isProduction: boolean
}): ConsentScripts {
  const { measurementId, isProduction } = input
  if (!measurementId || !isProduction) return []
  const tag = gtag({ id: measurementId, category: 'measurement' })
  return [
    {
      ...tag,
      alwaysLoad: false,
      persistAfterConsentRevoked: true,
      onBeforeLoad: (info) => {
        setGaDisabled(measurementId, !info.hasConsent)
        tag.onBeforeLoad?.(info)
      },
      onConsentChange: (info) => {
        setGaDisabled(measurementId, !info.hasConsent)
        tag.onConsentChange?.(info)
      },
    },
  ]
}

/** Reads the client-inlined GA gating inputs from the environment. */
export function readGaEnv(): {
  measurementId: string | undefined
  isProduction: boolean
} {
  return {
    measurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    isProduction: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production',
  }
}

/**
 * Assembles the headless `ConsentManagerProvider` options.
 *
 * @remarks
 * Headless per Brandon's production pattern: `noStyle:true`, no
 * `@c15t/react/styles.css`, no built-in `<ConsentBanner>`/`<ConsentDialog>`,
 * and no `offlinePolicy`/`policyPacks` — geo is decided upstream (the
 * `cookieConsentRequired` cookie), and the banner/dialog are custom components
 * driven by `useConsentManager()`. c15t only holds consent state + runs the
 * gated GA4 script. Kept pure so the shape is unit-testable.
 *
 * `input.categories` is the c15t consent names to offer, derived from the
 * CMS-enabled categories (Essential→`necessary` always; Analytics, Social,
 * Advertising only when their CMS toggle is on). It defaults to the pre-CMS set
 * (`necessary` + `measurement`) so existing call sites are behavior-identical.
 *
 * `input.disableAutomaticBlocking` is the CMS "Disable Automatic Blocking"
 * toggle. It is a **no-op in bp's headless offline setup** — there is no c15t
 * auto-blocking to switch off (GA4 is gated through `scripts`, not c15t's
 * blocker), so the value is accepted for parity and intentionally does not
 * change the produced options. Pinned by `consent-config.test.ts`.
 */
export function buildConsentManagerOptions(input: {
  scripts: ConsentScripts
  categories?: readonly C15tCategory[]
  disableAutomaticBlocking?: boolean
  /**
   * Runs synchronously when a saved choice revokes a category c15t had
   * granted, immediately before c15t reloads the page. Receives the
   * preferences being saved.
   */
  onBeforeRevocationReload?: (preferences: Record<string, boolean>) => void
}): ConsentManagerOptions {
  const { onBeforeRevocationReload } = input
  return {
    ...(onBeforeRevocationReload
      ? {
          callbacks: {
            onBeforeConsentRevocationReload: ({ preferences }) =>
              onBeforeRevocationReload(preferences as Record<string, boolean>),
          },
        }
      : {}),
    mode: 'offline',
    // Emit no c15t CSS or built-in component chrome — we render our own UI.
    noStyle: true,
    consentCategories: [...(input.categories ?? CONSENT_CATEGORIES)],
    storageConfig: { storageKey: CONSENT_STORAGE_KEY },
    scripts: input.scripts,
  }
}

/**
 * Whether to show the consent banner.
 *
 * @remarks
 * Fail-closed: `consentRequired` is `true`/`false`/`null` (unknown). The banner
 * shows whenever consent is required (or unknown) AND the visitor has not yet
 * made a choice. A confident `false` (not required) suppresses it.
 */
export function shouldShowBanner(input: {
  consentRequired: boolean | null
  hasConsented: boolean
}): boolean {
  return input.consentRequired !== false && !input.hasConsented
}

/**
 * Whether to auto-grant `measurement` (opt-out) before any explicit choice.
 *
 * @remarks
 * Mirrors Brytecore's `getEffectiveConsent(opt-out, isRequired)`: where consent
 * is confidently NOT required, analytics run unconsented — so `measurement` is
 * granted by default. Where required (or unknown), it stays denied until the
 * visitor grants it. An explicit saved choice always wins, so this only applies
 * before the visitor has consented.
 */
export function shouldAutoGrantMeasurement(input: {
  consentRequired: boolean | null
  hasConsented: boolean
}): boolean {
  return !input.hasConsented && input.consentRequired === false
}

/**
 * Whether the banner must re-show after a region change (#103).
 *
 * @remarks
 * The opt-out auto-grant ({@link shouldAutoGrantMeasurement}) calls
 * `setConsent('measurement', true)`, which makes c15t's `hasConsented()` true
 * and so suppresses the banner ({@link shouldShowBanner}). The bug: a visitor
 * auto-granted in an opt-out region who then navigates into a consent-required
 * region never sees the banner — an auto-grant was being treated as an explicit
 * choice. This predicate distinguishes the two: re-prompt only when the current
 * grant is an **auto-grant** (never an explicit save), the visitor is now in a
 * **required** region, and they have **not** made an explicit choice. Explicit
 * choices and stable regions are untouched (returns `false`), preserving the
 * pre-fix behavior for every other case.
 *
 * Pure (inputs only) so it is unit-testable; the caller supplies the markers.
 */
export function shouldRepromptOnRegionChange(input: {
  wasAutoGranted: boolean
  consentRequired: boolean | null
  hasExplicitChoice: boolean
}): boolean {
  return (
    input.wasAutoGranted &&
    input.consentRequired === true &&
    !input.hasExplicitChoice
  )
}

/**
 * Whether a stored consent record must be discarded before c15t reads it
 * (#361): it is an opt-out auto-grant, and this page is not being served to a
 * region where consent is confidently not required.
 *
 * @remarks
 * c15t restores the stored record when its store is created and makes its
 * first script pass on it, with no idea where the visitor is. An auto-grant
 * written where consent is not required would therefore load Google's tag on
 * the first page served to that browser in a consent-required region, before
 * the #103 reprompt in `ConsentSurface` (an effect, so later) could revoke it.
 * The grant was never the visitor's choice, so it is dropped up front and the
 * visitor is asked like anyone arriving fresh.
 *
 * Fail-closed, like the banner ({@link shouldShowBanner}): an unknown region
 * (`null`) discards too. An explicit choice is never touched; it carries no
 * auto-grant marker. Region logic stays in these predicates: this is the
 * inverse reading of {@link shouldAutoGrantMeasurement}'s condition.
 */
export function shouldDiscardStoredAutoGrant(input: {
  wasAutoGranted: boolean
  consentRequired: boolean | null
}): boolean {
  return input.wasAutoGranted && input.consentRequired !== false
}

/**
 * Removes the stored consent record and the auto-grant marker, in both places
 * c15t keeps the record: localStorage and a path-wide cookie of the same name.
 *
 * @remarks Must run before `ConsentManagerProvider` creates its store, which
 * reads both. c15t's own `deleteConsentFromStorage` does this for the
 * configured key (and also clears its legacy default key, which this app has
 * never written), but
 * `c15t` is not a direct dependency of this app and `@c15t/react` does not
 * re-export it. A no-op on the server and where storage is unavailable.
 */
export function discardStoredConsent(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY)
  } catch {
    // Storage unavailable: nothing was restorable from it either.
  }
  document.cookie = `${CONSENT_STORAGE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  setAutoGrantMarker(false)
}

let storedAutoGrantChecked = false

/**
 * Makes this document's one check for a stored auto-grant to drop (#361), and
 * does nothing on every later call.
 *
 * @remarks
 * Called from `ConsentManager` while it builds the provider's options, which
 * is before c15t's store exists the first time and not afterwards: that memo
 * runs again whenever `consentConfig` gets a new identity (the root layout
 * re-rendering; Clerk refreshes the router on sign-in and sign-out), while
 * c15t keeps its store in a module-level cache keyed by settings, not by the
 * options object. A second check would wipe the stored record and the marker
 * underneath a live store that still holds the grant; the next region check
 * would then find a grant with no marker, take it for an explicit choice, and
 * leave Analytics on in a consent-required region.
 *
 * The flag is module state, like c15t's own cache, so a remount cannot re-arm
 * it. A region change inside a visit is the effect's job in `ConsentSurface`,
 * not this check's. A no-op on the server, which has neither storage nor the
 * cookie and does not spend the document's one check.
 */
export function discardStoredAutoGrantOncePerDocument(): void {
  if (typeof document === 'undefined' || storedAutoGrantChecked) return
  storedAutoGrantChecked = true
  if (
    shouldDiscardStoredAutoGrant({
      wasAutoGranted: readAutoGrantMarker(),
      consentRequired: readConsentRequiredCookie(document.cookie),
    })
  ) {
    discardStoredConsent()
  }
}

/**
 * localStorage key marking that the current `measurement` grant came from the
 * opt-out auto-grant, not an explicit visitor choice. Read on a region change
 * to decide {@link shouldRepromptOnRegionChange}; cleared the moment the
 * visitor makes an explicit choice.
 */
export const CONSENT_AUTOGRANT_MARKER_KEY = 'bp-consent-autogrant'

/**
 * Whether THIS document made the automatic grant it is running on (#361).
 *
 * @remarks
 * The stored marker is shared by every tab, but a grant in a running tab
 * lives in that tab's memory. Another tab that loads fresh in a
 * consent-required region drops the shared record and marker
 * ({@link discardStoredAutoGrantOncePerDocument}); without this flag the
 * first tab's next region check would find its own live grant unmarked, take
 * it for an explicit choice, and not revoke it. Set and cleared only by
 * {@link setAutoGrantMarker}, so an explicit choice made in this document
 * clears it like the stored marker. The minimum that keeps the origin of a
 * grant with the document that holds it; a design that carries it in the
 * live consent state may replace it (#375).
 */
let autoGrantedInThisDocument = false

/** Whether a consent record is stored. Unreadable storage reads as none. */
function hasStoredConsentRecord(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Whether the grant this document is running on is an automatic one.
 *
 * @remarks
 * True when the stored marker says so. Also true when this document made the
 * automatic grant itself and no consent record is stored any more: that is
 * the state another tab's fresh-load discard leaves behind, and the grant in
 * this document's memory is still the automatic one. When a record IS stored
 * without a marker, somebody made an explicit choice (in this tab or another)
 * and that choice stands, so this reads `false`, as it did before the flag
 * existed. `false` on the server.
 */
export function readAutoGrantMarker(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY) === '1') {
      return true
    }
  } catch {
    // Storage unavailable: fall through to this document's own memory.
  }
  return autoGrantedInThisDocument && !hasStoredConsentRecord()
}

/**
 * Sets or clears the auto-grant marker, in storage and in this document's
 * memory; the storage half is a no-op where storage is unavailable.
 */
export function setAutoGrantMarker(value: boolean): void {
  if (typeof window === 'undefined') return
  autoGrantedInThisDocument = value
  try {
    if (value) {
      window.localStorage.setItem(CONSENT_AUTOGRANT_MARKER_KEY, '1')
    } else {
      window.localStorage.removeItem(CONSENT_AUTOGRANT_MARKER_KEY)
    }
  } catch {
    // Storage unavailable (private mode, quota) — the stored marker degrades
    // to "no auto-grant recorded", which fails safe: the banner still shows
    // via the normal required-region path when no grant persists.
  }
}

/**
 * Records that the visitor made an explicit consent choice (banner or dialog),
 * so a later region change never mistakes it for an auto-grant. Clearing the
 * auto-grant marker is sufficient: the presence of that marker is what
 * distinguishes an auto-grant from an explicit save.
 */
export function markExplicitConsentChoice(): void {
  setAutoGrantMarker(false)
}
