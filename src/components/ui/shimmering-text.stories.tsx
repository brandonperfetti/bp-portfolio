import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ShimmeringText } from './shimmering-text'

/**
 * Forces `(prefers-reduced-motion: reduce)` for one story.
 *
 * @remarks A Storybook `beforeEach` rather than a decorator: the swap has to
 * land before the component's own `useLayoutEffect` reads `matchMedia`, and a
 * decorator's effects run *after* its children's. Returning the restore
 * function keeps the override scoped to the story that asked for it.
 */
const forceReducedMotion = async () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  return () => {
    window.matchMedia = original
  }
}

/**
 * A short "in progress" label with a subtle CSS light-sweep shimmer — used
 * for Corvus's "thinking…" indicator. Pure CSS (`animate-text-shimmer` /
 * `@keyframes text-shimmer` in `src/styles/tailwind.css`) driven by
 * `background-position` on a `background-clip: text` gradient; no Motion
 * dependency.
 */
const meta = {
  title: 'UI/ShimmeringText',
  component: ShimmeringText,
  tags: ['autodocs'],
  args: {
    text: 'Corvus is thinking…',
  },
  decorators: [
    (Story) => (
      <div className="p-4 text-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShimmeringText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas.getByText('Corvus is thinking…')

    await expect(text).toHaveClass('animate-text-shimmer')
    await expect(getComputedStyle(text).webkitTextFillColor).toBe(
      'rgba(0, 0, 0, 0)',
    )
  },
}

/**
 * The reduced-motion contract: a visitor who asks for less motion gets a
 * flat, non-animated fill — no shimmer keyframes attached.
 */
export const ReducedMotion: Story = {
  beforeEach: forceReducedMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas.getByText('Corvus is thinking…')

    await expect(text).not.toHaveClass('animate-text-shimmer')
    await expect(getComputedStyle(text).animationName).toBe('none')
  },
}
