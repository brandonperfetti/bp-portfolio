/**
 * Formats a date for display (e.g. "January 5, 2025").
 *
 * Accepts both bare `YYYY-MM-DD` strings (v3 content) and full ISO
 * timestamps (Payload `publishedAt`) — naively appending `T00:00:00Z` to a
 * timestamp produced Invalid Date on every CMS-sourced card.
 *
 * @returns Localized date, or an empty string for unparseable input.
 */
export function formatDate(dateString: string) {
  const iso = dateString.includes('T') ? dateString : `${dateString}T00:00:00Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
