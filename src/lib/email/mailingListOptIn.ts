/**
 * The mailing-list opt-in shared by the two places that ask for it: the
 * contact form and the sign-up screen (#362).
 *
 * @remarks
 * Free of server and Clerk imports on purpose, so the sign-up client
 * component, the contact form and the Clerk webhook can all read the same
 * label and the same key.
 */

/**
 * What the checkbox says, in both places. One string so the two forms that
 * feed one list cannot drift into asking for different things.
 */
export const MAILING_LIST_OPT_IN_LABEL =
  'Keep me posted when new articles are published. Unsubscribe anytime.'

/**
 * The key the sign-up screen writes into Clerk's `unsafeMetadata`, and the
 * webhook reads back from the created user's `unsafe_metadata`.
 */
export const MAILING_LIST_OPT_IN_KEY = 'mailingListOptIn'

/**
 * Whether a Clerk user's `unsafe_metadata` records a mailing-list opt-in.
 *
 * @param unsafeMetadata - The `unsafe_metadata` value from a `user.*` webhook
 *   payload: untyped JSON, so anything.
 * @returns `true` only for an object whose opt-in key is the boolean `true`.
 *
 * @remarks
 * Fail-closed. Consent is a ticked box and nothing else, so a missing field, a
 * truthy string or number, `null`, an array or a non-object all read as "did
 * not opt in". That is also the answer for every account that never saw the
 * box: one created through a social sign-in on `/sign-in`, in the Clerk
 * dashboard, or before the box existed.
 *
 * `unsafe_metadata` is writable by the signed-in user from the browser, which
 * is why Clerk calls it unsafe. It is the right field here for the same
 * reason: the only thing a visitor can do with it is opt themselves in or
 * out. Never read an entitlement from it.
 */
export function hasMailingListOptIn(unsafeMetadata: unknown): boolean {
  if (
    unsafeMetadata === null ||
    typeof unsafeMetadata !== 'object' ||
    Array.isArray(unsafeMetadata)
  ) {
    return false
  }
  return (
    (unsafeMetadata as Record<string, unknown>)[MAILING_LIST_OPT_IN_KEY] ===
    true
  )
}
