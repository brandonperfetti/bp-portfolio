/**
 * The Container grid's spacing and alignment vocabulary — one source for the
 * Payload select options and the renderer's classes, in the shape
 * `Column/sizes.ts` established.
 *
 * @remarks Classes are complete literal strings so Tailwind's source scan
 * finds them; never build one by interpolating a stored value. The `lg` gap
 * approximates the hard-coded homepage's two-column gutter with a *symmetric*
 * column gap (`lg:pl-16 xl:pl-24` on the right rail — 64px / 96px), and
 * `layout.test.ts` reads those numbers back out of the homepage source so a
 * change on either side fails loudly.
 *
 * A symmetric gap is not actually pixel-parity, though: splitting the gutter
 * across both columns leaves the article column ~32px narrow. The homepage's
 * gutter is *asymmetric* — the grid has no column gap at all (`gap-y-20`, no
 * `gap-x`), so each column is exactly `W/2`, and the right rail insets its own
 * content by `lg:pl-16 xl:pl-24` (see `Column/inset.ts`). `homeParity`
 * reproduces the grid half of that: zero column gap so the columns land at
 * `W/2`, with the homepage's 80px (`gap-y-20`) between them once stacked.
 * Pair it with the column inset to reach Home exactly.
 */
export const CONTAINER_GAPS = [
  {
    value: 'sm',
    label: 'Small (tight)',
    className: 'gap-4',
  },
  {
    value: 'md',
    label: 'Medium (default)',
    className: 'gap-8',
  },
  {
    value: 'lg',
    label: 'Large (matches the homepage two-column gutter)',
    className: 'gap-8 lg:gap-16 xl:gap-24',
  },
  {
    value: 'homeParity',
    label: 'Home parity (flush columns, 80px stacked)',
    className: 'gap-x-0 gap-y-20',
  },
] as const

/** Gap vocabulary of a `container` block, derived from {@link CONTAINER_GAPS}. */
export type ContainerGap = (typeof CONTAINER_GAPS)[number]['value']

/**
 * Gap a new container starts at — `md` (`gap-8`), the spacing every
 * container rendered before this control existed, so adding the field
 * changed no existing page.
 */
export const DEFAULT_CONTAINER_GAP: ContainerGap = 'md'

/** Select options for the `container` block's `gap` field. */
export const CONTAINER_GAP_OPTIONS: { label: string; value: ContainerGap }[] =
  CONTAINER_GAPS.map(({ label, value }) => ({ label, value }))

/** Grid gap classes by value — the renderer's only gap lookup. */
export const CONTAINER_GAP_CLASSES = Object.fromEntries(
  CONTAINER_GAPS.map(({ className, value }) => [value, className]),
) as Record<ContainerGap, string>

/**
 * Grid gap classes for a stored value, tolerating the
 * `string | null | undefined` CMS data hands the renderer.
 *
 * @param gap - Stored gap value, if any.
 * @returns Literal Tailwind gap classes, falling back to the default so an
 * unknown value spaces the grid readably instead of collapsing it.
 */
export function containerGapClass(gap: string | null | undefined): string {
  return (
    CONTAINER_GAP_CLASSES[gap as ContainerGap] ??
    CONTAINER_GAP_CLASSES[DEFAULT_CONTAINER_GAP]
  )
}

/**
 * How columns align against each other on the cross axis when they differ in
 * height.
 *
 * @remarks `stretch` is the CSS default and the behaviour every container had
 * before this control, so it stays the default here. A sticky column opts out
 * of whatever is chosen — sticky needs `self-start`, which the column applies
 * itself (see `Column/sticky.ts`).
 */
export const CONTAINER_VERTICAL_ALIGNS = [
  {
    value: 'start',
    label: 'Top',
    className: 'items-start',
  },
  {
    value: 'center',
    label: 'Center',
    className: 'items-center',
  },
  {
    value: 'stretch',
    label: 'Stretch (default)',
    className: 'items-stretch',
  },
] as const

/** Vertical-alignment vocabulary, derived from {@link CONTAINER_VERTICAL_ALIGNS}. */
export type ContainerVerticalAlign =
  (typeof CONTAINER_VERTICAL_ALIGNS)[number]['value']

/** Alignment a new container starts at — the pre-existing CSS default. */
export const DEFAULT_CONTAINER_VERTICAL_ALIGN: ContainerVerticalAlign =
  'stretch'

/** Select options for the `container` block's `verticalAlign` field. */
export const CONTAINER_VERTICAL_ALIGN_OPTIONS: {
  label: string
  value: ContainerVerticalAlign
}[] = CONTAINER_VERTICAL_ALIGNS.map(({ label, value }) => ({ label, value }))

/** Alignment classes by value — the renderer's only alignment lookup. */
export const CONTAINER_VERTICAL_ALIGN_CLASSES = Object.fromEntries(
  CONTAINER_VERTICAL_ALIGNS.map(({ className, value }) => [value, className]),
) as Record<ContainerVerticalAlign, string>

/**
 * Alignment classes for a stored value, tolerating the nullable strings CMS
 * data hands the renderer.
 *
 * @param align - Stored vertical-alignment value, if any.
 * @returns Literal Tailwind alignment classes, falling back to `stretch`.
 */
export function containerVerticalAlignClass(
  align: string | null | undefined,
): string {
  return (
    CONTAINER_VERTICAL_ALIGN_CLASSES[align as ContainerVerticalAlign] ??
    CONTAINER_VERTICAL_ALIGN_CLASSES[DEFAULT_CONTAINER_VERTICAL_ALIGN]
  )
}
