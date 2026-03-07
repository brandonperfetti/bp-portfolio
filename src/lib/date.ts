/**
 * Returns true when the provided date resolves to a future timestamp.
 *
 * Timezone semantics:
 * - Date-only values (`YYYY-MM-DD`) are interpreted as editorial-local midnight.
 * - Full datetime values (with time/offset) are parsed as-is by `Date.parse`.
 *
 * Invalid/unparseable values return false to avoid accidentally hiding content.
 */
export function isFuturePublicationDate(dateValue: string) {
  const trimmed = dateValue.trim()
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const timestamp = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        0,
        0,
        0,
        0,
      ).getTime()
    : Date.parse(trimmed)
  if (Number.isNaN(timestamp)) {
    return false
  }
  return timestamp > Date.now()
}
