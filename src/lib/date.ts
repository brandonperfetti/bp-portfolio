/**
 * Returns true when the provided date parses to a future timestamp.
 *
 * Invalid/unparseable values return false to avoid accidentally hiding content
 * due to bad metadata.
 */
export function isFuturePublicationDate(dateValue: string) {
  const timestamp = Date.parse(dateValue)
  if (Number.isNaN(timestamp)) {
    return false
  }
  return timestamp > Date.now()
}
