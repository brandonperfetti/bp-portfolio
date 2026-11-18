/**
 * The registrable domains Google's tag and its measurement endpoints are
 * served from (#361), shared by the two layers that keep this suite away from
 * them: the browser-level resolver rule in `playwright.config.ts`, which
 * covers every spec, and the request interceptor in
 * `consent-google-analytics.spec.ts`, which answers them itself.
 *
 * @remarks One list on purpose. While the two layers kept their own, the
 * interceptor knew three domains the resolver rule did not, so a request to
 * one of those from an ordinary spec had neither. `google.com` is here
 * because the real tag reports to it (and to its country domains, which a
 * list of names cannot enumerate; the tag that would contact them is itself
 * unresolvable outside the hand-run live mode).
 */
export const GOOGLE_HOSTS = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'google.com',
] as const

/** The one host gtag.js itself is served from. */
export const TAG_SCRIPT_HOST = 'www.googletagmanager.com'

/**
 * Whether a hostname is one of {@link GOOGLE_HOSTS} or a subdomain of one.
 *
 * @param hostname - A URL's `hostname`, already lower-cased by the URL parser.
 * @returns `true` for an exact match or a name that ends with `.` plus a
 *   listed domain.
 *
 * @remarks String comparison on purpose, not a pattern built from the list:
 * a name such as `notgoogle.com` must not match, and nothing here has to be
 * escaped to make that so.
 */
export const isGoogleHost = (hostname: string): boolean =>
  GOOGLE_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  )
