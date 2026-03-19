import { isFuturePublicationDate, toValidDate } from '@/lib/date'

/**
 * Flattens multiline markdown fragments into a safe single-line value for
 * plain-text llms index output.
 */
export function sanitizeInlineMarkdown(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Converts updated/published timestamps into a sortable epoch value.
 * Invalid or missing dates intentionally fall back to 0 for deterministic sort.
 */
export function toFreshnessTimestamp(updatedAt?: string, date?: string) {
  const parsed = toValidDate(updatedAt) || toValidDate(date)
  return parsed ? parsed.getTime() : 0
}

type PublicArticleCandidate = {
  date: string
  updatedAt?: string
  noindex?: boolean
}

/**
 * Shared public-article selection for llms endpoints.
 * Excludes noindex/future-dated entries, sorts by freshness desc, and caps size.
 */
export function getPublicSortedArticles<T extends PublicArticleCandidate>(
  articles: T[],
  maxArticles: number,
) {
  return articles
    .filter(
      (article) => !article.noindex && !isFuturePublicationDate(article.date),
    )
    .sort((a, b) => {
      const aFresh = toFreshnessTimestamp(a.updatedAt, a.date)
      const bFresh = toFreshnessTimestamp(b.updatedAt, b.date)
      return bFresh - aFresh
    })
    .slice(0, maxArticles)
}
