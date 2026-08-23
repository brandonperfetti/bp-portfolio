import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ConstellationMark } from './ConstellationMark'

/**
 * Corvus constellation identity mark (#78) — a low-opacity backdrop element
 * behind the page header/hero. The twinkle is pure CSS
 * (`.corvus-constellation-twinkle` in `src/styles/tailwind.css`) and is
 * unconditionally disabled under `prefers-reduced-motion: reduce`; `Static`
 * below exercises the component-level `animate={false}` off-switch instead.
 */
const meta = {
  title: 'Corvus/ConstellationMark',
  component: ConstellationMark,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="rounded-xl bg-[#0e1320] p-6 text-[#d8b25e]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConstellationMark>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: 'h-32 w-32 opacity-40',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const svg = canvas.getByRole('img', { name: 'Corvus constellation mark' })

    await expect(svg).toHaveAttribute('viewBox', '0 0 64 64')
    await expect(svg).toHaveClass('corvus-constellation-twinkle')
  },
}

export const Static: Story = {
  args: {
    className: 'h-32 w-32 opacity-40',
    animate: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const svg = canvas.getByRole('img', { name: 'Corvus constellation mark' })

    await expect(svg).not.toHaveClass('corvus-constellation-twinkle')
  },
}
