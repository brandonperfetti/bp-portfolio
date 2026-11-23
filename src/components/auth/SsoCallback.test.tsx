import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SsoCallback } from './SsoCallback'

/**
 * #377: the page Google returns to. Clerk's `<HandleSSOCallback />` is
 * mocked (it needs a live Clerk); what is pinned is where this site sends
 * the visitor for each outcome Clerk reports, and that a forged
 * `redirect_url` on the callback URL is not followed.
 */
type Handlers = {
  navigateToApp: (params: { decorateUrl: (url: string) => string }) => void
  navigateToSignIn: () => void
  navigateToSignUp: () => void
}

const mocks = vi.hoisted(() => ({
  handlers: undefined as Handlers | undefined,
  push: vi.fn(),
  search: { value: '' },
  signIn: {
    status: 'needs_identifier' as string,
    firstFactorVerification: { strategy: null, status: null } as {
      strategy: string | null
      status: string | null
    },
  },
}))

vi.mock('@clerk/nextjs', () => ({
  HandleSSOCallback: (props: Handlers) => {
    mocks.handlers = props
    return <div data-testid="clerk-callback" />
  },
  useSignIn: () => ({ signIn: mocks.signIn }),
  useSignUp: () => ({
    signUp: {
      status: 'missing_requirements',
      missingFields: ['phone_number'],
      unverifiedFields: [],
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search.value),
}))

vi.mock('next-themes', () => ({ useTheme: () => ({}) }))

const plain = { decorateUrl: (url: string) => url }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.search.value = ''
  mocks.signIn.status = 'needs_identifier'
  mocks.signIn.firstFactorVerification = { strategy: null, status: null }
})

