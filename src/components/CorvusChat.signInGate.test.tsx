import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * Fidelity regression test for the #74 mobile-staging bug (addendum 2).
 *
 * `CorvusChat.test.tsx` mocks `@ai-sdk/react`'s `useChat` entirely, feeding
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
 * (`@/lib/ai/corvusChatFetch`'s `createCorvusChatFetch`) end-to-end: real
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
// CorvusChat's ClerkFirstNameProbe calls useUser when
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set (local/CI); rendered bare here with
// no <ClerkProvider> it would throw, so mock it (null user = anonymous path).
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}))

beforeEach(() => {
  // jsdom has no Element#scrollTo; the component scroll-follows messages.
  Element.prototype.scrollTo = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CorvusChat — real useChat/DefaultChatTransport pipeline', () => {
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
                "You've used your free Corvus messages — sign in to keep chatting.",
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
    render(<CorvusChat />)

    await user.type(
      screen.getByLabelText('Message Corvus'),
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
      screen.getByText(/used your free corvus messages/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('keeps the sign-in CTA hover above the WCAG AA floor', async () => {
    // #82 / PR #123 carry. The CTA's hover fill went teal-700 → teal-600, i.e.
    // LIGHTER, which drops white-on-teal from 5.36:1 to 3.67:1 — under the
    // 4.5:1 AA floor for its 14px text — for as long as a pointer rests on it.
    // teal-800 is 7.54:1 (ratios computed from the OKLCH tokens Tailwind 4.3.3
    // resolves, not from hex approximations).
    //
    // Scope, stated so this pin is not mistaken for more than it is: on
    // /corvus the class is overridden by `.corvus-surface
    // [data-slot='sign-in-gate-cta']:hover`, which reads
    // `--corvus-accent-solid-hover` in src/styles/tailwind.css. That token has
    // been raised to teal-800 as well, so the surface and the component agree
    // — but it is a different artifact with a different guard
    // (`src/styles/corvus-accent-contrast.test.ts`, which recomputes the
    // ratio). This case asserts only the component's own behaviour, which is
    // what Storybook and every non-surface host get.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "You've used your free Corvus messages.",
              code: 'sign_in_required',
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )

    const user = userEvent.setup()
    render(<CorvusChat />)

    await user.type(screen.getByLabelText('Message Corvus'), 'One more?')
    await user.keyboard('{Enter}')

    const className = (
      await screen.findByRole('link', { name: /sign in to continue/i })
    ).className

    expect(className).not.toContain('hover:bg-teal-600')
    expect(className).toContain('hover:bg-teal-800')
    expect(className).toContain('bg-teal-700')
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
    render(<CorvusChat />)

    await user.type(screen.getByLabelText('Message Corvus'), 'Hi')
    await user.keyboard('{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong reaching corvus/i)
    expect(
      screen.queryByRole('link', { name: /sign in to continue/i }),
    ).not.toBeInTheDocument()
  })
})
