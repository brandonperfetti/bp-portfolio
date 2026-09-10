/**
 * A random, per-tab id handed to `Sentry.setUser({ id })` so an issue's
 * "Users impacted" counts distinct **sessions** instead of reading 0
 * forever (#213).
 *
 * @remarks
 * **Why this exists.** #168 decided Sentry stays anonymous, which leaves
 * every issue at `Users impacted: 0` — a constant, not a measurement. The
 * question triage actually needs answered is *one person hitting this
 * repeatedly, or many people hitting it once?*, and a random id answers it
 * without identifying anybody.
 *
 * **What Release Health already gave us, and what it didn't**
 * `[source: docs.sentry.io/platforms/javascript/guides/nextjs/configuration/releases#sessions]`:
 * the browser SDK sends a session on every page load by default (the
 * `BrowserSession` integration, which nothing in `instrumentation-client.ts`
 * removes), so crash-free **sessions per release** were already available.
 * But per-issue "Users impacted" — and per-release user adoption — derive
 * from the `user` on events, which nothing set. Hence this module.
 *
 * **Storage: `sessionStorage`, per tab.** It is the strictest reading of
 * "session": the id dies when the tab closes, so it answers *how many
 * distinct visits hit this error*, and it cannot accumulate a history of a
 * returning visitor. `localStorage` would answer a different question
 * ("how many distinct browsers") and would carry a heavier privacy story
 * for no triage gain at this site's volume. Two tabs are two sessions on
 * purpose.
 *
 * **Provably not derived from the visitor.** {@link createSessionId} is a
 * zero-argument function whose only input is `crypto.randomUUID()` — no
 * UA, no IP, no Clerk id, no timestamp, no seed. There is no function of
 * visitor attributes that produces it, so it cannot be worked backwards by
 * anyone, Brandon included. `crypto.randomUUID` is required rather than
 * polyfilled: a fallback would be the one place a derived value could
 * creep in, so where it is unavailable this module returns `undefined` and
 * no user is set at all. The test injects a crypto stub through
 * {@link createSessionIdFrom} rather than through the public generator,
 * precisely so the public one keeps an empty parameter list and the claim
 * stays checkable rather than merely written down.
 */

/**
 * `sessionStorage` key. Namespaced so it is obviously ours in devtools and
 * cannot collide with a third-party script's key.
 */
export const SENTRY_SESSION_ID_STORAGE_KEY = 'bp.sentry.sessionId'

/** Shape of `crypto` this module needs — keeps the tests honest in jsdom. */
type RandomUuidSource = { randomUUID?: () => string }

/**
 * The generator's body, with the crypto source as an explicit argument.
 *
 * @remarks
 * Exported for the test that proves the "no `randomUUID` available" branch
 * without giving {@link createSessionId} a parameter. **Not a seam for
 * callers**: application code calls `createSessionId()` and nothing else,
 * so there is no argument through which a visitor attribute could enter
 * the shipped path.
 *
 * @param source - Crypto implementation to read `randomUUID` from.
 * @returns A v4 UUID, or `undefined` when `source` has no `randomUUID` —
 * never a derived or lower-entropy substitute.
 */
export function createSessionIdFrom(
  source: RandomUuidSource | undefined,
): string | undefined {
  return typeof source?.randomUUID === 'function'
    ? source.randomUUID()
    : undefined
}

/**
 * Mint a fresh session id.
 *
 * @remarks
 * Takes no arguments at all — every byte comes from the platform CSPRNG.
 * That empty parameter list is the point and is asserted by test: a
 * function with nowhere to put an input cannot encode anything about the
 * person at the browser.
 *
 * @returns A v4 UUID, or `undefined` where `crypto.randomUUID` is
 * unavailable.
 */
export function createSessionId(): string | undefined {
  return createSessionIdFrom(globalThis.crypto)
}

/**
 * Whether a diagnostics session id may be written to browser storage.
 *
 * @remarks
 * **The consent gate, deliberately one function and one line.** The site
 * runs a jurisdiction-aware c15t banner (`docs/ANALYTICS.md`), and Sentry
 * currently sits **outside** it because its events carry no identity. The
 * shipped position keeps it outside: a random per-tab id is not identity,
 * is not linkable to a person or to a second visit, and exists only to
 * make an error report interpretable — strictly-necessary diagnostics
 * rather than measurement. That is Brandon's call to confirm, not this
 * module's; the entire decision is this function's return value, so moving
 * Sentry inside consent means changing this body to read the c15t
 * `measurement` (or a new diagnostics) consent state, and nothing else
 * moves.
 *
 * @returns `true` while diagnostics sit outside the consent banner.
 */
export function isSessionIdAllowed(): boolean {
  return true
}

/**
 * The session id for this tab, minting and persisting one on first call.
 *
 * @remarks
 * Every failure mode returns `undefined` rather than throwing or
 * inventing a value: `sessionStorage` access throws outright in some
 * privacy modes and embedded contexts, and a Sentry init must never be the
 * reason a page fails to boot.
 *
 * @param storage - Storage to use; defaults to `globalThis.sessionStorage`.
 * @returns A stable-per-tab v4 UUID, or `undefined` when storage or
 * `crypto.randomUUID` is unavailable, or when
 * {@link isSessionIdAllowed} is false.
 */
export function getOrCreateSessionId(
  storage: Storage | undefined = globalThis.sessionStorage,
): string | undefined {
  if (!isSessionIdAllowed() || !storage) return undefined

  try {
    const existing = storage.getItem(SENTRY_SESSION_ID_STORAGE_KEY)
    if (existing) return existing

    const created = createSessionId()
    if (!created) return undefined

    storage.setItem(SENTRY_SESSION_ID_STORAGE_KEY, created)
    return created
  } catch {
    // Storage disabled (Safari private mode, partitioned third-party
    // context, a browser configured to block site data). No id, no user,
    // no error — issues simply keep reading 0 users for that visitor.
    return undefined
  }
}
