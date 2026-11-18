import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SignUpSsoCallback } from './SignUpSsoCallback'

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
}))

vi.mock('@clerk/nextjs', () => ({
  HandleSSOCallback: (props: Handlers) => {
    mocks.handlers = props
    return <div data-testid="clerk-callback" />
  },
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
})

describe('SignUpSsoCallback', () => {
  it("mounts Clerk's callback handler and says what is happening", () => {
    render(<SignUpSsoCallback />)
    expect(screen.getByTestId('clerk-callback')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Finishing sign-up')
  })

  it('goes to the home page once there is a session', () => {
    render(<SignUpSsoCallback />)
    mocks.handlers?.navigateToApp(plain)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('goes back to the page that started the sign-up', () => {
    mocks.search.value = 'redirect_url=%2Farticles%2Fsome-post'
    render(<SignUpSsoCallback />)
    mocks.handlers?.navigateToApp(plain)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/articles/some-post')
  })

  it('does not follow a redirect_url that leaves the site', () => {
    mocks.search.value = 'redirect_url=%2F%2Fevil.example'
    render(<SignUpSsoCallback />)
    mocks.handlers?.navigateToApp(plain)
    mocks.handlers?.navigateToSignIn()
    mocks.handlers?.navigateToSignUp()
    expect(mocks.push.mock.calls).toEqual([['/'], ['/sign-in'], ['/sign-up']])
  })

  it('hands a decorated absolute URL to the browser instead of the router', () => {
    const assign = vi.fn()
    render(<SignUpSsoCallback assignLocation={assign} />)
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
    render(<SignUpSsoCallback />)
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
        render(<SignUpSsoCallback stallMs={5000} />)
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

    it('says nothing of the kind once Clerk has navigated', async () => {
      vi.useFakeTimers()
      try {
        render(<SignUpSsoCallback stallMs={5000} />)
        mocks.handlers?.navigateToApp(plain)
        await act(async () => vi.advanceTimersByTime(5000))

        expect(screen.getByRole('status')).toHaveTextContent(
          'Finishing sign-up',
        )
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
