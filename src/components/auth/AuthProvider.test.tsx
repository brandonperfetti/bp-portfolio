import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/components/auth/AuthProvider'

/**
 * #96: confirms the `ClerkProvider` `appearance` this component sets is
 * actually what makes embedded Clerk components (sign-in, sign-up, the
 * email-code verification step) read as themed rather than default/unstyled
 * — the purple hosted Account Portal is a separate Clerk-hosted surface that
 * does not inherit this prop, so this only covers in-app components, which
 * is the entire point of routing sign-up in-app (#96).
 *
 * `@clerk/nextjs`'s real `ClerkProvider` needs a live Clerk environment to
 * mount, so it's mocked here (rendering the props it received) — matching
 * the `@clerk/nextjs` mocking pattern used elsewhere in this repo (see
 * `CorvusChat.test.tsx`).
 */
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({
    appearance,
    children,
  }: {
    appearance?: Record<string, unknown>
    children?: React.ReactNode
  }) => (
    <div
      data-testid="clerk-provider"
      data-appearance={JSON.stringify(appearance)}
    >
      {children}
    </div>
  ),
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AuthProvider', () => {
  it('renders children with no ClerkProvider wrapper when Clerk is unconfigured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(
      <AuthProvider>
        <div>site content</div>
      </AuthProvider>,
    )

    expect(screen.getByText('site content')).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument()
  })

  it('wraps children in ClerkProvider with the site-teal appearance variables when Clerk is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')

    render(
      <AuthProvider>
        <div>site content</div>
      </AuthProvider>,
    )

    expect(screen.getByText('site content')).toBeInTheDocument()
    const appearance = JSON.parse(
      screen.getByTestId('clerk-provider').dataset.appearance ?? '{}',
    )
    // teal-700 + the site's control radius — this is what makes Clerk's
    // in-app components (including sign-up and its email verification
    // step) read as first-party UI instead of default Clerk styling.
    expect(appearance).toMatchObject({
      variables: {
        colorPrimary: '#0f766e',
        borderRadius: '0.75rem',
      },
    })
  })
})
