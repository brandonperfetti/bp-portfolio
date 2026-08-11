/**
 * The column-width vocabulary — one source for the Payload select options,
 * the admin row label, and the renderer's grid classes.
 *
 * @remarks Every consumer derives from this array; nothing re-declares a
 * size list. That is the point: the reference implementation this block set
 * is modelled on drifted (`half` in the config, `oneHalf` in the renderer)
 * and silently dropped the width. `sizes.test.ts` asserts the config's
 * options and the class map stay identical sets.
 *
 * Classes are complete literal strings so Tailwind's source scan finds
 * them — never build a class name by interpolating a size value. Each entry
 * spans the full 12 columns below `lg` and takes its share from `lg` up, so
 * columns stack on small screens without any renderer-side branching.
 */
export const COLUMN_SIZES = [
  {
    value: 'oneQuarter',
    label: 'One Quarter (1/4)',
    className: 'col-span-12 lg:col-span-3',
  },
  {
    value: 'oneThird',
    label: 'One Third (1/3)',
    className: 'col-span-12 lg:col-span-4',
  },
  {
    value: 'half',
    label: 'Half (1/2)',
    className: 'col-span-12 lg:col-span-6',
  },
  {
    value: 'twoThirds',
    label: 'Two Thirds (2/3)',
    className: 'col-span-12 lg:col-span-8',
  },
  {
    value: 'threeQuarters',
    label: 'Three Quarters (3/4)',
    className: 'col-span-12 lg:col-span-9',
  },
  {
    value: 'full',
    label: 'Full (1/1)',
    className: 'col-span-12 lg:col-span-12',
  },
] as const

/** Width vocabulary of a `column` block, derived from {@link COLUMN_SIZES}. */
export type ColumnSize = (typeof COLUMN_SIZES)[number]['value']

/**
 * Width a new column starts at — full width, so a column added to a
 * container is visible before the editor picks a share.
 */
export const DEFAULT_COLUMN_SIZE: ColumnSize = 'full'

/** Select options for the `column` block's `size` field. */
export const COLUMN_SIZE_OPTIONS: { label: string; value: ColumnSize }[] =
  COLUMN_SIZES.map(({ label, value }) => ({ label, value }))

/** Admin labels by size — used by the column row label. */
export const COLUMN_SIZE_LABELS = Object.fromEntries(
  COLUMN_SIZES.map(({ label, value }) => [value, label]),
) as Record<ColumnSize, string>

/** Grid classes by size — the renderer's only width lookup. */
export const COLUMN_SIZE_CLASSES = Object.fromEntries(
  COLUMN_SIZES.map(({ className, value }) => [value, className]),
) as Record<ColumnSize, string>

/**
 * Grid classes for a size, tolerating the `string | null | undefined` that
 * CMS data hands the renderer.
 *
 * @param size - Stored size value, if any.
 * @returns The literal Tailwind span classes, falling back to full width so
 * an unknown value renders a readable column rather than a zero-width one.
 */
export function columnSizeClass(size: string | null | undefined): string {
  return (
    COLUMN_SIZE_CLASSES[size as ColumnSize] ??
    COLUMN_SIZE_CLASSES[DEFAULT_COLUMN_SIZE]
  )
}
