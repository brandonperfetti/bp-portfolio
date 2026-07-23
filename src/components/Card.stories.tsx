import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { Card } from '@/components/Card'

/**
 * v3-retained compound card (`Card.Title` / `Card.Description` / `Card.Cta` /
 * `Card.Eyebrow`) used across article lists, projects, and /uses fallbacks.
 */
const meta = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-md p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Article: Story = {
  render: () => (
    <Card as="article">
      <Card.Title href="/articles/example-post">
        Writing tests for React that don&apos;t make you want to quit
      </Card.Title>
      <Card.Eyebrow as="time" dateTime="2026-01-05" decorate>
        January 5, 2026
      </Card.Eyebrow>
      <Card.Description>
        Testing strategy for real codebases: what to cover, what to skip, and
        how to keep the suite fast enough that people actually run it.
      </Card.Description>
      <Card.Cta>Read article</Card.Cta>
    </Card>
  ),
  // Interaction: the title link carries the article href (full-card overlay
  // pattern) and the time element keeps its machine-readable date.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = canvas.getByRole('link', {
      name: /writing tests for react/i,
    })
    await expect(link).toHaveAttribute('href', '/articles/example-post')
    await expect(
      canvasElement.querySelector('time[datetime="2026-01-05"]'),
    ).toBeInTheDocument()
  },
}

export const Plain: Story = {
  render: () => (
    <Card>
      <Card.Title as="h3">A card without a link</Card.Title>
      <Card.Description>
        Titles render as plain headings when no href is provided.
      </Card.Description>
    </Card>
  ),
}
