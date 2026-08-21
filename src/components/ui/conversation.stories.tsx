import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MessagesSquare } from 'lucide-react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Message, MessageContent } from '@/components/ui/message'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from './conversation'

/**
 * Scrollable chat viewport: `Conversation` owns stick-to-bottom auto-scroll,
 * `ConversationContent` is the inner spacing wrapper, `ConversationEmptyState`
 * is the pre-message placeholder, and `ConversationScrollButton` offers a
 * manual "jump to latest" once the visitor has scrolled up off the bottom.
 * Powers `CorvusChat` (`src/components/CorvusChat.tsx`).
 */
const meta = {
  title: 'UI/Conversation',
  component: Conversation,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto h-96 max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-700/60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Conversation>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  render: () => (
    <Conversation>
      <ConversationContent>
        <ConversationEmptyState
          icon={<MessagesSquare className="h-6 w-6" />}
          description="Corvus here — ask about Brandon's work, articles, projects, or tech stack."
        />
      </ConversationContent>
    </Conversation>
  ),
}

export const WithMessages: Story = {
  render: () => (
    <Conversation>
      <ConversationContent>
        <Message from="user">
          <MessageContent from="user">What does Brandon build?</MessageContent>
        </Message>
        <Message from="assistant">
          <MessageContent from="assistant">
            Mostly Next.js portfolios, developer tools, and the occasional
            shader experiment.
          </MessageContent>
        </Message>
      </ConversationContent>
    </Conversation>
  ),
}

/**
 * Enough messages to overflow the viewport. The play function scrolls the
 * viewport up off the bottom (a real `scroll` event, driving the component's
 * own listener) and asserts `ConversationScrollButton` appears, then clicks
 * it and asserts the viewport re-pins to the bottom.
 */
export const ScrolledUp: Story = {
  render: () => (
    <Conversation>
      <ConversationContent>
        {Array.from({ length: 12 }, (_, index) => (
          <Message key={index} from={index % 2 === 0 ? 'user' : 'assistant'}>
            <MessageContent from={index % 2 === 0 ? 'user' : 'assistant'}>
              Message number {index + 1}
            </MessageContent>
          </Message>
        ))}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const viewport = canvasElement.querySelector<HTMLDivElement>(
      '[data-slot="conversation"]',
    )
    if (!viewport) throw new Error('conversation viewport not found')

    viewport.scrollTop = 0
    viewport.dispatchEvent(new Event('scroll'))

    const scrollButton = await canvas.findByRole('button', {
      name: /scroll to latest message/i,
    })
    await userEvent.click(scrollButton)

    await waitFor(() =>
      expect(
        canvas.queryByRole('button', { name: /scroll to latest message/i }),
      ).not.toBeInTheDocument(),
    )
  },
}
