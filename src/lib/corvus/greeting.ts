/** A time-of-day bucket for the Corvus chat empty-state greeting. */
export type CorvusGreetingBucket =
  'morning' | 'afternoon' | 'evening' | 'late-night'

const BUCKET_WORD: Record<CorvusGreetingBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  'late-night': 'Late one',
}

/**
 * Buckets a 24-hour clock hour (`0`–`23`, visitor-local) into one of four
 * greeting windows.
 *
 * @remarks Boundaries: Morning 5–11, Afternoon 12–16, Evening 17–21, and
 * everything else (22–4, wrapping past midnight) is the late-night bucket.
 */
export function getCorvusGreetingBucket(hour: number): CorvusGreetingBucket {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 16) return 'afternoon'
  if (hour >= 17 && hour <= 21) return 'evening'
  return 'late-night'
}

/**
 * Builds the Corvus chat empty-state greeting line from a visitor-local hour
 * and an optional Clerk first name.
 *
 * @param hour - `new Date().getHours()` in the visitor's local timezone.
 * Callers must only compute this client-side, after mount — the server has
 * no visitor-local clock, so calling this during SSR would render a guess
 * that flashes or mismatches hydration.
 * @param firstName - The signed-in visitor's Clerk first name, or `null`
 * for anonymous visitors (or a signed-in visitor with no name on file).
 * @returns e.g. `"Afternoon, Brandon."` / `"Afternoon."` for the first three
 * buckets, or `"Late one, Brandon?"` / `"Late one?"` for the late-night
 * bucket (22:00–04:59), which reads as a question rather than a statement.
 */
export function getCorvusGreeting(
  hour: number,
  firstName?: string | null,
): string {
  const bucket = getCorvusGreetingBucket(hour)
  const word = BUCKET_WORD[bucket]
  const punctuation = bucket === 'late-night' ? '?' : '.'
  return firstName
    ? `${word}, ${firstName}${punctuation}`
    : `${word}${punctuation}`
}
