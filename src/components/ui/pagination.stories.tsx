import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { ListPagination } from '@/components/ui/pagination'

/**
 * The shared list-pagination control (#88). One primitive backs `/articles`,
 * `/projects`, `/tech` and `/uses`; it renders nothing below the
 * `total > pageSize` threshold, so the three low-count surfaces adopt it as an
 * automatic no-op.
 *
 * Every control is a real `<a href>` (⌘-click opens a new tab); a plain click
 * is intercepted for client-side navigation. "Previous" is omitted on the first
 * page and "Next" on the last rather than rendered disabled.
 */
const meta = {
  title: 'UI/Pagination',
  component: ListPagination,
  tags: ['autodocs'],
  args: {
    page: 3,
    totalPages: 5,
    label: 'Articles pagination',
    buildHref: (page: number) =>
      page <= 1 ? '/articles' : `/articles?page=${page}`,
    onNavigate: () => {},
  },
  argTypes: {
    page: { control: { type: 'number', min: 1 } },
    totalPages: { control: { type: 'number', min: 1 } },
    buildHref: { table: { disable: true } },
    onNavigate: { table: { disable: true } },
  },
} satisfies Meta<typeof ListPagination>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** First page: no "Previous" control, and page 1 carries `aria-current`. */
export const FirstPage: Story = {
  args: { page: 1, totalPages: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Articles pagination' })
    await expect(
      within(nav).queryByRole('link', { name: /previous/i }),
    ).toBeNull()
    await expect(
      within(nav).getByRole('link', { name: 'Go to page 1' }),
    ).toHaveAttribute('aria-current', 'page')
  },
}

/** Last page: no "Next" control. */
export const LastPage: Story = {
  args: { page: 5, totalPages: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Articles pagination' })
    await expect(within(nav).queryByRole('link', { name: /next/i })).toBeNull()
    await expect(
      within(nav).getByRole('link', { name: /previous/i }),
    ).toBeVisible()
  },
}

/**
 * A long range collapses to first / neighbours / last with gap markers, so the
 * strip stays a fixed width at 390px as well as 1512px.
 */
export const ManyPages: Story = {
  args: { page: 12, totalPages: 40 },
}

/**
 * Below the threshold (`total <= pageSize`, i.e. a single page) the component
 * renders nothing at all — the "no dead UI" rule that makes `/projects`,
 * `/tech` and `/uses` no-ops at today's counts.
 */
export const BelowThreshold: Story = {
  args: { page: 1, totalPages: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull()
  },
}

/** Keyboard focus reaches every control, and activation reports the target page. */
export const KeyboardAndActivation: Story = {
  render: function KeyboardAndActivationStory(args) {
    const [page, setPage] = useState(2)
    return (
      <div className="space-y-4">
        <p data-testid="current-page" className="text-sm">
          Page {page}
        </p>
        <ListPagination
          {...args}
          page={page}
          totalPages={6}
          onNavigate={setPage}
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const target = canvas.getByRole('link', { name: 'Go to page 4' })

    await userEvent.tab()
    await expect(document.activeElement).not.toBe(document.body)

    await userEvent.click(target)
    await expect(canvas.getByTestId('current-page')).toHaveTextContent('Page 4')
  },
}
