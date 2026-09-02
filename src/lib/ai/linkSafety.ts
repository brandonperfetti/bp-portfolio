import { getSiteUrl } from '@/lib/site'

/**
 * Which links in a Corvus reply are "still on this site" (#144).
 *
 * @remarks streamdown `^2.5.0` guards EVERY link by default — its
 * `Streamdown` defaults are `linkSafety = { enabled: true }` (verified in
 * `node_modules/streamdown/dist/chunk-BO2N2NFS.js`, 2026-09-02) — and the
 * modal it shows is hard-coded external framing: "Open external link?" /
 * "You're about to visit an external website." So the `/tech` citation that
 * grounding (#82) works hard to produce greets the visitor with a warning
 * that it is leaving the site, to go to the site.
 *
 * The fix is NOT `enabled: false`. Corvus is a broad assistant
 * (`CORVUS_SYSTEM_PROMPT`) and legitimately names off-site URLs; those should
 * keep their confirmation. What is wrong is that the guard cannot tell the
 * two apart. `onLinkCheck` is exactly that seam: streamdown awaits it and, on
 * `true`, navigates without the modal.
 *
 * ## Where "this site" comes from
 *
 * {@link getSiteUrl} — the same single source of truth behind canonical/OG
 * URLs (`src/lib/seo/canonical.ts`) and `isExternalHref`
 * (`src/lib/link-utils.ts`), reading `NEXT_PUBLIC_SITE_URL` with a
 * production default. It is deliberately not re-derived and no second host is
 * hard-coded here: a deploy that moves the site moves this predicate with it.
 *
 * The local hosts mirror `link-utils.ts` so a dev-server absolute link
 * behaves the same in both places. `currentHost` is the one addition, and it
 * is a definition rather than a convenience: a link to the host the visitor
 * is already on cannot be "leaving the site", which is what makes preview and
 * staging deploys (where the measured #144 report came from) correct without
 * naming them. The caller passes it — this module stays pure and testable,
 * and nothing here touches `window`.
 */

/** Hosts that always count as this site, whatever host is being served. */
const STATIC_INTERNAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  'localhost:3000',
  '127.0.0.1',
])

/** Prefixes that can only ever address the current document or origin. */
const RELATIVE_PREFIXES = ['/', '#', '?'] as const

/** Options for {@link isInternalCorvusLink}. */
export interface InternalCorvusLinkOptions {
  /**
   * Host currently being served (`window.location.host`), when known.
   *
   * @remarks Omitted on the server and in tests that assert the pure
   * configured-host behaviour.
   */
  currentHost?: string
}

/**
 * Does this href stay on this site?
 *
 * @remarks Conservative by construction: it answers `true` only for things it
 * can positively identify as this site, so anything it cannot parse — a
 * protocol-relative `//evil.example`, a bare `mailto:`, a `javascript:` URL,
 * an empty string — falls through to `false` and keeps its confirmation. A
 * predicate that guesses wrong in the `false` direction costs one extra
 * click; guessing wrong in the `true` direction silently removes the warning
 * this guard exists for.
 *
 * Note `//host/path` is NOT treated as relative even though it starts with
 * `/`: it is a protocol-relative URL to another origin, and the
 * `startsWith('//')` check is what stops the `/` prefix from waving it
 * through.
 *
 * @param href - The link target streamdown is about to open.
 * @param options - See {@link InternalCorvusLinkOptions}.
 * @returns True when the link stays on this site.
 */
export function isInternalCorvusLink(
  href: string | null | undefined,
  options: InternalCorvusLinkOptions = {},
): boolean {
  if (typeof href !== 'string') {
    return false
  }

  const value = href.trim()
  if (value.length === 0) {
    return false
  }

  // Protocol-relative: another origin wearing a leading slash.
  if (value.startsWith('//')) {
    return false
  }

  if (RELATIVE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return true
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    // Not an absolute URL and not one of the relative forms above. Bare
    // `tech` is not something Corvus is asked to emit, and treating an
    // unparseable target as external is the safe direction.
    return false
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false
  }

  return internalHosts(options.currentHost).has(url.host)
}

/**
 * The host set {@link isInternalCorvusLink} matches against.
 *
 * @remarks Rebuilt per call rather than memoised at module scope so a test
 * (or a runtime that reads `NEXT_PUBLIC_SITE_URL` late) sees the current
 * value. The set is three or four short strings; this is not a hot path.
 *
 * @param currentHost - See {@link InternalCorvusLinkOptions.currentHost}.
 * @returns Hosts that count as this site.
 */
function internalHosts(currentHost?: string): ReadonlySet<string> {
  const hosts = new Set(STATIC_INTERNAL_HOSTS)

  try {
    hosts.add(new URL(getSiteUrl()).host)
  } catch {
    // Malformed NEXT_PUBLIC_SITE_URL: keep the local defaults rather than
    // throwing inside a click handler.
  }

  if (currentHost) {
    hosts.add(currentHost)
  }

  return hosts
}

/**
 * The `onLinkCheck` streamdown's `linkSafety` takes.
 *
 * @remarks Returned as a factory so the component builds it once (a new
 * function identity every render would defeat streamdown's memoised link
 * component) and so the `currentHost` read — the one impure thing in this
 * file — happens at exactly one call site.
 *
 * Synchronous on purpose. `LinkSafetyConfig.onLinkCheck` accepts
 * `Promise<boolean> | boolean`; returning a boolean keeps the internal-link
 * click free of a microtask hop, so the navigation stays inside the user
 * gesture.
 *
 * @param options - See {@link InternalCorvusLinkOptions}.
 * @returns A predicate streamdown can call per link click.
 */
export function createCorvusLinkCheck(
  options: InternalCorvusLinkOptions = {},
): (url: string) => boolean {
  return (url: string) => isInternalCorvusLink(url, options)
}
