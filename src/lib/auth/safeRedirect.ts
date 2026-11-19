/**
 * A base no real page has, used to tell a path from an absolute URL: a value
 * that still resolves to this origin was a path.
 */
const PLACEHOLDER_ORIGIN = 'http://path-only.invalid'

/** C0 controls and DEL. Browsers strip tab and newline from URLs silently. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * The path on this site that a `redirect_url` names, or `null` when it names
 * anything else.
 *
 * @param value - The raw `redirect_url` query value.
 * @param origin - This page's origin (`window.location.origin`). Omit it
 *   where it is not known, such as a server render: only a path is accepted
 *   then.
 * @returns `pathname + search + hash`, always starting with a single `/`.
 *
 * @remarks
 * The custom sign-up form (#377) sends a new member to `redirect_url` after
 * the account is made; Clerk's prebuilt form used to do that itself. An
 * unchecked value would make `/sign-up` an open redirect, so the value is
 * parsed the way a browser parses it and accepted only when it resolves to
 * this origin. That covers the cases a string test misses: `//host`,
 * `/\host` (a backslash is a slash to the URL parser), `javascript:` and a
 * same-origin URL whose path is itself `//host`.
 *
 * Gated articles and Corvus send a path; Clerk may pass the same target on
 * as an absolute URL, which is why a same-origin one is reduced to its path
 * instead of refused.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  origin?: string,
): string | null {
  if (!value || CONTROL_CHARACTERS.test(value)) return null
  const candidate = value.trim()
  if (!candidate) return null

  let url: URL
  try {
    url = new URL(candidate, PLACEHOLDER_ORIGIN)
  } catch {
    return null
  }

  const isPath = url.origin === PLACEHOLDER_ORIGIN && candidate.startsWith('/')
  const isSameOrigin = origin !== undefined && url.origin === origin
  if (!isPath && !isSameOrigin) return null

  // `https://this.site//host` parses to the path `//host`, which a router
  // would follow as a protocol-relative URL.
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
    return null
  }
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * `path?redirect_url=…` when there is a target to carry, else `path`.
 *
 * @param path - A route on this site, such as `/sign-in`.
 * @param target - A value {@link safeRedirectPath} returned, or `null`.
 */
export function withRedirect(path: string, target: string | null): string {
  return target ? `${path}?redirect_url=${encodeURIComponent(target)}` : path
}
