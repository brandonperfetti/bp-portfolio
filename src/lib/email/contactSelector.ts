/**
 * Characters `encodeURIComponent` escapes that are valid, unescaped, in a URL
 * path segment: RFC 3986 `pchar` keeps `@`, `:` and the sub-delimiters.
 */
const SEGMENT_SAFE = /%(?:24|26|2B|2C|3A|3B|3D|40)/g

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
 * `/contacts/reader`: another contact, or none. Only the characters a path
 * segment cannot carry are escaped. `@`, `+` and the other sub-delimiters
 * stay literal, so every address that reached the right contact before sends
 * the same request as before.
 *
 * Use it only where the address becomes a path: `contacts.get`, `update`,
 * `remove` and `segments.*` by email. A create sends the address in a JSON
 * body, which must carry it as given.
 */
export function contactSelector(email: string): string {
  return encodeURIComponent(email).replace(SEGMENT_SAFE, (escaped) =>
    decodeURIComponent(escaped),
  )
}
