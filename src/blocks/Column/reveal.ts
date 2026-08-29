/**
 * The per-column child-reveal vocabulary: one blessed set of scroll-reveal
 * parameters and the marker each revealed child carries, in the shape
 * `Column/sticky.ts` established.
 *
 * @remarks This reproduces the homepage rail's entrance choreography. Home
 * wraps its sticky rail in:
 *
 * ```tsx
 * <ScrollReveal targets="[data-reveal-item]" y={20} stagger={0.16}>
 * ```
 *
 * and marks each rail card (`Messenger`, `Resume`) with `data-reveal-item`,
 * so the cards reveal one after another as the rail comes into view.
 * `reveal.test.ts` reads those exact params back out of the homepage source,
 * the way `sticky.test.ts` guards the sticky offset, so a change on either
 * side fails loudly.
 *
 * Exposed as a fixed capability (a checkbox), not free parameter controls:
 * the numbers are the homepage's, not an editor's to dial. `y` and `stagger`
 * are plain numbers rather than class strings, so no Tailwind-scan concern.
 */
export const COLUMN_REVEAL_TARGET_ATTR = 'data-reveal-item'

/** ScrollReveal parameters for a revealing column — the homepage rail's exact values. */
export const COLUMN_REVEAL_PARAMS = {
  targets: `[${COLUMN_REVEAL_TARGET_ATTR}]`,
  y: 20,
  stagger: 0.16,
} as const

/** The reveal parameters a column emits, or `undefined` when the checkbox is off. */
export type ColumnRevealParams = typeof COLUMN_REVEAL_PARAMS

/**
 * Reveal parameters for a stored checkbox value.
 *
 * @param reveal - Stored `revealChildren` value, if any.
 * @returns The homepage rail's reveal params when on, otherwise `undefined` —
 * so the renderer can treat `undefined` as "emit no ScrollReveal at all",
 * keeping a column that predates this control byte-identical.
 */
export function columnRevealParams(
  reveal: boolean | null | undefined,
): ColumnRevealParams | undefined {
  return reveal ? COLUMN_REVEAL_PARAMS : undefined
}
