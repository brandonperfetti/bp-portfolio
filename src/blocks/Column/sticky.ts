/**
 * The sticky-column vocabulary: one blessed offset, one literal class string.
 *
 * @remarks Deliberately not a per-breakpoint control (#29): the hard-coded
 * homepage rail sticks at `lg:sticky lg:top-10` and About's portrait rail
 * wants the same, so the block offers that one behaviour rather than an
 * offset picker nobody can keep consistent across pages.
 *
 * `self-start` is what makes it work at all — a grid item stretches to its
 * row's height by default, leaving nothing to stick *within*. Because it sits
 * on the column, it also overrides the container's `verticalAlign` for this
 * column only, which is the intent: a sticky rail can't also be stretched.
 *
 * Below `lg` the column is a full-width stacked block and nothing sticks.
 */
export const STICKY_COLUMN_CLASS = 'self-start lg:sticky lg:top-10'

/**
 * Sticky classes for a stored checkbox value.
 *
 * @param sticky - Stored `sticky` value, if any.
 * @returns The literal sticky classes, or an empty string when off — so the
 * caller can pass the result straight to `cn()`.
 */
export function stickyColumnClass(sticky: boolean | null | undefined): string {
  return sticky ? STICKY_COLUMN_CLASS : ''
}
