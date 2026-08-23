import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Message, MessageContent } from './message'

/**
 * Chat bubble primitives: `Message` is the row (aligns left/right by
 * `from`), `MessageContent` is the colored bubble itself. Token-driven
 * (zinc/teal) — the current Corvus palette, not the distinct visual
 * identity tracked separately in #78.
 */
const meta = {
  title: 'UI/Message',
  component: Message,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg space-y-3 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Message>

export default meta
type Story = StoryObj<typeof meta>

export const Assistant: Story = {
  args: { from: 'assistant' },
  render: () => (
    <Message from="assistant">
      <MessageContent from="assistant">
        Mostly Next.js portfolios, developer tools, and the occasional shader
        experiment.
      </MessageContent>
    </Message>
  ),
}

export const User: Story = {
  args: { from: 'user' },
  render: () => (
    <Message from="user">
      <MessageContent from="user">What does Brandon build?</MessageContent>
    </Message>
  ),
}

export const Exchange: Story = {
  args: { from: 'assistant' },
  render: () => (
    <>
      <Message from="user">
        <MessageContent from="user">What does Brandon build?</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent from="assistant">
          Mostly Next.js portfolios, developer tools, and the occasional shader
          experiment.
        </MessageContent>
      </Message>
    </>
  ),
}
