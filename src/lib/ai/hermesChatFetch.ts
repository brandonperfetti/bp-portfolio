/**
 * Custom `fetch` for HermesChat's `DefaultChatTransport` (mobile-staging fix
 * to #74, addendum 2).
 *
 * @remarks Why this exists: the original client-side detection matched
 * `error.message.includes('sign_in_required')`, on the premise that the AI
 * SDK's `HttpChatTransport.sendMessages` throws
 * `new Error(await response.text())` for every non-ok response — so the
 * route's `{ code: 'sign_in_required' }` JSON body would end up verbatim in
 * `error.message`. That held in jsdom (mocked `fetch`) and in the Storybook
 * play-function stories, but Brandon hit the gate on real mobile Safari
 * staging and got the GENERIC red error instead of the sign-in prompt — the
 * route's 401 was clean (zero Sentry 500s for the endpoint), so the body
 * text did not reliably end up in `error.message` the way the stubs implied.
 *
 * Rather than chase the exact runtime discrepancy in the SDK's internals,
 * this reads the gate's JSON body OURSELVES, ahead of the SDK transport, and
 * throws a value the SDK can only pass through unmodified — removing the
 * SDK's own error-message surfacing from the trust chain entirely.
 * `HermesChat.tsx`'s `isSignInRequiredError` keeps matching
 * `error.message.includes(SIGN_IN_REQUIRED_CODE)` — now against a message
 * WE control, not whatever the transport happened to do with the body text.
 *
 * Every other response — streaming 200s, the 429 rate-limit JSON, any other
 * status, and any 401 that ISN'T this specific gate shape — passes through
 * completely untouched, `init` included: whatever credentials policy the
 * transport set (same-origin default, which already carries the Clerk
 * session cookie for signed-in users) is preserved unchanged, since we never
 * modify `init` before forwarding it.
 */

export const SIGN_IN_REQUIRED_CODE = 'sign_in_required'

type FetchLike = typeof fetch

/**
 * Builds the wrapped `fetch`. Takes an injectable `baseFetch` (defaulting to
 * a fresh call to the global `fetch` — resolved at CALL time, not captured
 * at creation time, so reassigning `window.fetch`/`global.fetch` in a test
 * or story before triggering a request still takes effect) so the wrapper
 * itself can be unit-tested without a real network.
 */
export function createHermesChatFetch(
  baseFetch: FetchLike = (...args: Parameters<FetchLike>) => fetch(...args),
): FetchLike {
  return async (input, init) => {
    const response = await baseFetch(input, init)

    if (response.status === 401) {
      let code: unknown
      try {
        // Clone: if this 401 isn't our gate's shape, the real transport
        // still needs an unread body to fall back to its own handling.
        const parsedBody: unknown = await response.clone().json()
        code =
          parsedBody && typeof parsedBody === 'object' && 'code' in parsedBody
            ? (parsedBody as { code?: unknown }).code
            : undefined
      } catch {
        // Not JSON (or already consumed) — not our gate's shape either way.
        code = undefined
      }
      if (code === SIGN_IN_REQUIRED_CODE) {
        throw new Error(SIGN_IN_REQUIRED_CODE)
      }
    }

    return response
  }
}
