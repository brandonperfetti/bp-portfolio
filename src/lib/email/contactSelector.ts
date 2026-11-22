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
 * becomes `reader$[email]`. So only `+` and the last `@` are put back (a
 * plus address is common, and the capture path always sent it literally),
 * and the marks `encodeURIComponent` leaves alone are escaped too; `'` stays,
 * which the redactor knows. An earlier `@`, as in a quoted local part
 * (`"a@b"@example.test`), stays `%40`: literal, it would end the redactor's
 * match there. The escapes are all valid in a path segment.
 *
 * Use it only where the address becomes a path: `contacts.get`, `update`,
 * `remove` and `segments.*` by email. A create sends the address in a JSON
 * body, which must carry it as given.
 */
export function contactSelector(email: string): string {
  const escaped = encodeURIComponent(email)
    .replace(
      UNESCAPED_MARKS,
      (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%2B/g, '+')
  const at = escaped.lastIndexOf('%40')
  return at < 0 ? escaped : `${escaped.slice(0, at)}@${escaped.slice(at + 3)}`
}
