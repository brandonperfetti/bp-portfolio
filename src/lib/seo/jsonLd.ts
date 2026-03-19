/**
 * Safely serializes JSON-LD for inline script injection.
 * Escapes script-sensitive characters and line separators so injected JSON-LD
 * cannot terminate the script tag or break parsing in legacy JS contexts.
 */
export function toSafeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
