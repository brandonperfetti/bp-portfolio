/**
 * CMS-driven consent copy + category model — the single source of the strings
 * and toggles the banner/dialog render, shared by the server reader
 * (`getCmsConsentConfig`) and the client consent components.
 *
 * @remarks
 * Deliberately dependency-free (no `@c15t/*`, `next`, or `payload` imports) so
 * it crosses the server→client boundary and imports cleanly into the cached
 * reader without dragging client-only code into the RSC bundle. The c15t
 * category names are typed as a local literal union that is a subset of c15t's
 * AllConsentNames (experience, functionality, marketing, measurement,
 * necessary), so the mapping stays valid without importing the type.
 *
 * Behavior contract: {@link DEFAULT_CONSENT_CONFIG} reproduces today's
 * hardcoded copy and today's UX exactly (Essential always-on + Analytics
 * enabled; Social/Advertising OFF). An empty/unseeded `cookie-consent` global
 * therefore renders byte-identically to the pre-CMS banner/dialog.
 */

/** bp's four consent categories (admin/CMS vocabulary). */
export type ConsentCategoryKey =
  'essential' | 'analytics' | 'social' | 'advertising'

/**
 * The subset of c15t's `AllConsentNames` bp maps its categories onto. Kept as a
 * local literal union (not a c15t import) to keep this module dependency-free;
 * assignability to `ConsentManagerOptions['consentCategories']` is enforced
 * where the options object is built.
 */
export type C15tCategory =
  'necessary' | 'measurement' | 'functionality' | 'marketing' | 'experience'

/**
 * Category → c15t consent-name mapping.
 *
 * @remarks
 * - Essential → `necessary`, Analytics → `measurement` (unchanged from #83).
 * - Social → `functionality`: the handoff's "functional" bucket; the valid
 *   c15t name is `functionality` (`experience` was the alternative — chosen
 *   `functionality` to honor the settled decision). Social embeds/widgets are
 *   consent-record-only today (no scripts wired), so the exact bucket is
 *   low-stakes; it only needs to be a valid c15t name.
 * - Advertising → `marketing`: also consent-record-only until pixels exist.
 */
export const CATEGORY_TO_C15T: Record<ConsentCategoryKey, C15tCategory> = {
  essential: 'necessary',
  analytics: 'measurement',
  social: 'functionality',
  advertising: 'marketing',
}

/** A single resolved category row (copy + enable state + c15t mapping). */
export interface ConsentCategoryConfig {
  key: ConsentCategoryKey
  /** c15t consent name this category records under. */
  c15t: C15tCategory
  /** Whether this category is offered at all (Essential is forced-on). */
  enabled: boolean
  /** Whether the switch is a non-editable always-on control (Essential only). */
  alwaysOn: boolean
  title: string
  subtitle: string
}

/** Banner copy + button labels (bp's real buttons). */
export interface ConsentBannerCopy {
  /** Optional lead heading; empty → no heading rendered (today's UX). */
  title: string
  message: string
  /** Inline "cookie details" trigger label. */
  cookieDetailsLabel: string
  acceptAllLabel: string
  rejectNonEssentialLabel: string
  customizeLabel: string
  /** Persistent footer "Manage Cookies" button label. */
  manageCookiesLabel: string
}

/** Manage-dialog copy + button labels. */
export interface ConsentDialogCopy {
  title: string
  description: string
  rejectLabel: string
  saveLabel: string
  acceptAllLabel: string
  /** Optional privacy-policy link text; empty (or no href) → not rendered. */
  privacyPolicyText: string
  /** Resolved privacy-policy page href (from the CMS relation); optional. */
  privacyPolicyHref?: string
}

/** Feature toggles mirrored from the Strapi reference, adapted to bp. */
export interface ConsentFeatures {
  /**
   * Parity/reserved field. bp's headless offline c15t has no automatic script
   * blocking to disable (GA4 is gated via the `scripts` config, not c15t
   * auto-blocking), so this is a **no-op** today — see the pin in
   * `consent-config.test.ts` and `buildConsentManagerOptions`.
   */
  disableAutomaticBlocking: boolean
  /** Gates the banner's "Customize" button. */
  showManageButton: boolean
  /** Gates the persistent footer "Manage Cookies" button. */
  showPersistentCookieButton: boolean
}

/**
 * The fully-resolved, client-ready consent configuration. Plain
 * strings/booleans/arrays only, so it serializes across the RSC boundary.
 * `categories` always carries all four rows; consumers filter to `enabled`.
 */
export interface ConsentConfig {
  banner: ConsentBannerCopy
  dialog: ConsentDialogCopy
  features: ConsentFeatures
  categories: ConsentCategoryConfig[]
}

/**
 * Today's hardcoded copy, verbatim — the behavior-preserving fallback when the
 * `cookie-consent` global is empty/unseeded. Changing these strings changes the
 * empty-CMS default UI, so they are pinned by `consent-config.test.ts`.
 */
export const DEFAULT_CONSENT_CONFIG: ConsentConfig = {
  banner: {
    title: '',
    message:
      'This site uses a cookieless analytics baseline always, and Google Analytics only with your consent.',
    cookieDetailsLabel: 'cookie details',
    acceptAllLabel: 'Accept all',
    rejectNonEssentialLabel: 'Reject non-essential',
    customizeLabel: 'Customize',
    manageCookiesLabel: 'Manage Cookies',
  },
  dialog: {
    title: 'Cookie preferences',
    description:
      'Choose which cookies this site may use. Essential cookies are always on; analytics load only with your consent where consent is required.',
    rejectLabel: 'Reject non-essential',
    saveLabel: 'Save choices',
    acceptAllLabel: 'Accept all',
    privacyPolicyText: '',
    privacyPolicyHref: undefined,
  },
  features: {
    disableAutomaticBlocking: false,
    showManageButton: true,
    showPersistentCookieButton: true,
  },
  categories: [
    {
      key: 'essential',
      c15t: 'necessary',
      enabled: true,
      alwaysOn: true,
      title: 'Strictly necessary',
      subtitle:
        'Sign-in sessions (Clerk) and bot protection (Cloudflare Turnstile). Required for the site to work — always on.',
    },
    {
      key: 'analytics',
      c15t: 'measurement',
      enabled: true,
      alwaysOn: false,
      title: 'Analytics (measurement)',
      subtitle:
        'Google Analytics 4 via Consent Mode v2. Before you grant it, GA sets no cookies; Google still receives an anonymous, cookieless signal. A cookieless Vercel Analytics baseline runs regardless of this choice.',
    },
    {
      key: 'social',
      c15t: 'functionality',
      enabled: false,
      alwaysOn: false,
      title: 'Social media',
      subtitle:
        'Embedded social content and sharing widgets. No social cookies are set today; enabling this only records the consent category.',
    },
    {
      key: 'advertising',
      c15t: 'marketing',
      enabled: false,
      alwaysOn: false,
      title: 'Advertising',
      subtitle:
        'Advertising and marketing cookies. No ad pixels are wired today; enabling this only records the consent category.',
    },
  ],
}

/** The enabled category rows, in declared order (Essential first). */
export function enabledCategories(
  config: ConsentConfig,
): ConsentCategoryConfig[] {
  return config.categories.filter((c) => c.enabled)
}

/**
 * The c15t consent names c15t should track — the enabled categories' mappings,
 * `necessary` always included (Essential is forced-on).
 */
export function enabledC15tCategories(config: ConsentConfig): C15tCategory[] {
  const names = enabledCategories(config).map((c) => c.c15t)
  return names.includes('necessary') ? names : ['necessary', ...names]
}
