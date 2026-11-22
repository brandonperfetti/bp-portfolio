/** Escapes put back: `@` and `+`, which a path segment carries as they are. */
const KEPT = /%(?:40|2B)/g

/** Marks `encodeURIComponent` leaves unescaped and the redactor does not know. */
const UNESCAPED_MARKS = /[!*()~]/g

/**
 * An email address as the selector of a Resend contact call, which the SDK
 * puts into the request path (`/contacts/<email>`, `/contacts/<email>/segments`)
 * without encoding it (`resend@6.18.1`) (#418).
 *
 * @param email - The address, as the visitor gave it.
 * @returns The address as one encoded path segment.
 *
 * @remarks A `#`, `?` or `/` is valid in an address's local part, and sent
 * raw it would end the path early, so `reader#tag@example.test` looked up
 * `/contacts/reader`: another contact, or none.
 *
 * **Every character it leaves literal is one Sentry's redactor matches.**
 * The path reaches Sentry's `http` breadcrumbs and spans, and
 * `redactEmailAddresses` (`sentryConfig.ts`) matches a local part of letters,
 * digits, `%` and `._+'-` only. Anything else sent literally would split the
 * match and leave the start of the address in the event: `reader$tag@…`
 * becomes `reader$[email]`. So only `@` and `+` are put back (a plus address
 * is common, and goes out as it did before), and the marks
 * `encodeURIComponent` leaves alone are escaped too; `'` stays, which the
 * redactor knows. The escapes are all valid in a path segment.
 *
 * Use it only where the address becomes a path: `contacts.get`, `update`,
 * `remove` and `segments.*` by email. A create sends the address in a JSON
 * body, which must carry it as given.
 */
export function contactSelector(email: string): string {
  return encodeURIComponent(email)
    .replace(
      UNESCAPED_MARKS,
      (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(KEPT, (escaped) => decodeURIComponent(escaped))
}
