import type { OgImageMode } from '@/lib/og/types'

/**
 * Decide whether an entry's social image should be a generated title-card (T7)
 * rather than its own cover / the site default. Pure — the URL-building and
 * fallback chain live in the metadata resolvers that call this.
 *
 * The matrix, by `ogImageMode` (absent → `auto`):
 * - `generated` — always a card, even when the entry has a cover.
 * - `bespoke` — never a card; always the entry's own image / the static chain.
 * - `auto` — a card only when the global toggle is on **and** the entry has no
 *   cover of its own. A real cover always wins over a generated card in auto
 *   mode, and removing the cover (then republishing) flips it back to generated.
 *
 * @param mode - The entry's `ogImageMode`, or `undefined` for the `auto` default.
 * @param generatedOgEnabled - The global master switch (`SiteSettings`).
 * @param hasOwnImage - Whether the entry has its own cover/OG image.
 */
export function shouldUseGeneratedOg({
  mode,
  generatedOgEnabled,
  hasOwnImage,
}: {
  mode: OgImageMode | undefined
  generatedOgEnabled: boolean
  hasOwnImage: boolean
}): boolean {
  switch (mode ?? 'auto') {
    case 'generated':
      return true
    case 'bespoke':
      return false
    case 'auto':
    default:
      return generatedOgEnabled && !hasOwnImage
  }
}
