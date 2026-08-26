import type { CookieConsent } from '@/payload-types'

import {
  type ConsentCategoryKey,
  type ConsentConfig,
  DEFAULT_CONSENT_CONFIG,
} from './consent-content'

/** Empty/blank string → the provided default; a non-blank CMS value wins. */
function str(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback
}

/**
 * Merges the Payload `cookie-consent` global over {@link DEFAULT_CONSENT_CONFIG}
 * into the client-ready {@link ConsentConfig}.
 *
 * @remarks
 * Pure and dependency-free (no `next`/`payload` runtime) so it is unit-testable:
 * `null` (unseeded global) returns the defaults verbatim — today's copy and UX —
 * and a partial global fills only the fields it sets. Boolean toggles use
 * nullish coalescing so an explicit `false` is honored; strings use blank →
 * default. The optional privacy-policy page relation (populated at `depth: 1`)
 * is resolved to `/{slug}` (pages are served at that route).
 *
 * @param global - The fetched global, or `null` when unseeded/unavailable.
 */
export function resolveConsentConfig(
  global: CookieConsent | null,
): ConsentConfig {
  const defaults = DEFAULT_CONSENT_CONFIG
  const banner = global?.banner
  const dialog = global?.dialog
  const features = global?.features
  const cats = global?.categories

  const ppPage = banner?.privacyPolicyPage
  const privacyPolicyHref =
    ppPage && typeof ppPage === 'object' && 'slug' in ppPage && ppPage.slug
      ? `/${ppPage.slug}`
      : undefined

  const categoryCopy = (
    key: ConsentCategoryKey,
  ): { title: string; subtitle: string } => {
    const d = defaults.categories.find((c) => c.key === key)!
    const src = cats?.[key]
    return {
      title: str(src?.title, d.title),
      subtitle: str(src?.subtitle, d.subtitle),
    }
  }

  return {
    banner: {
      // Optional heading; empty is meaningful (bp's banner is title-less by
      // default), so it is passed through as-is rather than defaulted.
      title: banner?.title ?? defaults.banner.title,
      message: str(banner?.message, defaults.banner.message),
      cookieDetailsLabel: str(
        banner?.cookieDetailsLabel,
        defaults.banner.cookieDetailsLabel,
      ),
      acceptAllLabel: str(
        banner?.acceptAllLabel,
        defaults.banner.acceptAllLabel,
      ),
      rejectNonEssentialLabel: str(
        banner?.rejectNonEssentialLabel,
        defaults.banner.rejectNonEssentialLabel,
      ),
      customizeLabel: str(
        banner?.customizeLabel,
        defaults.banner.customizeLabel,
      ),
    },
    dialog: {
      title: str(dialog?.title, defaults.dialog.title),
      description: str(dialog?.description, defaults.dialog.description),
      rejectLabel: str(dialog?.rejectLabel, defaults.dialog.rejectLabel),
      saveLabel: str(dialog?.saveLabel, defaults.dialog.saveLabel),
      acceptAllLabel: str(
        dialog?.acceptAllLabel,
        defaults.dialog.acceptAllLabel,
      ),
      privacyPolicyText: str(
        banner?.privacyPolicyText,
        defaults.dialog.privacyPolicyText,
      ),
      privacyPolicyHref,
    },
    features: {
      // Reserved no-op in bp's headless offline c15t (see
      // buildConsentManagerOptions); read for parity.
      disableAutomaticBlocking:
        features?.disableAutomaticBlocking ??
        defaults.features.disableAutomaticBlocking,
      showManageButton:
        features?.showManageButton ?? defaults.features.showManageButton,
      showPersistentCookieButton:
        features?.showPersistentCookieButton ??
        defaults.features.showPersistentCookieButton,
    },
    categories: [
      {
        key: 'essential',
        c15t: 'necessary',
        enabled: true, // forced-on, non-editable
        alwaysOn: true,
        ...categoryCopy('essential'),
      },
      {
        key: 'analytics',
        c15t: 'measurement',
        enabled: cats?.analytics?.enabled ?? true,
        alwaysOn: false,
        ...categoryCopy('analytics'),
      },
      {
        key: 'social',
        c15t: 'functionality',
        enabled: cats?.social?.enabled ?? false,
        alwaysOn: false,
        ...categoryCopy('social'),
      },
      {
        key: 'advertising',
        c15t: 'marketing',
        enabled: cats?.advertising?.enabled ?? false,
        alwaysOn: false,
        ...categoryCopy('advertising'),
      },
    ],
  }
}
