import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import SignInPage from './page'

/**
 * #96: sign-in must route in-app (matching the site theme) instead of
 * falling back to Clerk's unstyled hosted Account Portal.
 *
 * `@clerk/nextjs` is mocked entirely — mounting the real `<SignIn>` needs a
 * live `ClerkProvider` plus a network round-trip
 * (`useEnforceCatchAllRoute`), neither of which exist in jsdom — matching
 * the existing mocking pattern for this module (see
 * `CorvusChat.test.tsx`). The mock renders the props it received so the
 * assertions below pin the actual routing contract this fix depends on:
 * `path`/`routing="path"` (this route's `[[...sign-in]]` catch-all) and
 * `signUpUrl` (keeps the "Sign up" cross-link in-app regardless of whether
 * `NEXT_PUBLIC_CLERK_SIGN_UP_URL` is set).
 */
vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: Record<string, unknown>) => (
    <div data-testid="sign-in" data-props={JSON.stringify(props)} />
  ),
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SignInPage', () => {
  it('shows the "not configured" notice — not the Clerk component — when Clerk keys are absent', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(<SignInPage />)

    expect(screen.getByText(/sign-in isn.t configured/i)).toBeInTheDocument()
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument()
  })

  it('renders the in-app <SignIn> pinned to /sign-in with the sign-up cross-link kept in-app, when Clerk is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')

    render(<SignInPage />)

    expect(
      screen.queryByText(/sign-in isn.t configured/i),
    ).not.toBeInTheDocument()
    const props = JSON.parse(
      screen.getByTestId('sign-in').dataset.props ?? '{}',
    )
    expect(props).toMatchObject({
      path: '/sign-in',
      routing: 'path',
      signUpUrl: '/sign-up',
    })
  })
})
