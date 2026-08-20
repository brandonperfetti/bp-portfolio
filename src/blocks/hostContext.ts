/**
 * Where a leaf block is being rendered — the one piece of context a block
 * needs to stop assuming it owns the page's full width, plus the class
 * vocabulary that context selects. One source for `RenderBlocks`, the block
 * Components, and `ColumnShell`, in the shape `Column/sizes.ts` established.
 *
 * @remarks Classes are complete literal strings so Tailwind's source scan
 * finds them; never build one by interpolating a value.
 */

/**
 * How a block is hosted.
 *
 * - `root` — dispatched straight into a route's block region, the way every
 *   block rendered before columns existed. The block owns its own vertical
 *   rhythm and reading width.
 * - `column` — nested inside a `container` → `column`. The column owns the
 *   rhythm between the blocks it stacks, and the editor already chose the
 *   width by picking a column size, so the block fills what it is given.
 */
export type BlockHostContext = 'root' | 'column'

/**
 * The context a block assumes when nothing says otherwise — root, so every
 * call site that predates this prop renders exactly as it did.
 */
export const DEFAULT_BLOCK_HOST_CONTEXT: BlockHostContext = 'root'

/**
 * The outer vertical rhythm a leaf block carries for itself.
 *
 * @param hosted - Host context, if any.
 * @returns `my-12` at root — the margin every block has always shipped — and
 * nothing inside a column, where the stack owns the spacing
 * ({@link COLUMN_STACK_SPACING_CLASS}).
 * @remarks Returns an empty string rather than `my-0` on purpose: an omitted
 * utility can't tie with the column's `space-y-*` rule on specificity, so the
 * rendered gap doesn't depend on Tailwind's class ordering. Under a column
 * these margins are also the F2 defect — a column is a grid item, so a
 * block's `my-12` cannot collapse out of it and stacks on top of the grid's
 * row gap (48 + 48 + 32 = 128px measured between two stacked cards).
 */
export function blockRhythmClass(
  hosted: BlockHostContext | null | undefined,
): string {
  return hosted === 'column' ? '' : 'my-12'
}

/**
 * Reading width for the three zero-config cards (contact form, newsletter
 * signup, work history) — the blocks with no width control of their own.
 *
 * @param hosted - Host context, if any.
 * @returns `max-w-xl` at root, where the card sits in the full content column
 * and needs a measure; `max-w-none` inside a column, where the editor already
 * picked the width and a capped card strands the rest of the section's
 * background band.
 */
export function zeroConfigCardWidthClass(
  hosted: BlockHostContext | null | undefined,
): string {
  return hosted === 'column' ? 'max-w-none' : 'max-w-xl'
}

/**
 * Space between the blocks a column stacks.
 *
 * @remarks Not a new number: it is the hard-coded homepage rail's
 * `space-y-10`, the site's existing stacked-card rhythm (`hostContext.test.ts`
 * reads it back out of the homepage source, the way `layout.test.ts` guards
 * the container gutter, so neither side can drift silently). It only takes
 * effect because column-hosted blocks stop emitting `my-12`
 * ({@link blockRhythmClass}).
 */
export const COLUMN_STACK_SPACING_CLASS = 'space-y-10'

/*
 * Viewport → container-query threshold map for the block grids (F1).
 *
 * A block grid used to size itself against the *viewport*, which is only ever
 * right for a root-hosted block: in a half column at desktop `lg:grid-cols-3`
 * still fired and crammed three ~150px cards into ~470px. The grids now query
 * their own container instead, and these are the thresholds that keep
 * root-hosted rendering on today's breakpoints:
 *
 * - `lg:` (viewport ≥ 1024px) → `@3xl:` (container ≥ 48rem/768px). The
 *   content column jumps 672px → 800px across that breakpoint
 *   (`max-w-2xl` → `lg:max-w-5xl` plus the wider gutters), so any threshold
 *   in (672, 800] maps exactly; 768px is the built-in size that fits, and
 *   the mapping is exact at every viewport measured.
 * - `sm:` (viewport ≥ 640px) → `@md:` (container ≥ 28rem/448px). No
 *   threshold can be exact here: the route's padding steps at `sm` make the
 *   content column *narrower* at a 640px viewport (512px) than at 639px
 *   (607px), so the width is not monotonic across the breakpoint it has to
 *   reproduce. 448px keeps every viewport from 640px up on today's layout
 *   and pairs cards early only between a 480px and 639px viewport — a
 *   resized desktop window, not a device.
 *
 * 448 rather than the exact-at-640 alternative (512px) because the content
 * column tops out at 1024px, which makes a half column at most 496px wide:
 * a 512px threshold would mean a half column could never pair its cards at
 * any viewport, and "half column renders its md-ish layout" is the F1
 * acceptance criterion. At 448 a half column pairs up from a 1152px viewport,
 * with ~230px cards — the same card measure the root grid already renders
 * three-up at a 1024px viewport.
 *
 * Each grid declares its query container on the element that already carries
 * the grid's margin (or on a bare wrapper where there is no margin), never on
 * the block's outer `<section>` and never on the host. A query container
 * establishes an independent formatting context, so declaring it further out
 * would stop the grid's `mt-8` collapsing into the section's `my-12` and add
 * 32px of air above every headingless grid — measured in Chrome, 48 → 80px.
 * Declaring it per block also means a block is responsive wherever it is
 * rendered; a block with no query container anywhere above it would silently
 * resolve every container query as false and collapse to one column.
 */
