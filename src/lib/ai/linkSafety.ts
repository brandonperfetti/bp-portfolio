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
 * the two apart, and this predicate is the definition that does.
 *
 * #144 fed it to streamdown's `linkSafety.onLinkCheck`, which removed the
 * modal from internal links but left them rendering as a `<button>` that
 * `window.open`s a new tab. #158 replaces streamdown's link component
 * outright (`components.a` in `CorvusChat.tsx`), so the same predicate now
 * decides between a real same-tab `<a href>` and our own confirmation — see
 * {@link classifyCorvusLink}. Nothing about what counts as "this site"
 * changed with it, which is why every case below is still the #144 case.
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
 * than silently opening a mail client. Under #144 the trade was a modal whose
 * copy said "external website" for a `mailto:` — judged the safer error, but
 * an error. {@link classifyCorvusLink} pays that back: the answer to "may it
 * skip the prompt" is still no, and the prompt now says what it really does.
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
 * The href streamdown emits for a link whose markdown has not finished
 * streaming (`parseIncompleteMarkdown`).
 *
 * @remarks Not a URL and never navigable. streamdown's own link component
 * carries the same sentinel as `data-incomplete` and refuses to act on a
 * click; {@link classifyCorvusLink} names it so our replacement component
 * (#158) can do the same instead of classifying `streamdown:` as a hostile
 * scheme and offering to open it.
 */
export const STREAMDOWN_INCOMPLETE_LINK = 'streamdown:incomplete-link'

/**
 * What kind of destination a link in a Corvus reply points at (#158).
 *
 * @remarks Four kinds, because the visitor-facing consequence differs for
 * each and the confirmation copy has to be honest about which one they are
 * about to get:
 *
 * - `internal` — this site. Navigates in the same tab, no confirmation.
 * - `mailto` / `tel` — a hand-off to another application on the visitor's
 *   device. Confirmed, but "You're about to visit an external website" was a
 *   lie about both (#158 item c); they get their own copy.
 * - `external` — a genuinely off-site page. Confirmed, new tab.
 *
 * `incomplete` is not a destination at all — see
 * {@link STREAMDOWN_INCOMPLETE_LINK}.
 */
export type CorvusLinkKind =
  'internal' | 'external' | 'mailto' | 'tel' | 'incomplete'

/**
 * Classify a link target in a Corvus reply.
 *
 * @remarks Built ON {@link isInternalCorvusLink} rather than beside it: that
 * predicate is the conservative "is this definitely this site" answer and
 * stays the only place the host rules live. This function adds exactly one
 * thing — telling the three flavours of "not this site" apart, so the
 * confirmation can say something true. Anything it cannot positively identify
 * as `mailto:`/`tel:` is `external`, which keeps the fall-through direction
 * the same as the predicate's: unknown means confirm.
 *
 * @param href - The link target.
 * @param options - See {@link InternalCorvusLinkOptions}.
 * @returns The link's kind.
 */
export function classifyCorvusLink(
  href: string | null | undefined,
  options: InternalCorvusLinkOptions = {},
): CorvusLinkKind {
  const value = typeof href === 'string' ? href.trim() : ''

  if (value === STREAMDOWN_INCOMPLETE_LINK) return 'incomplete'
  if (isInternalCorvusLink(value, options)) return 'internal'

  // Scheme sniffed off the raw string rather than through `new URL`, because
  // `mailto:`/`tel:` are opaque-path URLs: `new URL('tel:+15550100').protocol`
  // is `tel:` but `.host` is empty, so nothing downstream would use the parse.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  if (scheme === 'mailto') return 'mailto'
  if (scheme === 'tel') return 'tel'

  return 'external'
}
