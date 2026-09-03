import { isInternalHost } from '@/lib/link-utils'

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
 * Does this href in a Corvus reply stay on this site? (#144)
 *
 * @remarks streamdown `^2.5.0` guards EVERY link by default — its
 * `Streamdown` defaults are `linkSafety = { enabled: true }` (verified in
 * `node_modules/streamdown/dist/chunk-BO2N2NFS.js`, 2026-09-02) — and the
 * modal it shows is hard-coded external framing: "Open external link?" /
 * "You're about to visit an external website." So the `/tech` citation that
 * grounding (#82) works hard to produce greeted the visitor with a warning
 * that it was leaving the site, to go to the site.
 *
 * The fix is NOT `enabled: false`. Corvus is a broad assistant
 * (`CORVUS_SYSTEM_PROMPT`) and legitimately names off-site URLs; those should
 * keep their confirmation. What was wrong is that the guard could not tell
 * the two apart. `onLinkCheck` is exactly that seam: streamdown awaits it
 * and, on `true`, navigates without the modal.
 *
 * ## Where "this site" comes from
 *
 * {@link isInternalHost} in `src/lib/link-utils.ts` — the single shared
 * definition, so the site chrome and Corvus cannot drift apart. Nothing is
 * hard-coded here. `currentHost` is this module's one addition, and it is a
 * definition rather than a convenience: a link to the host the visitor is
 * already on cannot be "leaving the site", which is what makes preview and
 * staging deploys (where the measured #144 report came from) correct without
 * naming them. The caller passes it — this module stays pure, and nothing
 * here touches `window`.
 *
 * ## Where this deliberately DIFFERS from `isExternalHref`
 *
 * `isExternalHref` treats `mailto:` and `tel:` as internal, because its job
 * is deciding whether site chrome needs `target="_blank"` and a mail or
 * dialer link does not. This predicate answers a different question — may
 * this link skip a safety confirmation? — and answers `false` for every
 * non-`http(s)` scheme, so a `mailto:` Corvus emits keeps its prompt rather
 * than silently opening a mail client. The trade is a modal whose copy says
 * "external website" for a `mailto:`, which is judged the safer error: the
 * system prompt forbids inventing links and tells Corvus to name the contact
 * form in words, so this is rare by construction.
 *
 * Conservative in the same direction throughout: it answers `true` only for
 * what it can positively identify as this site, so anything unparseable — a
 * protocol-relative `//evil.example`, a `javascript:` URL, an empty string —
 * falls through to `false` and keeps its confirmation. Guessing wrong toward
 * `false` costs one extra click; guessing wrong toward `true` silently
 * removes the warning this guard exists for.
 *
 * Note `//host/path` is NOT treated as relative even though it starts with
 * `/`: it is a protocol-relative URL to another origin, and the leading-slash
 * check is what stops the `/` prefix waving it through.
 *
 * That check has to read a **backslash** as a second slash. WHATWG URL
 * parsing treats `\` as a path separator for special schemes, so
 * `new URL('/\\evil.example/x', 'https://brandonperfetti.com/corvus').href` is
 * `https://evil.example/x` `[measured, node 22]` — `/\evil.example/x` is
 * protocol-relative in every browser, wearing a disguise a `startsWith('//')`
 * test cannot see. A leading `/` followed by `/` **or** `\` is therefore
 * rejected. A bare leading `\` (`\\evil.example`) needs no special case: it
 * matches none of {@link RELATIVE_PREFIXES}, so `new URL` throws on it and the
 * catch already answers `false` — pinned by test so it stays that way.
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

  // Protocol-relative: another origin wearing a leading slash. `\` counts as
  // the second slash — WHATWG resolves `/\evil.example/x` to `//evil.example/x`.
  if (/^\/[/\\]/.test(value)) {
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

  if (options.currentHost && url.host === options.currentHost) {
    return true
  }

  return isInternalHost(url.host)
}

/**
 * The `onLinkCheck` streamdown's `linkSafety` takes.
 *
 * @remarks Returned as a factory so the component builds it once (a new
 * function identity every render would defeat streamdown's memoised link
 * component) and so the `currentHost` read — the one impure input — happens
 * at exactly one call site.
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
