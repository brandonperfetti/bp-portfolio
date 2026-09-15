/**
 * The `corvusChat` block's size vocabulary — the editor-facing options and
 * the one place their heights are written down.
 *
 * @remarks Classes are complete literal strings so Tailwind's source scan
 * finds them; never build one by interpolating a value (the rule
 * `hostContext.ts` and `Column/sizes.ts` already state).
 */

/** A stored `variant` value. */
export type CorvusChatBlockVariant = 'sidebar' | 'compact' | 'full'

/** Admin picker options for `variant`, in size order rather than alphabetical. */
export const CORVUS_CHAT_VARIANT_OPTIONS = [
  { label: 'Compact (24rem / 384px)', value: 'compact' },
  { label: 'Sidebar (32rem / 512px)', value: 'sidebar' },
  { label: 'Full — tallest bounded (44rem / 704px)', value: 'full' },
] as const

/**
 * The variant a block assumes when nothing says otherwise.
 *
 * @remarks `compact` rather than `sidebar`: the block is droppable anywhere,
 * and the shortest frame is the one that cannot dominate whatever page it
 * lands on. An editor who wants more height asks for it.
 */
export const DEFAULT_CORVUS_CHAT_VARIANT: CorvusChatBlockVariant = 'compact'

/**
 * Bounded height per variant, on the **block's own wrapper**.
 *
 * @remarks `CorvusChat`'s root is `flex h-full min-h-0 flex-col`, so it fills
 * whatever height it is given and never states one. On `/corvus` the page
 * supplies `h-[calc(100dvh-5.75rem)]`; in a page-builder column nothing does,
 * and `h-full` against an auto-height grid item resolves to `auto` — measured
 * on this tree, a column-hosted card grew to **1883px** with 1500px of
 * conversation content injected and `[data-slot='conversation']` reported
 * `clientHeight === scrollHeight === 1713`, i.e. **no scroll owner anywhere on
 * the page** and the composer pushed out of the fold (`#217` prerequisite,
 * 1440×900 Chromium). So the block supplies the height, and that is what
 * gives the conversation a bounded region to scroll inside.
 *
 * **None of the three is viewport-derived, and that is a composition
 * decision, not a sticky one.** The `#192` design doc's "a ~100dvh rail has no
 * travel" claim was *falsified* by the same run — a `STICKY_COLUMN_CLASS` rail
 * carrying the `/corvus` wrapper pinned at `top: 40px` with its bottom 60px
 * clear of a 900px viewport, over the identical scroll span a bounded 32rem
 * rail gets. The real argument is plainer: a block that is `viewport − 100px`
 * tall inside an article dominates the page and pushes every following block a
 * screenful down.
 *
 * The three rem values:
 *
 * - `compact` — **24rem / 384px.** Roughly the `/corvus` frame's empty-state
 *   height (367px measured), so the greeting, one exchange and the composer
 *   all sit in the fold without the block owning the page.
 * - `sidebar` — **32rem / 512px.** The rail height the prerequisite measured
 *   against, and tall enough that a half column beside a long article reads as
 *   a companion rather than a footnote.
 * - `full` — **44rem / 704px.** The **tallest bounded variant**, not a
 *   full-height one: the name is about this vocabulary's top end, not about
 *   filling the container or the screen. `[inference, arithmetic]` 704px plus
 *   the site header (~92px) and the block's own root margin (48px) is ~844px,
 *   inside a 900px desktop viewport — so the tallest option still never means
 *   "taller than the screen", which is the failure the AC exists to prevent.
 */
export const CORVUS_CHAT_VARIANT_HEIGHT_CLASSES: Record<
  CorvusChatBlockVariant,
  string
> = {
  compact: 'h-[24rem]',
  sidebar: 'h-[32rem]',
  full: 'h-[44rem]',
}

/**
 * Resolves a stored `variant` to its height class.
 *
 * @param variant - Stored value, if any.
 * @returns The literal height class; an unrecognised or absent value falls
 * back to {@link DEFAULT_CORVUS_CHAT_VARIANT}, so a stale stored value renders
 * a readable card instead of an unbounded one.
 */
export function corvusChatVariantHeightClass(
  variant: string | null | undefined,
): string {
  return (
    CORVUS_CHAT_VARIANT_HEIGHT_CLASSES[variant as CorvusChatBlockVariant] ??
    CORVUS_CHAT_VARIANT_HEIGHT_CLASSES[DEFAULT_CORVUS_CHAT_VARIANT]
  )
}

/**
 * The heading level the block renders Corvus's name at — **`h2`, in both host
 * contexts**.
 *
 * @remarks `CorvusChat` renders `title` as a heading, and its own default is
 * `h1` because `/corvus` is a page whose `<h1>` *is* the agent's name. A block
 * on a page that already has an `<h1>` would emit a second one (`#192`
 * finding 2 — an a11y/SEO defect invisible in a screenshot), so the block
 * passes a lower level.
 *
 * **`h2` and not `h3` inside a column, deliberately.** A heading level is a
 * fact about the document outline, not about layout position, and a column is
 * not a section: `ColumnShell` renders no heading, and the `container` block
 * that owns the columns has no heading field at all. So a column-hosted block
 * is *not* nested under a section heading, and dropping to `h3` there would
 * skip a level (`h1` → `h3`) on every page where no `h2` precedes it — the
 * same class of outline defect this prop exists to prevent, just quieter.
 * `h2` is the only level that can never be a skip below a page's `h1`, and it
 * is a legitimate sibling when an editor does put a `heading` block above.
 */
export const CORVUS_CHAT_BLOCK_HEADING_LEVEL = 'h2' as const

/**
 * Whether the block carries the Corvus skin itself.
 *
 * @remarks **It does — the block wraps itself in `.corvus-surface`.** The
 * alternative was to inherit the skin from an ancestor and render the zinc/teal
 * component default everywhere else. Four reasons for carrying it:
 *
 * 1. `[measured, #217 prerequisite]` Inheritance in practice means *never
 *    skinned*. The only element on the site that applies `.corvus-surface` is
 *    `/corvus`'s own page wrapper; the page builder puts no such ancestor
 *    above a block, and the column-hosted probe story duly rendered the plain
 *    zinc/teal default. "Inherited" would not be a choice between two looks,
 *    it would be one look with a theoretical second.
 * 2. A CMS block whose appearance depends on where an editor dropped it is
 *    non-deterministic by construction. The same block in two columns of one
 *    page could read as two different products.
 * 3. `[source, src/styles/tailwind.css]` The skin is *token-only* and safely
 *    nestable: `.corvus-surface` declares custom properties plus
 *    `color-scheme` and an inherited `color`, and its descendant rules are all
 *    `data-slot`-scoped. It paints no ground of its own — the chat card is
 *    explicitly `background-color: transparent`, "a border on the page with no
 *    fill" — so the block sits on whatever the page's background already is,
 *    and nesting it inside `/corvus`'s wrapper would change nothing.
 * 4. The AA floors are pinned *on this surface*:
 *    `src/styles/corvus-accent-contrast.test.ts` asserts all four
 *    accent-on-Corvus ratios from source. Both skins clear AA today, but only
 *    one of them has a test that says so.
 *
 * The cost, stated: the block is teal/zinc-neutral like the rest of the site,
 * so this is a change of *chrome* (bubble fills, avatar gradient, panel tints,
 * border colours), not of hue. If a future page wants an unskinned Corvus, that
 * is a new variant with a name, not a silent consequence of placement.
 */
export const CORVUS_CHAT_BLOCK_SURFACE_CLASS = 'corvus-surface'
