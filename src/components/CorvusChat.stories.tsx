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

/**
 * Reaches the sign-in gate, then hovers its CTA — the shared body of the two
 * `#139` hover stories.
 *
 * @param canvasElement - The story root, from the play context.
 * @returns The hovered CTA link, ready to assert computed styles on.
 */
async function hoverSignInGateCta(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const input = canvas.getByPlaceholderText('Ask Corvus...')
  await userEvent.type(input, 'One more question?')
  await userEvent.click(canvas.getByRole('button', { name: /send/i }))

  const cta = await canvas.findByRole('link', { name: /sign in to continue/i })
  await userEvent.hover(cta)
  return cta as HTMLAnchorElement
}

/** Stubs the chat route's real `sign_in_required` 401 for the gate stories. */
function stubSignInRequired() {
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
  return () => {
    window.fetch = originalFetch
  }
}

/**
 * #139, dark: inside `.corvus-surface` the gate CTA's hover keeps its resting
 * teal-700 fill and gains a teal-300 ring instead. No teal fill step can hold
 * the white label at 4.5:1 AND the button's own edge at 3:1 against the
 * near-black gate panel at the same time; the ring measures 3.70:1 against the
 * fill and 13.38:1 against the panel, so both of its edges clear 1.4.11.
 */
export const SignInGateHoverDark: Story = {
  globals: { theme: 'dark' },
  decorators: [
    (Story) => (
      <div className="corvus-surface rounded-3xl p-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const cta = await hoverSignInGateCta(canvasElement)
      const style = getComputedStyle(cta)
      // The ring is present…
      await expect(style.boxShadow).toMatch(/rgb\(94,\s*234,\s*212\)/)
      // …and the fill did NOT step to teal-800 (#115e59).
      await expect(style.backgroundColor).toBe('rgb(15, 118, 110)')
    } finally {
      restoreFetch()
    }
  },
}

/**
 * #139, light: unchanged. The gate CTA still hovers to the darker teal-800
 * fill, which on the light gate panel clears both floors (label 7.58:1, fill
 * edge 6.90:1) — the residual only ever existed against the dark panel.
 */
export const SignInGateHoverLight: Story = {
  globals: { theme: 'light' },
  decorators: [
    (Story) => (
      <div className="corvus-surface rounded-3xl p-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const cta = await hoverSignInGateCta(canvasElement)
      const style = getComputedStyle(cta)
      // teal-800 fill step, and no hover ring.
      await expect(style.backgroundColor).toBe('rgb(17, 94, 89)')
      await expect(style.boxShadow).not.toMatch(/rgb\(94,\s*234,\s*212\)/)
    } finally {
      restoreFetch()
    }
  },
}
