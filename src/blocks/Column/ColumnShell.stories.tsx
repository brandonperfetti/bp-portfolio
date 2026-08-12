import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ColumnShell } from '@/blocks/Column/ColumnShell'
import { COLUMN_SIZES } from '@/blocks/Column/sizes'
import { ContainerGrid } from '@/blocks/Container/ContainerGrid'
import { RenderBlocks, type RenderableBlock } from '@/blocks/RenderBlocks'

/** Stand-in for the blocks an editor stacks inside a column. */
function Panel({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900">
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
        {label}
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Column content is whatever blocks the editor drops in — this panel
        stands in for one of them.
      </p>
    </div>
  )
}

/**
 * The presentational column: a width from the shared size vocabulary, shown
 * inside the container grid it always lives in. One story per size, so a
 * width regression is visible rather than inferred. Resize the viewport
 * below `lg` and every one of them spans the full row.
 */
const meta = {
  title: 'PageBuilder/Column',
  component: ColumnShell,
  tags: ['autodocs'],
  args: {
    children: <Panel label="Column content" />,
  },
  argTypes: {
    size: {
      control: 'select',
      options: COLUMN_SIZES.map((size) => size.value),
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-4xl">
        <ContainerGrid>
          <Story />
        </ContainerGrid>
      </div>
    ),
  ],
} satisfies Meta<typeof ColumnShell>

export default meta
type Story = StoryObj<typeof meta>

export const OneQuarter: Story = {
  args: { size: 'oneQuarter' },
}

export const OneThird: Story = {
  args: { size: 'oneThird' },
}

export const Half: Story = {
  args: { size: 'half' },
}

export const TwoThirds: Story = {
  args: { size: 'twoThirds' },
}

export const ThreeQuarters: Story = {
  args: { size: 'threeQuarters' },
}

/**
 * The default a new column starts at — and the fallback for any size value
 * the renderer doesn't recognise.
 */
export const Full: Story = {
  args: { size: 'full' },
  // Interaction: full width still carries the mobile span, so the same
  // markup stacks below `lg` without a renderer-side branch.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const column = canvas.getByText('Column content').closest('div.col-span-12')
    await expect(column).not.toBeNull()
    await expect(column).toHaveClass('col-span-12', 'lg:col-span-12')
  },
}

/**
 * An unrecognised stored size (a value removed from the vocabulary, say)
 * falls back to full width rather than collapsing to nothing.
 */
export const UnknownSizeFallsBackToFull: Story = {
  args: { size: 'oneHalf' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const column = canvas.getByText('Column content').closest('div.col-span-12')
    await expect(column).toHaveClass('lg:col-span-12')
  },
}

/** A long column, so a sticky neighbour has something to travel beside. */
function TallColumn() {
  return (
    <ColumnShell size="twoThirds">
      <div className="space-y-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Panel key={index} label={`Article ${index + 1}`} />
        ))}
      </div>
    </ColumnShell>
  )
}

/**
 * The layout #29 exists for: a rail that follows the scroll beside a longer
 * main column, exactly as the hard-coded homepage does. Scroll the preview to
 * watch it hold at `top-10`, then switch to a mobile viewport — below `lg`
 * the rail is just a stacked block and nothing sticks.
 */
export const StickyRail: Story = {
  args: { size: 'oneThird', sticky: true },
  globals: { viewport: { value: 'desktop' } },
  // Rendered as a sibling inside the meta's grid rather than through a
  // decorator, so the rail and the tall column share one grid.
  render: (args) => (
    <>
      <TallColumn />
      <ColumnShell {...args} />
    </>
  ),
  // Interaction: sticky is desktop-only and top-aligned. The bare `sticky`
  // class would stick on phones too; without `self-start` the column
  // stretches to the row height and has no slack to travel through.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rail = canvas.getByText('Column content').closest('div.col-span-12')

    await expect(rail).toHaveClass('self-start', 'lg:sticky', 'lg:top-10')
    await expect(rail).not.toHaveClass('sticky')
    await expect(rail).not.toHaveClass('top-10')
  },
}

/**
 * The same rail on a phone: the columns are stacked, and every sticky class
 * is behind `lg:`, so nothing sticks. #29 is explicit that sticky is a
 * desktop behaviour — a rail that pinned itself on a phone would sit on top
 * of the content it belongs beside.
 */
