/**
 * The Carousel block's full-bleed breakout vocabulary — one literal class
 * string plus the helper the client leaf uses to select it, in the shape
 * `PhotoStrip/fullBleed.ts` established.
 *
 * @remarks A hero-scale horizontal Expo carousel wants to reach the screen
 * edges so its parallax side-panels aren't cut off by the reading column's
 * width cap (the "gray bands", #68.2). The route wraps `RenderBlocks` in a
 * `<Container>`, so reaching the viewport edges is a *breakout*, not a
 * different wrapper — the exact idiom `Container/section.ts` uses for
 * `fullBleed` (`relative left-1/2 w-screen -translate-x-1/2`), reused here (as
 * PhotoStrip does) so every full-bleed surface escapes its wrapper identically.
 *
 * The `w-screen` breakout inherits the known classic-scrollbar caveat: on a
 * viewport with a persistent scrollbar `100vw` overshoots the content box by
 * the scrollbar width. The `overflow-x: clip` that absorbs it lives on the
 * frontend route layout (`src/app/(frontend)/layout.tsx`), not on this block —
 * the same arrangement PhotoStrip relies on.
 *
 * Whether the breakout applies is decided in `resolveCarouselBehavior` (only a
 * horizontal Expo, never under reduced motion), so this module is pure class
 * vocabulary with no effect/direction logic of its own.
 */

import { SECTION_WIDTH_CLASSES } from '@/blocks/Container/section'

/**
 * The full-bleed breakout classes — the single canonical idiom, re-exported
 * from {@link SECTION_WIDTH_CLASSES} so a change there fails this block's pin
 * test loudly rather than leaving a stale hand-copied string behind.
 */
export const CAROUSEL_FULL_BLEED_CLASS = SECTION_WIDTH_CLASSES.fullBleed

/**
 * Full-bleed breakout classes for a resolved on/off value.
 *
 * @param fullBleed - Whether the resolved behaviour asked for the breakout.
 * @returns The literal breakout classes, or an empty string when off — so the
 * caller can hand the result straight to `cn()` and, when off, the carousel
 * renders inside its wrapper exactly as before.
 */
export function carouselFullBleedClass(
  fullBleed: boolean | null | undefined,
): string {
  return fullBleed ? CAROUSEL_FULL_BLEED_CLASS : ''
}
