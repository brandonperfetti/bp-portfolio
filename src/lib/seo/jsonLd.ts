/**
 * Safely serializes JSON-LD for inline script injection.
 * Escapes "<" to prevent accidental script-tag termination.
 */
export function toSafeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
