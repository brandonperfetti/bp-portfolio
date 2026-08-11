import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ColumnShell } from '@/blocks/Column/ColumnShell'
import { COLUMN_SIZES } from '@/blocks/Column/sizes'
import { ContainerGrid } from '@/blocks/Container/ContainerGrid'

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
