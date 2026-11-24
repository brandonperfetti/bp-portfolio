import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

import SignUpSsoCallbackPage from '../sso-callback/page'
import SignUpPage from './page'

/**
 * The sign-up page mounts the site's own form (#377) when Clerk is
 * configured, and a notice when it is not.
 *
 * `@clerk/nextjs` is mocked: the real hook needs a live `ClerkProvider`. The
 * form's behaviour is `SignUpForm.test.tsx`'s subject; this pins only that
 * the page shows it, with the opt-in in it and unticked (#362), and that
 * Clerk's prebuilt `<SignUp>` is no longer what renders. It also pins where
 * a signed-in visitor is sent instead (#384).
 */
const server = vi.hoisted(() => ({
  userId: null as string | null,
  auth: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: server.auth }))

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
  useSignIn: () => ({ signIn: { status: 'needs_identifier' } }),
  HandleSSOCallback: () => <div data-testid="clerk-sso-callback" />,
  SignUp: () => <div data-testid="clerk-prebuilt-sign-up" />,
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
  SignUpPage({ searchParams: Promise.resolve(query) })

describe('SignUpPage', () => {
  it('shows the "not configured" notice, not the form, when Clerk keys are absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    render(await page())

    // Clerk is not asked anything when it is not configured.
    expect(server.auth).not.toHaveBeenCalled()

    expect(screen.getByText(/sign-up isn.t configured/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Create your account' }),
    ).not.toBeInTheDocument()
  })

  it("renders the site's own form, with the opt-in inside it and unticked, when Clerk is configured", async () => {
    configure()

    render(await page({ redirect_url: '/articles/a-gated-one' }))

    expect(server.redirect).not.toHaveBeenCalled()

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

  describe('a signed-in visitor is sent on instead of seeing the form (#384)', () => {
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
      // Refused on the server, where the origin is not known.
      'https://brandonperfetti.com/articles/a-gated-one',
    ])('goes to the home page for a redirect_url of %s', async (value) => {
      await expect(page({ redirect_url: value })).rejects.toBeInstanceOf(
        Redirected,
      )
      expect(server.redirect).toHaveBeenCalledExactlyOnceWith('/')
    })

    it('reads the first redirect_url when the query repeats it', async () => {
      await expect(
        page({ redirect_url: ['/first', 'https://evil.example'] }),
      ).rejects.toBeInstanceOf(Redirected)
      expect(server.redirect).toHaveBeenCalledExactlyOnceWith('/first')
    })
  })

  it("does not redirect on /sign-up/sso-callback: a visitor Google has just signed in must reach Clerk's handler", () => {
    configure()
    server.userId = 'user_1'

    render(<SignUpSsoCallbackPage />)

    expect(screen.getByTestId('clerk-sso-callback')).toBeInTheDocument()
    expect(server.auth).not.toHaveBeenCalled()
    expect(server.redirect).not.toHaveBeenCalled()
  })
})
