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
 * What a zero-config card is asking the page for at root.
 *
 * - `form` — a stack of inputs. A form wider than its labels is harder to
 *   scan, not easier, so it takes a narrow measure of its own even when the
 *   page could give it more.
 * - `content` — prose and facts, which take the content column the route
 *   already set rather than a cap of their own. Capping a card *below* the
 *   column it was given is what reads as the defect (#188).
 */
export type ZeroConfigCardMeasure = 'form' | 'content'

/**
 * Reading width for a zero-config card — the blocks with no width control of
 * their own (contact form, newsletter signup, work history).
 *
 * @param hosted - Host context, if any.
 * @param measure - What the card is: a {@link ZeroConfigCardMeasure}.
 * @returns `max-w-none` inside a column — the editor already picked the width
 * and a capped card strands the rest of the section's background band — and at
 * root the measure decides: `max-w-xl` for a `form`, `max-w-none` for
 * `content`, which then fills the route's content column.
 *
 * @remarks **The `content` case is the exception #188 opened, and it is one
 * block, not a new default.** Two of the three zero-config cards are forms and
 * keep `max-w-xl` at root exactly as before; only the work-history block's
 * per-entry mode asks for `content`, because on `/work/<slug>` a 576px card
 * inside a content column that reaches `lg:max-w-5xl` reads as a layout bug
 * rather than as a reading measure. `content` means "no cap of its own", so it
 * matches an uncapped sibling such as `lead` — and a root-hosted `prose`
 * block too, which carries no width cap of its own in this repo (see
 * `Prose/Component.tsx` for the mechanism). The work block's OTHER mode — the
 * résumé list — is still a `form`-measure card, so the distinction is per
 * render, not per block.
 */
export function zeroConfigCardWidthClassFor(
  hosted: BlockHostContext | null | undefined,
  measure: ZeroConfigCardMeasure,
): string {
  if (hosted === 'column') return 'max-w-none'
  return measure === 'content' ? 'max-w-none' : 'max-w-xl'
}

/**
 * Reading width for a zero-config **form** card (contact form, newsletter
 * signup).
 *
 * @param hosted - Host context, if any.
 * @returns `max-w-xl` at root, `max-w-none` inside a column.
 *
 * @remarks Unchanged behaviour, now expressed as the `form` case of
 * {@link zeroConfigCardWidthClassFor} so there is still exactly one place the
 * two class literals are chosen.
 */
export function zeroConfigCardWidthClass(
  hosted: BlockHostContext | null | undefined,
): string {
  return zeroConfigCardWidthClassFor(hosted, 'form')
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

/**
 * Which document a block is rendering inside — the block's *identity*
 * context, as opposed to {@link BlockHostContext}, which is its *position*.
 *
 * @remarks The two answer different questions and neither substitutes for the
 * other. `hosted` says "root or column", which is a layout fact and is what a
 * block reads to decide its own margin and measure. This says "the `pages` doc
 * with id 7", which is a content fact: it is what lets a block query for
 * things related to the document it was placed on, without knowing the route
 * it was requested through.
 *
 * Deliberately the collection *and* the id, never the id alone: `pages` and
 * `posts` both host layout blocks, both use numeric ids, and a block that
 * queried `parent = 7` without knowing which collection 7 came from would
 * silently roll up the wrong document's children (#177).
 *
 * @remarks This is a **render-time prop, not a request-scope read.** It is
 * threaded from the readers that already loaded the document down through
 * `RenderBlocks`, so a block stays prerenderable: reading `headers()` to
 * recover "which page am I on?" would opt every page containing such a block
 * out of static rendering, which is the opposite of what a CMS block should
 * cost. `hostContext.test.ts` asserts the render path takes no request-scope
 * API.
 */
export type BlockHostDocument = {
  /** Collection the hosting document lives in. */
  collection: 'pages' | 'posts'
  /** The hosting document's id. */
  id: number
}
