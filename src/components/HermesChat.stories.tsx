import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import HermesChat from '@/components/HermesChat'

/**
 * Hermes chat surface (Vercel AI SDK). The story renders the idle state —
 * intro, suggestions, and composer. Streaming requires the `/api/hermes`
 * route, so sending a message inside Storybook surfaces the error state
 * (which is itself part of the reviewed UX). Play functions cover the
 * network-free composer behaviors only.
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

/**
 * Interaction: typing lands in the composer, and the retained v3 nicety —
 * an empty submit doesn't fire a request, it refocuses the textarea.
 */
export const ComposerInteractions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText('Ask Hermes...')
    const send = canvas.getByRole('button', { name: /send/i })

    // Empty submit: no navigation/request — focus returns to the input.
    await userEvent.click(send)
    await waitFor(() => expect(input).toHaveFocus())

    // Typing lands in the composer.
    await userEvent.type(input, 'What does Brandon build?')
    await expect(input).toHaveValue('What does Brandon build?')
    await expect(send).toBeEnabled()
  },
}
