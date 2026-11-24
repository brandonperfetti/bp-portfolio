import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SignInSsoCallbackPage from '../sso-callback/page'
import SignInPage from './page'

/**
 * The sign-in page mounts the site's own form (#379) when Clerk is
 * configured, and a notice when it is not.
 *
 * `@clerk/nextjs` is mocked: the real hook needs a live `ClerkProvider`. The
 * form's behaviour is `SignInForm.test.tsx`'s subject; this pins that the
 * page shows it in place of Clerk's prebuilt `<SignIn>` (#96's routing
 * concern is gone with it: there is no Clerk component left to fall back to
 * the hosted Account Portal), and where a signed-in visitor is sent instead.
 */
const server = vi.hoisted(() => ({
  userId: null as string | null,
  auth: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: server.auth }))

vi.mock('@clerk/nextjs', () => ({
  useSignIn: () => ({
    fetchStatus: 'idle',
    errors: {
      fields: { identifier: null, password: null, code: null },
      global: null,
      raw: null,
    },
    signIn: {
      status: 'needs_identifier',
      supportedFirstFactors: [],
      supportedSecondFactors: [],
      firstFactorVerification: { strategy: null, status: null },
      identifier: null,
    },
  }),
  useSignUp: () => ({ signUp: {} }),
  HandleSSOCallback: () => <div data-testid="clerk-sso-callback" />,
  SignIn: () => <div data-testid="clerk-prebuilt-sign-in" />,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: server.redirect,
}))

vi.mock('next-themes', () => ({ useTheme: () => ({}) }))

/** Next's `redirect()` ends the render by throwing; so does this one. */
class Redirected extends Error {}

beforeEach(() => {
  vi.clearAllMocks()
  server.userId = null
  server.auth.mockImplementation(async () => ({ userId: server.userId }))
  server.redirect.mockImplementation(() => {
    throw new Redirected()
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const configure = () => {
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')
}

const page = (query: Record<string, string | string[] | undefined> = {}) =>
  SignInPage({ searchParams: Promise.resolve(query) })

describe('SignInPage', () => {
  it('shows the "not configured" notice, not the form, when Clerk keys are absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(await page())

    expect(server.auth).not.toHaveBeenCalled()
    expect(screen.getByText(/sign-in isn.t configured/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('form', { name: 'Sign in' }),
    ).not.toBeInTheDocument()
  })

  it("renders the site's own form, not Clerk's prebuilt one, when Clerk is configured", async () => {
    configure()

    render(await page({ redirect_url: '/articles/a-gated-one' }))

    expect(server.redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('form', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      screen.queryByTestId('clerk-prebuilt-sign-in'),
    ).not.toBeInTheDocument()
  })

  it('offers GitHub only where CLERK_GITHUB_ENABLED is "true" (#431)', async () => {
    configure()
    const { unmount } = render(await page())
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue with GitHub' }),
    ).not.toBeInTheDocument()
    unmount()

    vi.stubEnv('CLERK_GITHUB_ENABLED', 'true')
    render(await page())
    expect(
      screen.getByRole('button', { name: 'Continue with GitHub' }),
    ).toBeInTheDocument()
  })

  describe('a signed-in visitor is sent on instead of seeing the form', () => {
    beforeEach(() => {
      configure()
      server.userId = 'user_1'
    })

    it('goes to the home page when there is no redirect_url', async () => {
      await expect(page()).rejects.toBeInstanceOf(Redirected)
      expect(server.redirect).toHaveBeenCalledExactlyOnceWith('/')
    })

    it('goes to a redirect_url that is a path on this site', async () => {
      await expect(
        page({ redirect_url: '/articles/a-gated-one?from=corvus#top' }),
      ).rejects.toBeInstanceOf(Redirected)
      expect(server.redirect).toHaveBeenCalledExactlyOnceWith(
        '/articles/a-gated-one?from=corvus#top',
      )
    })

    it.each([
      'https://evil.example/steal',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'https://brandonperfetti.com/articles/a-gated-one',
    ])('goes to the home page for a redirect_url of %s', async (value) => {
      await expect(page({ redirect_url: value })).rejects.toBeInstanceOf(
        Redirected,
      )
      expect(server.redirect).toHaveBeenCalledExactlyOnceWith('/')
    })
  })

  it("does not redirect on /sign-in/sso-callback: a visitor Google has just signed in must reach Clerk's handler", () => {
    configure()
    server.userId = 'user_1'

    render(<SignInSsoCallbackPage />)

    expect(screen.getByTestId('clerk-sso-callback')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Finishing sign-in')
    expect(server.auth).not.toHaveBeenCalled()
  })

  it('shows the "not configured" notice on the callback page when Clerk keys are absent', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(<SignInSsoCallbackPage />)

    expect(screen.getByText(/sign-in isn.t configured/i)).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-sso-callback')).not.toBeInTheDocument()
  })
})
