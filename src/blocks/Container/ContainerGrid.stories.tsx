import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ColumnShell } from '@/blocks/Column/ColumnShell'
import { ContainerGrid } from '@/blocks/Container/ContainerGrid'

/** Stand-in for a block stacked inside a column. */
function Panel({ body, label }: { body: string; label: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900">
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
        {label}
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
    </div>
  )
}

/**
 * The presentational container: a 12-column grid whose children bring their
 * own spans. Compositions here mirror what an editor assembles in the admin.
 */
const meta = {
  title: 'PageBuilder/Container',
  component: ContainerGrid,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContainerGrid>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The layout this block exists for: a wide main column beside a narrow
 * rail, each holding different blocks. Below `lg` the rail drops under the
 * main column instead of squeezing beside it.
 */
export const TwoThirdsPlusOneThird: Story = {
  args: {
    children: (
      <>
        <ColumnShell size="twoThirds">
          <Panel
            label="Main column"
            body="Two thirds of the row from lg up — the article list, feature grid, or whatever leads the section."
          />
        </ColumnShell>
        <ColumnShell size="oneThird">
          <Panel
            label="Rail"
            body="One third of the row — a newsletter signup, contact form, or work-history card."
          />
        </ColumnShell>
      </>
    ),
  },
  // Interaction: the two columns claim 8 + 4 of the 12 tracks, and both
  // carry the full-width mobile span that makes the grid stack.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const main = canvas.getByText('Main column').closest('div.col-span-12')
    const rail = canvas.getByText('Rail').closest('div.col-span-12')

    await expect(main).toHaveClass('col-span-12', 'lg:col-span-8')
    await expect(rail).toHaveClass('col-span-12', 'lg:col-span-4')
    await expect(main?.parentElement).toHaveClass(
      'grid',
      'grid-cols-12',
      'gap-8',
    )
  },
}

/** Three equal columns — the other common shape a 12-track grid affords. */
export const Thirds: Story = {
  args: {
    children: (
      <>
        <ColumnShell size="oneThird">
          <Panel label="First" body="One third." />
        </ColumnShell>
        <ColumnShell size="oneThird">
          <Panel label="Second" body="One third." />
        </ColumnShell>
        <ColumnShell size="oneThird">
          <Panel label="Third" body="One third." />
        </ColumnShell>
      </>
    ),
  },
}

/**
 * A quarter rail beside a three-quarter main column, showing the widths the
 * legacy rich-text `content` block never offered.
 */
export const ThreeQuartersPlusOneQuarter: Story = {
  args: {
    children: (
      <>
        <ColumnShell size="threeQuarters">
          <Panel label="Wide" body="Three quarters of the row from lg up." />
        </ColumnShell>
        <ColumnShell size="oneQuarter">
          <Panel label="Narrow" body="One quarter of the row from lg up." />
        </ColumnShell>
      </>
    ),
  },
}