export const StickyRailMobile: Story = {
  args: { size: 'oneThird', sticky: true },
  globals: { viewport: { value: 'mobile1' } },
  render: (args) => (
    <>
      <TallColumn />
      <ColumnShell {...args} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rail = canvas.getByText('Column content').closest('div.col-span-12')

    // Same markup as the desktop story — the breakpoint prefixes are the
    // only thing standing between this rail and a phone-sized sticky bug.
    await expect(rail).toHaveClass('col-span-12')
    for (const className of rail?.className.split(' ') ?? []) {
      if (className.includes('sticky') || className.startsWith('top-')) {
        await expect(className).toMatch(/^lg:/)
      }
    }
  },
}

/**
 * An archive-like card grid as the admin stores it — the shape that used to
 * cram three columns into a half column because it sized itself off the
 * window (visual-QA F1).
 */
const CARD_GRID = [
  {
    blockType: 'featureCardGrid',
    id: 'hosted-grid',
    heading: 'Recent work',
    cards: [
      {
        id: 'g1',
        title: 'A card',
        copy: 'Cards pair up once the grid has room for two.',
        enableLink: false,
      },
      {
        id: 'g2',
        title: 'Another card',
        copy: 'And go three-up at the width the content column reaches.',
        enableLink: false,
      },
      {
        id: 'g3',
        title: 'A third card',
        copy: 'Below that they stack, however wide the window is.',
        enableLink: false,
      },
    ],
  },
] as unknown as RenderableBlock[]

/** The newsletter signup — one of the three cards with no width control. */
const ZERO_CONFIG_CARD = [
  { blockType: 'newsletterSignup', id: 'hosted-card' },
] as unknown as RenderableBlock[]

/**
 * Columns the way the container renders them, so the fixtures exercise the
 * real dispatch path (`hosted="column"`) rather than a hand-built stand-in.
 */
function HostedBlocks({ blocks }: { blocks: RenderableBlock[] }) {
  return <RenderBlocks blocks={blocks} hosted="column" />
}

/** Track count Chrome resolved for a grid — the thing container queries move. */
const renderedColumnCount = (grid: Element) =>
  getComputedStyle(grid).gridTemplateColumns.split(' ').length

/**
 * What the thresholds in `hostContext.ts` say a grid of this container width
 * should render: `@md` (448px) pairs the cards, `@3xl` (768px) goes three-up.
 */
const expectedColumnCount = (containerWidth: number) =>
  containerWidth >= 768 ? 3 : containerWidth >= 448 ? 2 : 1

/**
 * Asserts the column's half of the bargain plus the grid's: the column states
 * the rhythm, the hosted block states none, and the grid's column count
 * follows *its own* container width at whatever size the runner's window is.
 */
async function expectContextAwareColumn(canvasElement: HTMLElement) {
  const column = canvasElement.querySelector('div.col-span-12')
  await expect(column).toHaveClass('space-y-10')

  const section = column?.querySelector('section')
  await expect(section).not.toHaveClass('my-12')

  const queryContainer = canvasElement.querySelector<HTMLElement>(
    '[class*="@container"]',
  )
  const grid = queryContainer?.querySelector('ul[role="list"]')
  await expect(grid).not.toBeNull()
  await expect(renderedColumnCount(grid as Element)).toBe(
    expectedColumnCount(queryContainer?.clientWidth ?? 0),
  )
}

/**
 * F1, narrow end: a quarter-width column. The grid measures its own box, so
 * the cards stack instead of splintering into unreadable strips — the same
 * markup that goes three-up at root.
 */
export const HostedGridInNarrowColumn: Story = {
  args: { size: 'oneQuarter' },
  globals: { viewport: { value: 'desktop' } },
  render: (args) => (
    <ColumnShell {...args}>
      <HostedBlocks blocks={CARD_GRID} />
    </ColumnShell>
  ),
  play: async ({ canvasElement }) => {
    await expectContextAwareColumn(canvasElement)
  },
}

/**
 * F1, the measured defect: a half column at desktop. This is where
 * `lg:grid-cols-3` used to fire in ~470px and produce three ~150px columns.
 */
