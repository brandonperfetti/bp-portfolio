function parseEditorialDate(value: string): Date | undefined {
  const trimmed = value.trim()
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const parsed = dateOnly
    ? (() => {
        const year = Number(dateOnly[1])
        const month = Number(dateOnly[2])
        const day = Number(dateOnly[3])
        if (month < 1 || month > 12) return undefined

        const monthIndex = month - 1
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
        if (day < 1 || day > daysInMonth) return undefined

        return new Date(year, monthIndex, day, 0, 0, 0, 0)
      })()
    : new Date(trimmed)

  if (!parsed) return undefined
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

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
  const parsed = parseEditorialDate(dateValue)
  if (!parsed) {
    return false
  }
  return parsed.getTime() > Date.now()
}

/**
 * Parses an optional date string and returns a valid Date instance when
 * parseable, otherwise `undefined`.
 */
export function toValidDate(value?: string): Date | undefined {
  if (!value) return undefined
  return parseEditorialDate(value)
}
