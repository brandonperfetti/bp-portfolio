/**
 * Consent-jurisdiction table — the geo authority for whether a cookie-consent
 * banner is legally required for a visitor.
 *
 * @remarks
 * This replaces the c15t self-host backend / GeoIP service with a static table
 * driven by Vercel's edge geo headers (`x-vercel-ip-country`,
 * `x-vercel-ip-country-region`). It mirrors the Brytecore production pattern
 * (a middleware decision written to a `cookieConsentRequired` cookie), sourced
 * from Brandon's `bc-sites-api` scope (2026-08-25). Keep the two sets below as
 * the single source of truth — they are a legal/scope decision, updatable here.
 *
 * FOOTGUN: `CA` is **California** as a US *subdivision* but **Canada** as a
 * *country*. Country codes are matched only against {@link EU_EEA_UK_COUNTRIES}
 * and subdivision codes only against {@link CONSENT_REQUIRED_SUBDIVISIONS} —
 * the two are never cross-matched.
 */

/**
 * Country-level required jurisdictions (ISO-3166-1 alpha-2): EU-27 + EEA
 * (IS, LI, NO) + UK (GB). Switzerland (CH) is intentionally omitted unless
 * Brandon adds it.
 */
export const EU_EEA_UK_COUNTRIES: ReadonlySet<string> = new Set([
  // EU-27
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // EEA (non-EU)
  'IS',
  'LI',
  'NO',
  // UK
  'GB',
])

/**
 * Subdivision-level required jurisdictions (region/subdivision codes): the
 * `bc-sites-api` set of US states with consumer-privacy laws, plus Québec.
 * Matched against `x-vercel-ip-country-region` (uppercased).
 */
export const CONSENT_REQUIRED_SUBDIVISIONS: ReadonlySet<string> = new Set([
  // US states (privacy laws)
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'IN',
  'IA',
  'KY',
  'MD',
  'MN',
  'MT',
  'NE',
  'NH',
  'NJ',
  'OK',
  'OR',
  'RI',
  'TN',
  'TX',
  'UT',
  'VA',
  // Canada — Québec (Law 25)
  'QC',
])

/** Vercel edge geo, as read from request headers (either may be absent). */
export interface VisitorGeo {
  /** `x-vercel-ip-country` (ISO-3166-1 alpha-2), or null/undefined if absent. */
  country?: string | null
  /** `x-vercel-ip-country-region` (subdivision code), or null/undefined. */
  region?: string | null
}

/**
 * Decides whether cookie consent is legally required for a visitor.
 *
 * @remarks
 * Required when the country is in {@link EU_EEA_UK_COUNTRIES} OR the subdivision
 * is in {@link CONSENT_REQUIRED_SUBDIVISIONS}. **Fail-closed:** when no geo
 * signal is present at all (both country and region absent — e.g. local dev or
 * geo unavailable), consent is treated as required so the banner shows. Country
 * and subdivision codes are matched against their own sets only (see FOOTGUN).
 *
 * @returns `true` if consent is required (show the banner), else `false`.
 */
export function requiresConsent(geo: VisitorGeo): boolean {
  const country = geo.country?.trim().toUpperCase() || ''
  const region = geo.region?.trim().toUpperCase() || ''

  // Fully unknown geo → fail closed (required).
  if (!country && !region) return true

  if (region && CONSENT_REQUIRED_SUBDIVISIONS.has(region)) return true
  if (country && EU_EEA_UK_COUNTRIES.has(country)) return true

  return false
}
