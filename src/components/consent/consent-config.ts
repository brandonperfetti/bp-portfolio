import type { ConsentManagerOptions } from '@c15t/react'
import { gtag } from '@c15t/scripts/google-tag'

import type { C15tCategory } from './consent-content'

/**
 * Consent categories offered in the banner/dialog.
 *
 * @remarks
 * `necessary` is always-on and covers what runs before any choice — Clerk
 * (auth session), Cloudflare Turnstile (security) and Sentry (error reports,
 * outside the banner by #213; #476) — which consent frameworks exempt.
 * `measurement` gates GA4. No `marketing`/`experience` categories: #83 is
 * analytics-only (no ads/marketing pixels).
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
 * Whether to grant `measurement` automatically, before any explicit choice.
 *
 * @remarks
 * Mirrors Brytecore's `getEffectiveConsent(opt-out, isRequired)`: where consent
 * is confidently NOT required, analytics run unconsented, so `measurement` is
 * granted by default. Where required (or unknown), it stays denied until the
 * visitor grants it. An explicit saved choice always wins, so this only applies
 * before the visitor has consented. Since #375 the grant is held in memory
 * only (`automatic-grant.ts`), never saved.
 */
export function shouldAutoGrantMeasurement(input: {
  consentRequired: boolean | null
  hasConsented: boolean
}): boolean {
  return !input.hasConsented && input.consentRequired === false
}

/**
 * Whether an automatic grant must be cleared (#103, #375).
 *
 * @remarks
 * A visitor granted automatically where consent is not required, who moves
 * into a region that asks, must be asked: the grant is cleared in memory and
 * the banner returns. An unreadable region counts as asking (the design's
 * rule 6, signed with it): the banner already shows for an unknown region, so
 * the tag must not run behind it. Only an automatic grant is cleared; an
 * explicit choice (`hasConsented`) never is.
 *
 * Pure (inputs only) so it is unit-testable.
 */
export function shouldClearAutomaticGrant(input: {
  automaticGrantLive: boolean
  consentRequired: boolean | null
  hasConsented: boolean
}): boolean {
  return (
    input.automaticGrantLive &&
    !input.hasConsented &&
    input.consentRequired !== false
  )
}

/**
 * localStorage key production's code set beside an automatic grant it had
 * saved, to tell it from an explicit choice.
 *
 * @remarks
 * Since #375 nothing automatic is saved and new code never sets it. It is
 * still read, by the one-time clean-up (`discardStoredAutomaticGrant`), and
 * still cleared by every explicit choice. It is deliberately **not** deleted
 * by that clean-up: a tab opened before the deploy runs production's code,
 * which reads it to know its own grant is automatic and revoke it.
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

/**
 * Records that the visitor made an explicit consent choice (banner or dialog)
 * by clearing the auto-grant marker, before the choice is saved.
 *
 * @remarks Load-bearing for the one-time clean-up: it deletes a record only
 * beside a marker, so every explicit save must clear the marker first, or a
 * later page would take the choice for production's automatic grant. Pinned
 * by `ConsentManager.histories.test.tsx`.
 */
export function markExplicitConsentChoice(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(CONSENT_AUTOGRANT_MARKER_KEY)
  } catch {
    // Storage unavailable: no marker can exist to clear.
  }
}
