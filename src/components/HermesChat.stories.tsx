import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import HermesChat from '@/components/HermesChat'

/**
 * Hermes chat surface (Vercel AI SDK). The story renders the idle state —
 * intro, suggestions, and composer. Streaming requires the `/api/hermes`
 * route, so sending a message inside Storybook surfaces the error state
 * (which is itself part of the reviewed UX).
 */
const meta = {
  title: 'AI/HermesChat',
  component: HermesChat,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HermesChat>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}
