import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import SignUpPage from './page'

/**
 * #96: sign-up (and its email-code verification step, part of the same
 * `<SignUp>` flow) must route in-app and on-theme instead of falling back
 * to Clerk's unstyled hosted Account Portal.
 *
 * `@clerk/nextjs` is mocked entirely — mounting the real `<SignUp>` needs a
 * live `ClerkProvider` plus a network round-trip
 * (`useEnforceCatchAllRoute`), neither of which exist in jsdom — matching
 * the existing mocking pattern for this module (see
 * `CorvusChat.test.tsx`). The mock renders the props it received so the
 * assertions below pin the actual routing contract this fix depends on:
 * `path`/`routing="path"` (this route's `[[...sign-up]]` catch-all) and
 * `signInUrl` (keeps the "Sign in" cross-link in-app regardless of whether
 * `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is set).
 */
vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: Record<string, unknown>) => (
    <div data-testid="sign-up" data-props={JSON.stringify(props)} />
  ),
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SignUpPage', () => {
  it('shows the "not configured" notice — not the Clerk component — when Clerk keys are absent', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(<SignUpPage />)

    expect(screen.getByText(/sign-up isn.t configured/i)).toBeInTheDocument()
    expect(screen.queryByTestId('sign-up')).not.toBeInTheDocument()
  })

  it('renders the in-app <SignUp> pinned to /sign-up with the sign-in cross-link kept in-app, when Clerk is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')

    render(<SignUpPage />)

    expect(
      screen.queryByText(/sign-up isn.t configured/i),
    ).not.toBeInTheDocument()
    const props = JSON.parse(
      screen.getByTestId('sign-up').dataset.props ?? '{}',
    )
    expect(props).toMatchObject({
      path: '/sign-up',
      routing: 'path',
      signInUrl: '/sign-in',
    })
  })
})
