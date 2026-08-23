/**
 * The Container's section-shell vocabulary — how wide a section runs and how
 * much air it carries — plus the anchor-id rule. One source for the Payload
 * fields and the renderer, in the shape `Column/sizes.ts` established.
 *
 * @remarks Classes are complete literal strings so Tailwind's source scan
 * finds them; never interpolate a stored value into a class name.
 */

/**
 * Width vocabulary of a container section.
 *
 * - `container` — no width of its own: the section fills whatever the route's
 *   `<Container>` gives it, which is exactly how containers rendered before
 *   this control existed.
 * - `narrow` — a centered reading measure inside that width.
 * - `fullBleed` — escapes the route container to the full viewport. The
 *   route wraps `RenderBlocks` in a `Container` (the `[slug]` page route),
 *   so this is a breakout rather than a different wrapper: the
 *   section is centered on the viewport (`left-1/2` + `-translate-x-1/2`)
 *   and given the viewport's width. Legacy root-level blocks keep their
 *   wrapper untouched, which is the point — nothing outside this block
 *   changes.
 */
export const SECTION_WIDTHS = [
  {
    value: 'container',
    label: 'Container (default)',
    className: '',
  },
  {
    value: 'narrow',
    label: 'Narrow (centered reading width)',
    className: 'mx-auto max-w-2xl',
  },
  {
    value: 'fullBleed',
    label: 'Full bleed (edge to edge)',
    className: 'relative left-1/2 w-screen -translate-x-1/2',
  },
] as const

/** Width vocabulary of a container section, derived from {@link SECTION_WIDTHS}. */
export type SectionWidth = (typeof SECTION_WIDTHS)[number]['value']

/** Width a new section starts at — the pre-existing behaviour. */
export const DEFAULT_SECTION_WIDTH: SectionWidth = 'container'

/** Select options for the section group's `width` field. */
export const SECTION_WIDTH_OPTIONS: { label: string; value: SectionWidth }[] =
  SECTION_WIDTHS.map(({ label, value }) => ({ label, value }))

/** Width classes by value — the renderer's only width lookup. */
export const SECTION_WIDTH_CLASSES = Object.fromEntries(
  SECTION_WIDTHS.map(({ className, value }) => [value, className]),
) as Record<SectionWidth, string>

/**
 * Width classes for a stored value, tolerating `string | null | undefined`.
 *
 * @param width - Stored width value, if any.
 * @returns Literal Tailwind classes (empty for `container`), falling back to
 * the default so an unknown value renders in the route's width rather than
 * breaking out unexpectedly.
 */
export function sectionWidthClass(width: string | null | undefined): string {
  return (
    SECTION_WIDTH_CLASSES[width as SectionWidth] ??
    SECTION_WIDTH_CLASSES[DEFAULT_SECTION_WIDTH]
  )
}

/**
 * Vertical padding vocabulary of a container section.
 *
 * @remarks `none` is the default because every block in this repo still
 * carries its own vertical rhythm; padding here is additive breathing room
 * for a section that needs it, not a replacement for that rhythm yet.
 */
export const SECTION_PADDING_Y = [
  {
    value: 'none',
    label: 'None (default)',
    className: '',
  },
  {
    value: 'sm',
    label: 'Small',
    className: 'py-8',
  },
  {
    value: 'md',
    label: 'Medium',
    className: 'py-16',
  },
  {
    value: 'lg',
    label: 'Large',
    className: 'py-24',
  },
] as const

/** Padding vocabulary of a container section. */
export type SectionPaddingY = (typeof SECTION_PADDING_Y)[number]['value']

/** Padding a new section starts at — none, the pre-existing behaviour. */
export const DEFAULT_SECTION_PADDING_Y: SectionPaddingY = 'none'

/** Select options for the section group's `paddingY` field. */
export const SECTION_PADDING_Y_OPTIONS: {
  label: string
  value: SectionPaddingY
}[] = SECTION_PADDING_Y.map(({ label, value }) => ({ label, value }))

/** Padding classes by value — the renderer's only padding lookup. */
export const SECTION_PADDING_Y_CLASSES = Object.fromEntries(
  SECTION_PADDING_Y.map(({ className, value }) => [value, className]),
) as Record<SectionPaddingY, string>

/**
 * Padding classes for a stored value, tolerating `string | null | undefined`.
 *
 * @param padding - Stored padding value, if any.
 * @returns Literal Tailwind classes (empty for `none`), falling back to none.
 */
