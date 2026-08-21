import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { RavenMark } from './RavenMark'

/**
 * Corvus raven identity mark (#78). `currentColor`-driven, so the decorator
 * sets `color` to preview it the way it renders on the atlas surface — gold
 * on ink at rest.
 */
const meta = {
  title: 'Corvus/RavenMark',
  component: RavenMark,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="rounded-xl bg-[#0e1320] p-6 text-[#d8b25e]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RavenMark>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: 'h-16 w-16',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const svg = canvas.getByRole('img', { name: 'Corvus raven mark' })

    await expect(svg).toHaveAttribute('viewBox', '0 0 64 64')
    await expect(svg).toHaveAttribute('fill', 'currentColor')
  },
}

/** Decorative usage (e.g. beside visible wordmark text): hidden from AT. */
export const Decorative: Story = {
  args: {
    className: 'h-8 w-8',
    'aria-hidden': 'true',
  },
}
