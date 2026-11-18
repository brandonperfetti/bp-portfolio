import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

import SignUpPage from './page'

/**
 * The sign-up page mounts the site's own form (#377) when Clerk is
 * configured, and a notice when it is not.
 *
 * `@clerk/nextjs` is mocked: the real hook needs a live `ClerkProvider`. The
 * form's behaviour is `SignUpForm.test.tsx`'s subject; this pins only that
 * the page shows it, with the opt-in in it and unticked (#362), and that
 * Clerk's prebuilt `<SignUp>` is no longer what renders.
 */
vi.mock('@clerk/nextjs', () => ({
  useSignUp: () => ({
    fetchStatus: 'idle',
    errors: {
      fields: { emailAddress: null, password: null, code: null, captcha: null },
      global: null,
      raw: null,
    },
    signUp: {
      status: 'missing_requirements',
      unverifiedFields: [],
      missingFields: [],
      emailAddress: null,
    },
  }),
  SignUp: () => <div data-testid="clerk-prebuilt-sign-up" />,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next-themes', () => ({ useTheme: () => ({}) }))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SignUpPage', () => {
  it('shows the "not configured" notice, not the form, when Clerk keys are absent', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(<SignUpPage />)

    expect(screen.getByText(/sign-up isn.t configured/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Create your account' }),
    ).not.toBeInTheDocument()
  })

  it("renders the site's own form, with the opt-in inside it and unticked, when Clerk is configured", () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')

    render(<SignUpPage />)

    expect(
      screen.queryByText(/sign-up isn.t configured/i),
    ).not.toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Create your account' })
    const box = screen.getByRole('checkbox', {
      name: MAILING_LIST_OPT_IN_LABEL,
    })
    expect(form).toContainElement(box)
    expect(box).not.toBeChecked()
    expect(
      screen.queryByTestId('clerk-prebuilt-sign-up'),
    ).not.toBeInTheDocument()
  })
})
