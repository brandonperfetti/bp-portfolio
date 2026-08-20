/**
 * The PhotoStrip block's full-bleed breakout vocabulary — one literal class
 * string plus the helper the block Component uses to select it, in the shape
 * `Column/sticky.ts` established.
 *
 * @remarks The homepage renders its gallery *outside* the reading `<Container>`
 * so it spans the viewport as the LCP image. A CMS `photoStrip` block sits
 * inside the `[slug]` route's `<Container>`, so reproducing that placement is
 * a breakout, not a different wrapper — the exact idiom `Container/section.ts`
 * uses for `fullBleed` (`relative left-1/2 w-screen -translate-x-1/2`),
 * reused here so both surfaces escape their wrapper identically.
 *
 * The `w-screen` breakout inherits the known classic-scrollbar caveat W1B3
 * flagged: on a viewport with a persistent scrollbar `100vw` overshoots the
 * content box by the scrollbar width. The `overflow-x: clip` fix belongs to
 * the route that hosts the block (Batch 2 / #42 owns that flip), not to the
 * block itself, so it is deliberately not applied here.
 *
 * Classes are complete literal strings so Tailwind's source scan finds them;
 * never build one by interpolating a stored value.
 */
export const PHOTO_STRIP_FULL_BLEED_CLASS =
  'relative left-1/2 w-screen -translate-x-1/2'

/**
 * Full-bleed breakout classes for a stored checkbox value.
 *
 * @param fullBleed - Stored `fullBleed` value, if any.
 * @returns The literal breakout classes, or an empty string when off — so the
 * caller can hand the result straight to `cn()` and, when off, the block
 * renders exactly where it always has (inside the reading container).
 */
export function photoStripFullBleedClass(
  fullBleed: boolean | null | undefined,
): string {
  return fullBleed ? PHOTO_STRIP_FULL_BLEED_CLASS : ''
}
