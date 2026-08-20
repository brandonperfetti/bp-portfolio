import type { SelectField } from 'payload'

/**
 * The responsive-visibility vocabulary — one source for the Payload select
 * options and the renderer's class lookup, in the shape `Column/inset.ts`
 * established. A block (or a whole column) can be shown always, only from the
 * `lg` breakpoint up, or only below it.
 *
 * @remarks This is the one primitive the hand-built `about/page.tsx` needs and
 * the page builder lacked (audit gap #6). That page places its portrait twice —
 * once in the desktop rail (`hidden lg:block`) and once inline in the left
 * column between the subtitle and the body (`lg:hidden`) — plus a mobile-only
 * social row (`mb-4 lg:hidden`). A single two-column grid stacks column-1 fully
 * then column-2, so without a visibility control the rail's portrait can only
 * land at the very bottom on a phone; duplicating it across two columns and
 * toggling each by breakpoint is what puts it between the subtitle and the body
 * where it belongs.
 *
 * Breakpoint is `lg`, matching `about/page.tsx` throughout. Classes are
 * complete literal strings so Tailwind's source scan finds them; never build
 * one by interpolating a stored value.
 */
export const BLOCK_VISIBILITIES = [
  {
    value: 'always',
    label: 'Always visible (default)',
    className: '',
  },
  {
    value: 'desktopOnly',
    label: 'Desktop only (hidden below the lg breakpoint)',
    className: 'hidden lg:block',
  },
  {
    value: 'mobileOnly',
    label: 'Mobile only (hidden from the lg breakpoint up)',
    className: 'lg:hidden',
  },
] as const

/** Responsive-visibility vocabulary, derived from {@link BLOCK_VISIBILITIES}. */
export type BlockVisibility = (typeof BLOCK_VISIBILITIES)[number]['value']

/**
 * Visibility a block or column starts at — `always`, so anything added before
 * this control existed (or anything that simply wants to be seen everywhere)
 * renders exactly as it did.
 */
export const DEFAULT_BLOCK_VISIBILITY: BlockVisibility = 'always'

/**
 * Postgres enum backing every `visibility` select — one shared identifier
 * across the blocks that carry the field. The value set is identical
 * everywhere, so a single enum keeps the schema (and the migration) small and
 * stays short of Postgres's 63-character limit for the deeply nested blocks.
 */
export const BLOCK_VISIBILITY_ENUM_NAME = 'enum_block_visibility'

/** Select options for a `visibility` field, derived from {@link BLOCK_VISIBILITIES}. */
export const BLOCK_VISIBILITY_OPTIONS: {
  label: string
  value: BlockVisibility
}[] = BLOCK_VISIBILITIES.map(({ label, value }) => ({ label, value }))

/** Visibility classes by value — the renderer's only visibility lookup. */
export const BLOCK_VISIBILITY_CLASSES = Object.fromEntries(
  BLOCK_VISIBILITIES.map(({ className, value }) => [value, className]),
) as Record<BlockVisibility, string>

/**
 * Visibility classes for a stored value, tolerating the
 * `string | null | undefined` CMS data hands the renderer.
 *
 * @param visibility - Stored visibility value, if any.
 * @returns The literal Tailwind display classes (empty for `always`), falling
 * back to `always` so an unknown value stays visible rather than vanishing —
 * the caller can hand the result straight to `cn()`. An empty string is the
 * signal that no wrapper is needed at all (see `RenderBlocks`), which is what
 * keeps every existing page byte-identical.
 */
export function visibilityClass(visibility: string | null | undefined): string {
  return (
    BLOCK_VISIBILITY_CLASSES[visibility as BlockVisibility] ??
    BLOCK_VISIBILITY_CLASSES[DEFAULT_BLOCK_VISIBILITY]
  )
}

/**
 * Build the shared `visibility` select field for a block (or the `column`
 * block) that opts into responsive visibility.
 *
 * @returns A Payload select field: optional (never `required`), defaulting to
 * `always`, on the shared {@link BLOCK_VISIBILITY_ENUM_NAME} enum. Optional so
 * the additive field leaves existing fixtures and stored docs valid without a
 * value; the renderer treats a null/absent value as `always`.
 * @remarks A factory rather than a copied literal so the three call sites
 * (`image`, `socialLinks`, `column`) cannot drift — one shape, one enum, one
 * default. `config.test.ts`/`visibility.test.ts` read the field back out of
 * each block to prove they stayed identical.
 */
export function visibilityField(): SelectField {
  return {
    name: 'visibility',
    type: 'select',
    defaultValue: DEFAULT_BLOCK_VISIBILITY,
    enumName: BLOCK_VISIBILITY_ENUM_NAME,
    options: [...BLOCK_VISIBILITY_OPTIONS],
    label: 'Responsive visibility',
    admin: {
      description:
        'Show this everywhere (default), only on desktop (from the lg breakpoint up), or only on mobile (below lg). Use a desktop-only and a mobile-only copy to place the same block differently on each — the about-page portrait sits in the rail on desktop and inline on a phone.',
    },
  }
}
