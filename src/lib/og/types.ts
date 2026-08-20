/**
 * The three-way per-entry OG image mode shared by the Pages and Posts
 * collections (`ogImageMode` select). Mirrors the union Payload generates in
 * `payload-types.ts`; declared once here so the resolver and repos agree.
 *
 * - `auto` — follow the global generated-OG toggle (generate only when the
 *   entry is cover-less).
 * - `bespoke` — always the entry's own image, never a generated card.
 * - `generated` — always a generated card, even when the entry has a cover.
 */
export type OgImageMode = 'auto' | 'bespoke' | 'generated'

/** Font weights bundled for the generated card (see {@link OgCardFont}). */
export type OgCardFontWeight = 400 | 600 | 800

/**
 * A single font face passed to `next/og`'s `ImageResponse`. Structural subset of
 * the library's font option, narrowed to what the card actually supplies.
 */
export interface OgCardFont {
  name: string
  data: Buffer
  weight: OgCardFontWeight
  style: 'normal'
}