export function sectionPaddingYClass(
  padding: string | null | undefined,
): string {
  return (
    SECTION_PADDING_Y_CLASSES[padding as SectionPaddingY] ??
    SECTION_PADDING_Y_CLASSES[DEFAULT_SECTION_PADDING_Y]
  )
}

/**
 * Vertical-rhythm vocabulary of a container section — the outer margin the
 * section carries above and below itself.
 *
 * @remarks `default` is the margin every container has always had (`my-12`,
 * 48px), so it stays the default and existing sections render byte-identically.
 * `home` opts a section into the hard-coded Home page's two-column rhythm:
 * `mt-24 mb-24 md:mt-28 md:mb-28` — a symmetric `my-24 md:my-28` (96px base,
 * 112px from `md`). Home's grid sits 48px lower at base and 64px lower at
 * desktop than a plain `my-12` container, and because that gap is responsive a
 * flat padding can't match both widths — a two-value margin can. Classes are
 * complete literal strings so Tailwind's source scan finds them; never
 * interpolate a stored value into a class name.
 */
export const SECTION_RHYTHMS = [
  {
    value: 'default',
    label: 'Default (compact)',
    className: 'my-12',
  },
  {
    value: 'home',
    label: 'Home (matches the homepage two-column rhythm)',
    className: 'my-24 md:my-28',
  },
] as const

/** Rhythm vocabulary of a container section, derived from {@link SECTION_RHYTHMS}. */
export type SectionRhythm = (typeof SECTION_RHYTHMS)[number]['value']

/** Rhythm a new section starts at — `default` (`my-12`), the pre-existing behaviour. */
export const DEFAULT_SECTION_RHYTHM: SectionRhythm = 'default'

/** Select options for the section group's `rhythm` field. */
export const SECTION_RHYTHM_OPTIONS: { label: string; value: SectionRhythm }[] =
  SECTION_RHYTHMS.map(({ label, value }) => ({ label, value }))

/** Rhythm classes by value — the renderer's only rhythm lookup. */
export const SECTION_RHYTHM_CLASSES = Object.fromEntries(
  SECTION_RHYTHMS.map(({ className, value }) => [value, className]),
) as Record<SectionRhythm, string>

/**
 * Rhythm classes for a stored value, tolerating `string | null | undefined`.
 *
 * @param rhythm - Stored rhythm value, if any.
 * @returns Literal Tailwind margin classes, falling back to the default
 * `my-12` so an unknown or absent value keeps the pre-existing spacing.
 */
export function sectionRhythmClass(rhythm: string | null | undefined): string {
  return (
    SECTION_RHYTHM_CLASSES[rhythm as SectionRhythm] ??
    SECTION_RHYTHM_CLASSES[DEFAULT_SECTION_RHYTHM]
  )
}

/**
 * Characters an anchor id may use: lowercase letters, digits, hyphens and
 * underscores, starting with a letter.
 *
 * @remarks Deliberately narrower than the HTML spec (which allows almost
 * anything without whitespace): an id typed here becomes a shared `#link`,
 * and a leading digit breaks bare CSS id selectors while uppercase and
 * punctuation invite case and encoding mistakes in a hand-typed URL.
 */
export const ANCHOR_ID_PATTERN = /^[a-z][a-z0-9_-]*$/

/** Longest anchor id accepted — long enough to be descriptive, short enough to type. */
export const ANCHOR_ID_MAX_LENGTH = 64

/**
 * Validate a section anchor id.
 *
 * @param value - The stored value, if any. Empty/absent is valid: the anchor
 * is optional and simply produces no `id`.
 * @returns `true` when acceptable, otherwise the admin-facing error message.
 */
export function validateAnchorId(
  value: string | null | undefined,
): true | string {
  if (value === null || value === undefined || value === '') return true
  if (value.length > ANCHOR_ID_MAX_LENGTH) {
    return `Anchor must be ${ANCHOR_ID_MAX_LENGTH} characters or fewer.`
  }
  if (!ANCHOR_ID_PATTERN.test(value)) {
    return 'Anchor must start with a lowercase letter and use only lowercase letters, numbers, hyphens and underscores — for example "work-history".'
  }
  return true
}

/**
 * The `id` to render for a stored anchor value.
 *
 * @param value - Stored anchor id, if any.
 * @returns The id, or `undefined` so React omits the attribute entirely
 * (an `id=""` is a real attribute that CSS and `:target` can match).
 * @remarks Values that the field validation would reject are dropped rather
 * than rendered — data can predate or bypass the field's validate.
 */
export function anchorIdAttribute(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined
  return validateAnchorId(value) === true ? value : undefined
}
