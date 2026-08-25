import type { ConsentManagerOptions } from '@c15t/react'
import { gtag } from '@c15t/scripts/google-tag'

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
 */
export function buildConsentManagerOptions(input: {
  scripts: ConsentScripts
}): ConsentManagerOptions {
  return {
    mode: 'offline',
    // Emit no c15t CSS or built-in component chrome — we render our own UI.
    noStyle: true,
    consentCategories: [...CONSENT_CATEGORIES],
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