describe('SsoCallback, from the sign-up form', () => {
  it("mounts Clerk's callback handler and says what is happening", () => {
    render(<SsoCallback flow="sign-up" />)
    expect(screen.getByTestId('clerk-callback')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Finishing sign-up')
  })

  it('goes to the home page once there is a session', () => {
    render(<SsoCallback flow="sign-up" />)
    mocks.handlers?.navigateToApp(plain)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('goes back to the page that started the sign-up', () => {
    mocks.search.value = 'redirect_url=%2Farticles%2Fsome-post'
    render(<SsoCallback flow="sign-up" />)
    mocks.handlers?.navigateToApp(plain)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/articles/some-post')
  })

  it('does not follow a redirect_url that leaves the site', () => {
    mocks.search.value = 'redirect_url=%2F%2Fevil.example'
    render(<SsoCallback flow="sign-up" />)
    mocks.handlers?.navigateToApp(plain)
    mocks.handlers?.navigateToSignIn()
    mocks.handlers?.navigateToSignUp()
    expect(mocks.push.mock.calls).toEqual([['/'], ['/sign-in'], ['/sign-up']])
  })

  it('hands a decorated absolute URL to the browser instead of the router', () => {
    const assign = vi.fn()
    render(<SsoCallback flow="sign-up" assignLocation={assign} />)
    mocks.handlers?.navigateToApp({
      decorateUrl: (url) => `https://accounts.example/sync?to=${url}`,
    })
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      'https://accounts.example/sync?to=/',
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('sends an unfinished sign-in to /sign-in and an unfinished sign-up to /sign-up, keeping the target', () => {
    mocks.search.value = 'redirect_url=%2Farticles%2Fsome-post'
    render(<SsoCallback flow="sign-up" />)
    mocks.handlers?.navigateToSignIn()
    mocks.handlers?.navigateToSignUp()
    expect(mocks.push.mock.calls).toEqual([
      ['/sign-in?redirect_url=%2Farticles%2Fsome-post'],
      ['/sign-up?redirect_url=%2Farticles%2Fsome-post'],
    ])
  })

  describe('when Clerk sends the visitor nowhere', () => {
    // Clerk's handler calls none of its three handlers for a sign-up that
    // came back still needing something (measured against the installed
    // @clerk/react by the independent review of #377). The page must not
    // say "Finishing sign-up…" for ever.
    it('says it is taking long and offers a way out, without redirecting or claiming failure', async () => {
      vi.useFakeTimers()
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        mocks.search.value = 'redirect_url=%2Farticles%2Fsome-post'
        render(<SsoCallback flow="sign-up" stallMs={5000} />)
        expect(screen.queryByRole('link')).not.toBeInTheDocument()

        await act(async () => vi.advanceTimersByTime(5000))

        expect(screen.getByRole('status')).toHaveTextContent(
          /taking longer than expected/i,
        )
        const again = screen.getByRole<HTMLAnchorElement>('link', {
          name: 'Start again',
        })
        const signIn = screen.getByRole<HTMLAnchorElement>('link', {
          name: 'Sign in',
        })
        expect(new URL(again.href).pathname).toMatch(/^\/sign-up\/?$/)
        expect(new URL(again.href).searchParams.get('redirect_url')).toBe(
          '/articles/some-post',
        )
        expect(new URL(signIn.href).pathname).toMatch(/^\/sign-in\/?$/)
        expect(mocks.push).not.toHaveBeenCalled()
        // The log names the missing fields, nothing the visitor typed.
        expect(error).toHaveBeenCalledWith(
          '[sign-up] sso callback unresolved',
          expect.objectContaining({ missingFields: ['phone_number'] }),
        )
      } finally {
        error.mockRestore()
        vi.useRealTimers()
      }
    })

    it('offers the way out when a navigation Clerk asked for has not happened either, without logging a Clerk failure', async () => {
      // `router.push` was called, but the page is still here at the
      // deadline (a slow destination). Requested is not happened.
      vi.useFakeTimers()
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        render(<SsoCallback flow="sign-up" stallMs={5000} />)
        mocks.handlers?.navigateToApp(plain)
        expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
        await act(async () => vi.advanceTimersByTime(5000))

        expect(screen.getByRole('status')).toHaveTextContent(
          /taking longer than expected/i,
        )
        expect(
          screen.getByRole('link', { name: 'Start again' }),
        ).toBeInTheDocument()
        expect(
          screen.getByRole('link', { name: 'Sign in' }),
        ).toBeInTheDocument()
        expect(error).not.toHaveBeenCalled()
      } finally {
        error.mockRestore()
        vi.useRealTimers()
      }
    })

    it('cancels its timer when the page is left before the deadline', async () => {
      vi.useFakeTimers()
      try {
        const { unmount } = render(
          <SsoCallback flow="sign-up" stallMs={5000} />,
        )
        mocks.handlers?.navigateToApp(plain)
        expect(vi.getTimerCount()).toBe(1)

        unmount()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

describe('SsoCallback, from the sign-in form (#379)', () => {
  it('says it is finishing a sign-in', () => {
    render(<SsoCallback flow="sign-in" />)
    expect(screen.getByRole('status')).toHaveTextContent('Finishing sign-in')
  })

  it('offers to start the sign-in again and to sign up, once stalled', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.search.value = 'redirect_url=%2Farticles%2Fsome-post'
      render(<SsoCallback flow="sign-in" stallMs={1000} />)
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getByRole('link', { name: 'Start again' })).toHaveAttribute(
        'href',
        // next/link renders the site's trailing slash.
        expect.stringMatching(
          /^\/sign-in\/?\?redirect_url=%2Farticles%2Fsome-post$/,
        ),
      )
      expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
        'href',
        expect.stringMatching(
          /^\/sign-up\/?\?redirect_url=%2Farticles%2Fsome-post$/,
        ),
      )
      expect(error).toHaveBeenCalledWith(
        '[sign-in] sso callback unresolved',
        expect.objectContaining({ signInStatus: 'needs_identifier' }),
      )
    } finally {
      error.mockRestore()
      vi.useRealTimers()
    }
  })

  it('sends a Google sign-in that needs the new-device check to /sign-in, keeping the target', () => {
    mocks.search.value = 'redirect_url=%2Farticles%2Fsome-post'
    mocks.signIn.status = 'needs_client_trust'
    mocks.signIn.firstFactorVerification = {
      strategy: 'oauth_google',
      status: 'verified',
    }
    render(<SsoCallback flow="sign-in" />)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      '/sign-in?redirect_url=%2Farticles%2Fsome-post',
    )
  })

  it('leaves an older password attempt in the same state alone', () => {
    mocks.signIn.status = 'needs_client_trust'
    mocks.signIn.firstFactorVerification = {
      strategy: 'password',
      status: 'verified',
    }
    render(<SsoCallback flow="sign-up" />)
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
