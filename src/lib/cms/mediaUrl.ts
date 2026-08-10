import type { Media } from '@/payload-types'

/**
 * URL of a populated Media relation, tolerant of unpopulated (numeric-ID)
 * values.
 *
 * @remarks The single shared helper — this was previously duplicated per
 * repo module (fresh-eyes review 2026-08, n3). Depth-0 fetches leave
 * relations as IDs; callers treat "no URL" and "not populated" identically.
 */
export const mediaUrl = (media: unknown): string | undefined =>
  media && typeof media === 'object'
    ? (media as Media).url || undefined
    : undefined
