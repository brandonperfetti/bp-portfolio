/** Longest error message that may reach a log line. */
const MAX_LOGGED_ERROR_LENGTH = 300

/**
 * Reduce an unknown thrown value to a short, safe string for a log field.
 *
 * @param error - Anything a `catch` block caught.
 * @returns The error's message truncated to 300 characters, or `'unknown'`
 * when the thrown value is not an `Error`.
 *
 * @remarks Extracted from the Clerk webhook, where it was a local helper named
 * `reason()` — a name that described neither the bound nor the fallback. Both
 * matter at the call sites: an upstream SDK can throw an `Error` whose message
 * embeds an entire response body, and an unbounded `console.error` field turns
 * one bad delivery into a log-ingestion bill. Non-`Error` throws collapse to a
 * constant rather than being stringified, because `String(value)` on an
 * arbitrary rejection is how a credential or a whole request payload ends up
 * in a log.
 */
export function boundedErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, MAX_LOGGED_ERROR_LENGTH)
    : 'unknown'
}
