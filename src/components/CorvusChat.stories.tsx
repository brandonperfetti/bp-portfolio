import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
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

/** Stubs the chat route's real `sign_in_required` 401 for the gate stories.
 *
 * @returns A restore closure that puts the original `window.fetch` back; call
 * it in a `finally` so one story's stub can never leak into the next.
 */
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
 * Drives the chat to the sign-in gate and returns its CTA.
 *
 * @param canvasElement - The story root, from the play context.
 * @returns The gate's sign-in link, mounted and ready to interact with.
 */
async function reachSignInGate(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const input = canvas.getByPlaceholderText('Ask Corvus...')
  await userEvent.type(input, 'One more question?')
  await userEvent.click(canvas.getByRole('button', { name: /send/i }))

  const cta = await canvas.findByRole('link', { name: /sign in to continue/i })
  return cta as HTMLAnchorElement
}

/**
 * Reaches the sign-in gate, then hovers its CTA — the shared body of the
 * `#139` hover stories.
 *
 * @param canvasElement - The story root, from the play context.
 * @returns The hovered CTA link, ready to assert computed styles on.
 */
async function hoverSignInGateCta(canvasElement: HTMLElement) {
  const cta = await reachSignInGate(canvasElement)
  await userEvent.hover(cta)
  return cta
}

/**
 * Tabs until the CTA holds focus, so the browser sets `:focus-visible` — a
 * programmatic `.focus()` does not, and `:focus-visible` is the discriminator
 * the dark hover rule keys on.
 *
 * @param cta - The gate's sign-in link.
 */
async function tabToSignInGateCta(cta: HTMLAnchorElement) {
  for (let i = 0; i < 20 && document.activeElement !== cta; i += 1) {
    await userEvent.tab()
  }
  await expect(cta).toHaveFocus()
}

/** The dark hover ring, `--corvus-accent-ring-hover` (teal-300) as rendered. */
const RING_RGB = 'rgb(94, 234, 212)'
/** `--corvus-accent` (teal-400), the focus outline colour on the dark surface. */
const FOCUS_RGB = 'rgb(45, 212, 191)'
/** `--corvus-accent-solid` (teal-700), the resting fill dark hover keeps. */
const RESTING_FILL_RGB = 'rgb(15, 118, 110)'
/** `--corvus-accent-solid-hover` (teal-800), the light theme's hover fill. */
const LIGHT_HOVER_FILL_RGB = 'rgb(17, 94, 89)'

/** Wraps a story in the `.corvus-surface` scope the gate CSS keys on. */
const withCorvusSurface: Decorator = (Story) => (
  <div className="corvus-surface rounded-3xl p-4">
    <Story />
  </div>
)

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
    const restoreFetch = stubSignInRequired()
    try {
      const canvas = within(canvasElement)
      const signInLink = await reachSignInGate(canvasElement)
      await expect(signInLink).toHaveAttribute(
        'href',
        expect.stringContaining('/sign-in?redirect_url='),
      )
      await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: /send/i })).toBeDisabled()
      await expect(canvas.getByLabelText('Message Corvus')).toBeDisabled()
    } finally {
      restoreFetch()
    }
  },
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
  decorators: [withCorvusSurface],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const cta = await hoverSignInGateCta(canvasElement)
      const style = getComputedStyle(cta)
      // The ring is present…
      await expect(style.boxShadow).toContain(RING_RGB)
      // …and the fill did NOT step to teal-800.
      await expect(style.backgroundColor).toBe(RESTING_FILL_RGB)
    } finally {
      restoreFetch()
    }
  },
}

/**
 * #139, dark, keyboard path: the rule's discriminator is
 * `:hover:not(:focus-visible)`, so the one state worth pinning is
 * focused **and** hovered at once — a keyboard user whose pointer happens to
 * rest on the control. Exactly one indicator must show, and it must be the
 * focus outline: a hover ring drawn over the focus ring is how a focus
 * indicator quietly goes missing (WCAG 2.4.7).
 */
export const SignInGateHoverDarkKeyboardFocus: Story = {
  globals: { theme: 'dark' },
  decorators: [withCorvusSurface],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const cta = await reachSignInGate(canvasElement)
      await tabToSignInGateCta(cta)
      await userEvent.hover(cta)

      const style = getComputedStyle(cta)
      // The focus outline is what is showing…
      await expect(style.outlineColor).toBe(FOCUS_RGB)
      await expect(style.outlineStyle).toBe('solid')
      await expect(parseFloat(style.outlineWidth)).toBeGreaterThan(0)
      // …and the hover ring is suppressed, so there is exactly one indicator.
      await expect(style.boxShadow).not.toContain(RING_RGB)
      // The fill still does not step, focused or not.
      await expect(style.backgroundColor).toBe(RESTING_FILL_RGB)
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
  decorators: [withCorvusSurface],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const cta = await hoverSignInGateCta(canvasElement)
      const style = getComputedStyle(cta)
      // teal-800 fill step, and no hover ring.
      await expect(style.backgroundColor).toBe(LIGHT_HOVER_FILL_RGB)
      await expect(style.boxShadow).not.toContain(RING_RGB)
    } finally {
      restoreFetch()
    }
  },
}
