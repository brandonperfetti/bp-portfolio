import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HermesChat from '@/components/HermesChat'

/**
 * Fidelity regression test for the #74 mobile-staging bug (addendum 2).
 *
 * `HermesChat.test.tsx` mocks `@ai-sdk/react`'s `useChat` entirely, feeding
 * it a hand-built `error` object — that only proves the UI branch renders
 * correctly GIVEN an already-normalized error. It never exercised the real
 * `useChat` → `DefaultChatTransport` → `fetch` pipeline, and that pipeline
 * is exactly where the original bug lived: the SDK didn't surface the gate's
 * JSON body into `error.message` the way the mocked tests (and the original
 * Storybook stub) implied, so real mobile Safari staging fell through to the
 * generic red error instead of the sign-in prompt.
 *
 * This file mocks NOTHING in the `@ai-sdk/react`/`ai` chain — only
 * `global.fetch`, at the actual network boundary — so it reproduces the real
 * conditions of the bug and guards the fix
 * (`@/lib/ai/hermesChatFetch`'s `createHermesChatFetch`) end-to-end: real
 * `fetch` → real `DefaultChatTransport` → real `useChat` → the sign-in
 * prompt.
 */

vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

beforeEach(() => {
  // jsdom has no Element#scrollTo; the component scroll-follows messages.
  Element.prototype.scrollTo = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HermesChat — real useChat/DefaultChatTransport pipeline', () => {
  it('renders the sign-in prompt (not the generic red error) for the real sign_in_required 401 response', async () => {
    // The exact shape src/app/api/ai/chat/route.ts returns: a clean JSON
    // 401, not a crash — matching what Sentry showed on staging (zero 500s).
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error:
                "You've used your free Hermes messages — sign in to keep chatting.",
              code: 'sign_in_required',
            }),
            {
              status: 401,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    )

    const user = userEvent.setup()
    render(<HermesChat />)

    await user.type(
      screen.getByLabelText('Message Hermes'),
      'One more question?',
    )
    await user.keyboard('{Enter}')

    const signInLink = await screen.findByRole('link', {
      name: /sign in to continue/i,
    })
    expect(signInLink).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-in?redirect_url='),
    )
    // The regression: this must NOT be the generic role="alert" red error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByText(/used your free hermes messages/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('still shows the generic error (not the sign-in prompt) for an unrelated 401', async () => {
    // Guards against over-matching: a 401 that ISN'T this specific gate
    // shape (e.g. some other auth failure) must fall through to the
    // existing generic-error branch, not be swallowed as a false sign-in.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )

    const user = userEvent.setup()
    render(<HermesChat />)

    await user.type(screen.getByLabelText('Message Hermes'), 'Hi')
    await user.keyboard('{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong reaching hermes/i)
    expect(
      screen.queryByRole('link', { name: /sign in to continue/i }),
    ).not.toBeInTheDocument()
  })
})
