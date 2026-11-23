import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import SignUpSsoCallbackPage from './page'

/** #377: the Google callback page is gated on Clerk like its siblings. */
vi.mock('@clerk/nextjs', () => ({
  HandleSSOCallback: () => <div data-testid="clerk-callback" />,
  useSignUp: () => ({ signUp: {} }),
  useSignIn: () => ({ signIn: {} }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next-themes', () => ({ useTheme: () => ({}) }))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SignUpSsoCallbackPage', () => {
  it('shows the "not configured" notice when Clerk keys are absent', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(<SignUpSsoCallbackPage />)

    expect(screen.getByText(/sign-up isn.t configured/i)).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-callback')).not.toBeInTheDocument()
  })

  it("mounts Clerk's callback handler when Clerk is configured", () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')

    render(<SignUpSsoCallbackPage />)

    expect(screen.getByTestId('clerk-callback')).toBeInTheDocument()
  })
})