export const HostedGridInHalfColumn: Story = {
  args: { size: 'half' },
  globals: { viewport: { value: 'desktop' } },
  render: (args) => (
    <ColumnShell {...args}>
      <HostedBlocks blocks={CARD_GRID} />
    </ColumnShell>
  ),
  play: async ({ canvasElement }) => {
    await expectContextAwareColumn(canvasElement)
  },
}

/** F1, wide end: a full-width column, where the grid has room to spread. */
export const HostedGridInFullColumn: Story = {
  args: { size: 'full' },
  globals: { viewport: { value: 'desktop' } },
  render: (args) => (
    <ColumnShell {...args}>
      <HostedBlocks blocks={CARD_GRID} />
    </ColumnShell>
  ),
  play: async ({ canvasElement }) => {
    await expectContextAwareColumn(canvasElement)
  },
}

/**
 * F2, the stacked case: two blocks in one column. The blocks bring no margin
 * of their own, so the space between them is the column's `space-y-10` —
 * once, not a block margin on top of a row gap.
 */
export const HostedStackOwnsItsRhythm: Story = {
  args: { size: 'full' },
  globals: { viewport: { value: 'desktop' } },
  render: (args) => (
    <ColumnShell {...args}>
      <HostedBlocks blocks={[...ZERO_CONFIG_CARD, ...CARD_GRID]} />
    </ColumnShell>
  ),
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector('div.col-span-12')
    const [first, second] = Array.from(
      column?.querySelectorAll(':scope > section') ?? [],
    )

    // Nothing sticks out past the column's own edges: the stack's spacing
    // lives between the blocks, not around them.
    await expect(getComputedStyle(first).marginTop).toBe('0px')
    await expect(getComputedStyle(second).marginBottom).toBe('0px')

    // And between them it is stated exactly once (space-y-10 = 40px), rather
    // than a block margin collapsing — or failing to — over a row gap.
    const gap =
      second.getBoundingClientRect().top - first.getBoundingClientRect().bottom
    await expect(Math.round(gap)).toBe(40)
  },
}

/**
 * F3 in a half column: the card fills the width the editor chose. Its own
 * `max-w-xl` only ever made sense at root, where it is a reading measure
 * rather than a reason to leave half a background band empty.
 */
export const HostedCardInHalfColumn: Story = {
  args: { size: 'half' },
  globals: { viewport: { value: 'desktop' } },
  render: (args) => (
    <>
      <ColumnShell {...args}>
        <HostedBlocks blocks={ZERO_CONFIG_CARD} />
      </ColumnShell>
      <ColumnShell size="half">
        <HostedBlocks blocks={CARD_GRID} />
      </ColumnShell>
    </>
  ),
  play: async ({ canvasElement }) => {
    // Scoped to the column: the decorator's own ContainerGrid section is a
    // root-level block and rightly still carries `my-12`.
    const column = canvasElement.querySelector('div.col-span-12')
    const section = column?.querySelector('section')
    await expect(section).toHaveClass('max-w-none')
    await expect(section).not.toHaveClass('max-w-xl')
    await expect(section).not.toHaveClass('my-12')
  },
}

/**
 * F3 in a full column — the C6 case, where a capped card left the right half
 * of a gradient band empty. The card now measures exactly the column.
 */
export const HostedCardInFullColumn: Story = {
  args: { size: 'full' },
  globals: { viewport: { value: 'desktop' } },
  render: (args) => (
    <ColumnShell {...args}>
      <HostedBlocks blocks={ZERO_CONFIG_CARD} />
    </ColumnShell>
  ),
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector('div.col-span-12')
    const section = column?.querySelector('section')
    await expect(section).toHaveClass('max-w-none')
    // Only a meaningful comparison once the column is wider than the
    // `max-w-xl` the card used to cap itself at.
    if ((column?.clientWidth ?? 0) > 576) {
      await expect(section?.clientWidth).toBe(column?.clientWidth)
    }
  },
}

/** The same rail with the checkbox off — it scrolls away with the page. */
export const StickyOff: Story = {
  args: { size: 'oneThird', sticky: false },
  render: (args) => (
    <>
      <TallColumn />
      <ColumnShell {...args} />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rail = canvas.getByText('Column content').closest('div.col-span-12')

    await expect(rail).not.toHaveClass('lg:sticky')
    await expect(rail).not.toHaveClass('self-start')
  },
}
