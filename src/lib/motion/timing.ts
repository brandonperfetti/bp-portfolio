/**
 * Consolidated motion timing tokens (§11 "consolidate the timing constants
 * duplicated across v3 components").
 *
 * All durations/staggers/delays are seconds. Components must keep honoring
 * `usePrefersReducedMotion` — these tokens only standardize the animated
 * path. Change values here, not inline in components.
 */

/** House ease for UI motion (reveals, hover lifts). */
export const EASE_OUT = 'power2.out'

/** Ease for scrubbed/linear motion (parallax, typewriter). */
export const EASE_NONE = 'none'

/** Card/list grid reveal (articles, tech, uses grids). */
export const REVEAL_GRID = {
  y: 20,
  duration: 0.86,
  stagger: 0.07,
  start: 'top 88%',
} as const

/** Page-header intro reveal (SimpleLayout title/intro). */
export const REVEAL_INTRO = {
  y: 14,
  duration: 0.76,
  delay: 0.14,
} as const

/** Article body/header reveal (ArticleLayout). */
export const REVEAL_ARTICLE = {
  y: 20,
  duration: 0.86,
  delay: 0.1,
} as const

/**
 * Hover/focus micro-interaction timing for `HoverMotionCard`. Leave is
 * slightly slower than enter so cards settle instead of snapping back.
 */
export const HOVER_TIMING = {
  enter: { root: 0.36, overlay: 0.28, image: 0.46, icon: 0.34 },
  leave: { root: 0.44, overlay: 0.36, image: 0.52, icon: 0.4 },
} as const

/** ScrollTrigger scrub smoothing for parallax groups. */
export const PARALLAX_SCRUB = 0.85

// --- Animated headline (moved from headlineTiming.ts) ---

export const TYPEWRITER_CHAR_DURATION = 0.02
export const TYPEWRITER_CHAR_STAGGER = 0.043
/** Caret blink half-period once typing completes. */
export const TYPEWRITER_CARET_BLINK_DURATION = 0.82
export const LINE_WORD_DURATION = 1.14
export const LINE_WORD_STAGGER = 0.148
/** Extra visual beat before the caret begins blinking after typing ends. */
export const TYPEWRITER_CARET_START_BUFFER = 0.12
