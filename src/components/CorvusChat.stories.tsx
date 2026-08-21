import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import CorvusChat from '@/components/CorvusChat'

/**
 * Corvus chat surface (Vercel AI SDK). `Idle` renders the empty state —
 * intro, suggestions, and composer. `RateLimited` and `SignInRequired` stub
 * `fetch` to drive the chat route's two non-stream error responses (#74)
 * through the real `useChat` error branch, without a real backend.
 */
const meta = {
  title: 'AI/CorvusChat',
  component: CorvusChat,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CorvusChat>

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
    const input = canvas.getByPlaceholderText('Ask Corvus...')
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

/**
 * Rate-limit error state (existing `checkChatLimits` 429 branch, #74's
 * regression bar). The play function stubs `fetch` to return the route's
 * real 429 shape so `useChat`'s transport throws the same `Error` it would
 * in production (`new Error(await response.text())`), driving CorvusChat's
 * own error-branch matching rather than a hand-rolled mock of `useChat`.
 */
export const RateLimited: Story = {
  play: async ({ canvasElement }) => {
    const originalFetch = window.fetch
    window.fetch = (async () =>
      new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please slow down.' }),
        { status: 429 },
      )) as typeof window.fetch

    try {
      const canvas = within(canvasElement)
      const input = canvas.getByPlaceholderText('Ask Corvus...')
      await userEvent.type(input, 'How many messages do I get?')
      await userEvent.click(canvas.getByRole('button', { name: /send/i }))

      const alert = await canvas.findByRole('alert')
      await expect(alert).toHaveTextContent(/rate limit/i)
    } finally {
      window.fetch = originalFetch
    }
  },
}

/**
 * Auth soft-gate state (#74, folds #18): the anon free-message ceiling has
 * been hit. Stubs `fetch` to return the chat route's real
 * `{ code: 'sign_in_required' }` 401 shape. Renders as a friendly on-brand
 * prompt — never `role="alert"` — with a working Clerk sign-in link, and
 * disables the composer so a fourth attempt can't be typed while gated.
 * Static markup (no animation), so this state needs no separate
 * reduced-motion variant.
 */
export const SignInRequired: Story = {
  play: async ({ canvasElement }) => {
    const originalFetch = window.fetch
    window.fetch = (async () =>
      new Response(
        JSON.stringify({
          error:
            "You've used your free Corvus messages — sign in to keep chatting.",
          code: 'sign_in_required',
        }),
        { status: 401 },
      )) as typeof window.fetch

    try {
      const canvas = within(canvasElement)
      const input = canvas.getByPlaceholderText('Ask Corvus...')
      await userEvent.type(input, 'One more question?')
      await userEvent.click(canvas.getByRole('button', { name: /send/i }))

      const signInLink = await canvas.findByRole('link', {
        name: /sign in to continue/i,
      })
      await expect(signInLink).toHaveAttribute(
        'href',
        expect.stringContaining('/sign-in?redirect_url='),
      )
      await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: /send/i })).toBeDisabled()
      await expect(canvas.getByLabelText('Message Corvus')).toBeDisabled()
    } finally {
      window.fetch = originalFetch
    }
  },
}
