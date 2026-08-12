/**
 * The per-column content-inset vocabulary — one source for the Payload select
 * options and the renderer's class lookup, in the shape `Column/sizes.ts`
 * established.
 *
 * @remarks This is the column half of the homepage's *asymmetric* two-column
 * gutter. The homepage grid carries no column gap (`Container/layout.ts`'s
 * `homeParity`), so both columns land at exactly `W/2`; the right rail then
 * insets its own content with `lg:pl-16 xl:pl-24` (64px / 96px from `lg`),
 * which is what puts the gutter *between* a full-width article column and the
 * rail rather than splitting it across both. `inset.test.ts` reads those
 * numbers back out of the homepage source so neither side can drift silently.
 *
 * Classes are complete literal strings so Tailwind's source scan finds them;
 * never build one by interpolating a stored value. Each entry is full width
 * below `lg` (no inset) and takes its offset from `lg` up, so a stacked
 * column on a phone is never pushed off-centre by a desktop gutter.
 */
export const COLUMN_INSETS = [
  {
    value: 'none',
    label: 'None (default)',
    className: '',
  },
  {
    value: 'railGutter',
    label: 'Rail gutter (matches the homepage right rail)',
    className: 'lg:pl-16 xl:pl-24',
  },
] as const

/** Content-inset vocabulary of a `column` block, derived from {@link COLUMN_INSETS}. */
export type ColumnInset = (typeof COLUMN_INSETS)[number]['value']

/**
 * Inset a new column starts at — `none`, so a column added before this
 * control existed (or one that simply doesn't want a gutter) renders exactly
 * as it did.
 */
export const DEFAULT_COLUMN_INSET: ColumnInset = 'none'

/** Postgres enum backing the `contentInset` select — explicit and short. */
export const COLUMN_INSET_ENUM_NAME = 'enum_column_content_inset'

/** Select options for the `column` block's `contentInset` field. */
export const COLUMN_INSET_OPTIONS: { label: string; value: ColumnInset }[] =
  COLUMN_INSETS.map(({ label, value }) => ({ label, value }))

/** Inset classes by value — the renderer's only inset lookup. */
export const COLUMN_INSET_CLASSES = Object.fromEntries(
  COLUMN_INSETS.map(({ className, value }) => [value, className]),
) as Record<ColumnInset, string>

/**
 * Inset classes for a stored value, tolerating the `string | null | undefined`
 * CMS data hands the renderer.
 *
 * @param inset - Stored inset value, if any.
 * @returns The literal Tailwind padding classes (empty for `none`), falling
 * back to `none` so an unknown value adds no gutter rather than a wrong one —
 * the caller can hand the result straight to `cn()`.
 */
export function columnInsetClass(inset: string | null | undefined): string {
  return (
    COLUMN_INSET_CLASSES[inset as ColumnInset] ??
    COLUMN_INSET_CLASSES[DEFAULT_COLUMN_INSET]
  )
}
