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

/** Matches a hostname that is one of {@link GOOGLE_HOSTS} or a subdomain. */
export const GOOGLE_HOST_PATTERN = new RegExp(
  `(^|\\.)(${GOOGLE_HOSTS.map((host) => host.replace(/\./g, '\\.')).join('|')})$`,
)
