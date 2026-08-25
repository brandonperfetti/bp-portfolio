import {
  policyPackPresets,
  type ConsentManagerOptions,
  type Theme,
} from '@c15t/react'
import { gtag } from '@c15t/scripts/google-tag'

/**
 * Consent categories offered in the banner/dialog.
 *
 * @remarks
 * `necessary` is always-on and covers the site's only pre-existing cookies —
 * Clerk (auth session) and Cloudflare Turnstile (security) — which consent
 * frameworks exempt. `measurement` gates GA4. No `marketing`/`functional`
 * categories: #83 is analytics-only (no ads/marketing pixels).
 */
export const CONSENT_CATEGORIES = ['necessary', 'measurement'] as const

type ConsentScripts = NonNullable<ConsentManagerOptions['scripts']>

/**
 * GA4 gating — mirrors the repo's Sentry/Turnstile "empty var ⇒ zero code"
 * idiom: no Google code is registered unless a measurement id is present AND
 * the build is production.
 *
 * @remarks
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` is inlined into the client bundle. Scope it
 * to the Vercel **Production** environment only so previews/staging never load
 * GA4. `VERCEL_ENV` is server-only and cannot be read from this client
 * component, so the production-only decision (#83) is enforced by (a) env-var
 * scoping to Production and (b) the `NODE_ENV === 'production'` guard here
 * (which keeps GA4 out of local dev even if the id is set in `.env`). No new
 * env var is introduced, per the locked decision.
 *
 * Kept pure (inputs, not `process.env`) so it is unit-testable.
 */
export function buildConsentScripts(input: {
  measurementId: string | undefined
  isProduction: boolean
}): ConsentScripts {
  const { measurementId, isProduction } = input
  if (!measurementId || !isProduction) return []
  // Prebuilt Google Tag (gtag.js) integration: Consent Mode v2 defaults denied,
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
    isProduction: process.env.NODE_ENV === 'production',
  }
}

/**
 * Maps c15t's theme tokens onto the site's zinc/teal system for BOTH themes.
 *
 * @remarks
 * c15t auto-detects the `.dark` class next-themes sets, so surface/border/text
 * tokens are given as the site's own CSS variables (`--card`, `--border`,
 * `--foreground`, …) and resolve per-theme automatically. The teal accent is
 * given as concrete values identical in both themes — matching the primary
 * `Button` and the `.corvus-surface` precedent (teal-700 fill, white text,
 * same in light and dark). This keeps the consent surface on the site's own
 * token system instead of introducing a second colour scheme, and needs no
 * edit to `tailwind.css`.
 */
const consentColors = {
  primary: '#0f766e', // teal-700 — filled CTA (matches primary Button / Corvus)
  primaryHover: '#0d9488', // teal-600
  textOnPrimary: '#ffffff',
  surface: 'var(--card)',
  surfaceHover: 'var(--secondary)',
  border: 'var(--border)',
  borderHover: 'var(--border)',
  text: 'var(--foreground)',
  textMuted: 'var(--muted-foreground)',
  overlay: 'rgb(0 0 0 / 50%)',
  switchTrack: 'var(--input)',
  switchTrackActive: '#0f766e', // teal-700 — "on" reads as the site accent
  switchThumb: '#ffffff',
} satisfies Theme['colors']

export const consentTheme: Theme = {
  colors: consentColors,
  dark: consentColors,
  radius: {
    sm: 'calc(var(--radius) - 4px)',
    md: 'calc(var(--radius) - 2px)',
    lg: 'var(--radius)',
  },
}

/**
 * Offline-mode policy packs (the locked geo preset triad).
 *
 * @remarks
 * Resolution precedence is region, then country, then fallback, then default
 * (isDefault). With no
 * backend `/init`, offline mode cannot geo-detect a real visitor (location is
 * only ever set via `overrides`), so every visitor resolves via the
 * **fallback** — `europeOptIn()` — which SHOWS the banner with all non-necessary
 * consent DENIED by default. That is conservative and compliant; true
 * per-visitor geo-suppression (e.g. no banner outside required jurisdictions)
 * arrives with the self-host backend fast-follow. `californiaOptOut()` and
 * `worldNoBanner()` only take effect once a real jurisdiction is known.
 */
export function offlinePolicyPacks() {
  return [
    policyPackPresets.europeOptIn(),
    policyPackPresets.californiaOptOut(),
    policyPackPresets.worldNoBanner(),
  ]
}

/**
 * Assembles the `ConsentManagerProvider` options for offline mode.
 *
 * @remarks
 * Kept pure so the assembled shape is unit-testable without a browser.
 * `overrides` is exposed for Storybook/testing (force a jurisdiction) and is
 * left unset in the app so the fallback governs.
 */
export function buildConsentManagerOptions(input: {
  scripts: ConsentScripts
  disableAnimation: boolean
  overrides?: { country?: string; region?: string }
}): ConsentManagerOptions {
  return {
    mode: 'offline',
    offlinePolicy: {
      policyPacks: offlinePolicyPacks(),
    },
    consentCategories: [...CONSENT_CATEGORIES],
    scripts: input.scripts,
    theme: consentTheme,
    // Belt-and-suspenders reduced-motion: c15t's own transitions honour
    // prefers-reduced-motion, and this disables them outright when set.
    disableAnimation: input.disableAnimation,
    trapFocus: true,
    scrollLock: true,
    ...(input.overrides ? { overrides: input.overrides } : {}),
  }
}
