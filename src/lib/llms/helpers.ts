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
  const parsed = Date.parse(updatedAt || date || '')
  return Number.isNaN(parsed) ? 0 : parsed
}
