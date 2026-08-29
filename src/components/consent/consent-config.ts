import type { ConsentManagerOptions } from '@c15t/react'
import { gtag } from '@c15t/scripts/google-tag'

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
 */
export function buildConsentScripts(input: {
  measurementId: string | undefined
  isProduction: boolean
}): ConsentScripts {
  const { measurementId, isProduction } = input
  if (!measurementId || !isProduction) return []
  // Prebuilt Google Tag (gtag.js): Consent Mode v2 defaults denied,
  // `alwaysLoad` (gtag manages its own consent internally — c15t pushes
  // `gtag('consent','default'|'update', …)`), category `measurement`.
  return [gtag({ id: measurementId, category: 'measurement' })]
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
}): ConsentManagerOptions {
  return {
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
 * localStorage key marking that the current `measurement` grant came from the
 * opt-out auto-grant, not an explicit visitor choice. Read on a region change
 * to decide {@link shouldRepromptOnRegionChange}; cleared the moment the
 * visitor makes an explicit choice.
 */
export const CONSENT_AUTOGRANT_MARKER_KEY = 'bp-consent-autogrant'

/** Reads the auto-grant marker; `false` when absent or storage is unavailable. */
export function readAutoGrantMarker(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY) === '1'
  } catch {
    return false
  }
}

/** Sets or clears the auto-grant marker; a no-op where storage is unavailable. */
export function setAutoGrantMarker(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage.setItem(CONSENT_AUTOGRANT_MARKER_KEY, '1')
    } else {
      window.localStorage.removeItem(CONSENT_AUTOGRANT_MARKER_KEY)
    }
  } catch {
    // Storage unavailable (private mode, quota) — the marker degrades to
    // "no auto-grant recorded", which fails safe: the banner still shows via
    // the normal required-region path when no grant persists.
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
