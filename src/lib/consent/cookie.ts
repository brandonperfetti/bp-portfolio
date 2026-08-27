/**
 * The geo-consent cookie — the authority for whether the consent banner is
 * shown. Written server-side by `src/proxy.ts` from Vercel edge geo, read
 * client-side by the consent UI. Mirrors the Brytecore `cookieConsentRequired`
 * cookie name/semantics.
 */
export const CONSENT_REQUIRED_COOKIE = 'cookieConsentRequired'

/**
 * Parses the `cookieConsentRequired` value into a tristate.
 *
 * @returns `true` (required), `false` (not required), or `null` (unknown —
 *   cookie absent or unrecognized). Callers **fail closed**: treat `null` (and
 *   `true`) as "show the banner"; only a confident `false` suppresses it.
 */
export function parseConsentRequired(
  value: string | undefined | null,
): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

/**
 * Reads {@link CONSENT_REQUIRED_COOKIE} from a raw `document.cookie` string.
 * Returns the same tristate as {@link parseConsentRequired}; `null` when
 * `document` is unavailable (SSR) so the caller fails closed.
 */
export function readConsentRequiredCookie(
  cookieString: string | undefined,
): boolean | null {
  if (!cookieString) return null
  const match = cookieString
    .split('; ')
    .find((c) => c.startsWith(`${CONSENT_REQUIRED_COOKIE}=`))
  if (!match) return null
  return parseConsentRequired(match.slice(CONSENT_REQUIRED_COOKIE.length + 1))
}
