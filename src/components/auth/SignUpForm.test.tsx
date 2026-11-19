import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hasMailingListOptIn,
  MAILING_LIST_OPT_IN_LABEL,
} from '@/lib/email/mailingListOptIn'

import { SignUpForm } from './SignUpForm'

/**
 * #377: what the custom sign-up form does with Clerk.
 *
 * `@clerk/nextjs` is replaced by a fake `useSignUp()` whose methods return
 * promises the test settles by hand, so a request can be held "in flight" for
 * as long as a test needs. What is pinned here is this site's half of the
 * contract: which arguments reach `signUp.password()` and `signUp.sso()`, and
 * when. That clerk-js puts those arguments in the request is Clerk's half; the
 * e2e spec `sign-up-opt-in.spec.ts` observes it in a browser.
 */
type Result = { error: { message: string } | null }

function deferred() {
  let resolve!: (result: Result) => void
  const promise = new Promise<Result>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const clerk = vi.hoisted(() => {
  const state = {
    id: undefined as string | undefined,
    status: 'missing_requirements' as string,
    unverifiedFields: [] as string[],
    missingFields: [] as string[],
    emailAddress: null as string | null,
    /** Clerk's verification of the Google account, once Google has answered. */
    externalAccountStatus: null as string | null,
    /** Clerk's pending bot-check challenge, when it has raised one. */
    protectCheck: null as object | null,
    errors: {
      fields: {
        emailAddress: null as { message: string; longMessage?: string } | null,
        password: null as { message: string; longMessage?: string } | null,
        code: null as { message: string; longMessage?: string } | null,
        captcha: null as { message: string; longMessage?: string } | null,
      },
      global: null as { message: string; longMessage?: string }[] | null,
      raw: null,
    },
  }
  return {
    state,
    password: vi.fn(),
    sso: vi.fn(),
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
    push: vi.fn(),
    search: { value: '' },
  }
})

vi.mock('@clerk/nextjs', () => ({
  useSignUp: () => ({
    fetchStatus: 'idle',
    errors: clerk.state.errors,
    signUp: {
      get id() {
        return clerk.state.id
      },
      get status() {
        return clerk.state.status
      },
      get unverifiedFields() {
        return clerk.state.unverifiedFields
      },
      get missingFields() {
        return clerk.state.missingFields
      },
      get emailAddress() {
        return clerk.state.emailAddress
      },
      get protectCheck() {
        return clerk.state.protectCheck
      },
      password: clerk.password,
      sso: clerk.sso,
      verifications: {
        get externalAccount() {
          return { status: clerk.state.externalAccountStatus }
        },
        sendEmailCode: clerk.sendEmailCode,
        verifyEmailCode: clerk.verifyEmailCode,
      },
      finalize: clerk.finalize,
      reset: clerk.reset,
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: clerk.push }),
  useSearchParams: () => new URLSearchParams(clerk.search.value),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

const ok: Result = { error: null }

/** Puts the fake sign-up where Clerk leaves it once the email needs its code. */
function awaitingCode(email = 'a@example.com') {
  clerk.state.status = 'missing_requirements'
  clerk.state.unverifiedFields = ['email_address']
  clerk.state.missingFields = []
  clerk.state.emailAddress = email
}

beforeEach(() => {
  vi.clearAllMocks()
  clerk.search.value = ''
  clerk.state.id = undefined
  clerk.state.status = 'missing_requirements'
  clerk.state.unverifiedFields = []
  clerk.state.missingFields = []
  clerk.state.emailAddress = null
  clerk.state.externalAccountStatus = null
  clerk.state.protectCheck = null
  clerk.state.errors.fields.emailAddress = null
  clerk.state.errors.fields.password = null
  clerk.state.errors.fields.code = null
  clerk.state.errors.fields.captcha = null
  clerk.state.errors.global = null
  clerk.password.mockResolvedValue(ok)
  clerk.sso.mockResolvedValue(ok)
  clerk.sendEmailCode.mockResolvedValue(ok)
  clerk.verifyEmailCode.mockResolvedValue(ok)
  clerk.finalize.mockResolvedValue(ok)
  clerk.reset.mockResolvedValue(ok)
})

const optIn = () =>
  screen.getByRole('checkbox', { name: MAILING_LIST_OPT_IN_LABEL })
const google = () =>
  screen.getByRole('button', { name: 'Continue with Google' })
const submit = () => screen.getByRole('button', { name: 'Continue' })

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'a@example.com')
  await user.type(screen.getByLabelText('Password'), 'a long enough password')
}

describe('SignUpForm: the tick travels with the request that starts the sign-up', () => {
  it('email and password, ticked: sends a literal true the webhook accepts', async () => {
    const user = userEvent.setup()
    render(<SignUpForm />)
    await fill(user)
    await user.click(optIn())
    await user.click(submit())

    expect(clerk.password).toHaveBeenCalledExactlyOnceWith({
      emailAddress: 'a@example.com',
      password: 'a long enough password',
      unsafeMetadata: { mailingListOptIn: true },
    })
    // The exact value the webhook's rule reads (#362).
    expect(
      hasMailingListOptIn(clerk.password.mock.calls[0][0].unsafeMetadata),
    ).toBe(true)
  })

  it('email and password, unticked: sends an explicit false', async () => {
    const user = userEvent.setup()
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    expect(clerk.password).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ unsafeMetadata: { mailingListOptIn: false } }),
    )
  })

  it('Google, ticked: sends a literal true with the request that starts it', async () => {
    const user = userEvent.setup()
    render(<SignUpForm />)
    await user.click(optIn())
    await user.click(google())

    expect(clerk.sso).toHaveBeenCalledExactlyOnceWith({
      strategy: 'oauth_google',
      redirectCallbackUrl: '/sign-up/sso-callback',
      redirectUrl: '/',
      unsafeMetadata: { mailingListOptIn: true },
    })
    expect(clerk.password).not.toHaveBeenCalled()
  })

  it('Google, unticked: sends an explicit false', async () => {
    const user = userEvent.setup()
    render(<SignUpForm />)
    await user.click(google())

    expect(clerk.sso).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ unsafeMetadata: { mailingListOptIn: false } }),
    )
  })
})

describe("SignUpForm: #373's mid-submit limit is closed", () => {
  it('email: a tick changed after Continue cannot change what was sent, and the box is locked', async () => {
    const user = userEvent.setup()
    const inFlight = deferred()
    clerk.password.mockReturnValueOnce(inFlight.promise)
    render(<SignUpForm />)
    await fill(user)
    await user.click(optIn())
    await user.click(submit())

    // The request is in flight and already carries the tick.
    expect(clerk.password).toHaveBeenCalledOnce()
    const sent = clerk.password.mock.calls[0][0].unsafeMetadata
    expect(sent).toEqual({ mailingListOptIn: true })

    // The visitor now tries to untick. The box is disabled, so it stays as
    // sent; the value handed to Clerk is a copy that nothing can reach.
    expect(optIn()).toBeDisabled()
    await user.click(optIn())
    expect(optIn()).toBeChecked()
    expect(sent).toEqual({ mailingListOptIn: true })

    // Nor can a second request go out beside the first.
    await user.click(screen.getByRole('button', { name: /creating account/i }))
    await user.click(google())
    expect(clerk.password).toHaveBeenCalledOnce()
    expect(clerk.sso).not.toHaveBeenCalled()

    // Clerk rejects it (say the address is taken): the form unlocks, and the
    // next submit reads the box again.
    clerk.state.errors.fields.emailAddress = { message: 'Taken.' }
    await act(async () => inFlight.resolve({ error: { message: 'Taken.' } }))
    await waitFor(() => expect(optIn()).toBeEnabled())
    await user.click(optIn())
    expect(optIn()).not.toBeChecked()
    await user.click(submit())

    expect(clerk.password).toHaveBeenCalledTimes(2)
    expect(clerk.password.mock.calls[1][0].unsafeMetadata).toEqual({
      mailingListOptIn: false,
    })
  })

  it('two submits with the tick changed between them: the second value is what is sent', async () => {
    // clerk-js updates an existing sign-up attempt instead of creating a new
    // one when `signUp.password()` is called again (read from its source,
    // 2026-11-18). The form's part is the same either way: each call carries
    // the box as it is at that submit, so the latest answer is the one
    // clerk-js sends.
    const user = userEvent.setup()
    clerk.password.mockResolvedValue({ error: { message: 'Taken.' } })
    render(<SignUpForm />)
    await fill(user)
    await user.click(optIn())
    await user.click(submit())
    await waitFor(() => expect(optIn()).toBeEnabled())

    await user.click(optIn())
    await user.click(submit())
    await waitFor(() => expect(clerk.password).toHaveBeenCalledTimes(2))

    expect(
      clerk.password.mock.calls.map(([params]) => params.unsafeMetadata),
    ).toEqual([{ mailingListOptIn: true }, { mailingListOptIn: false }])
  })

  it('email: the other direction, a box ticked after Continue does not opt anyone in', async () => {
    const user = userEvent.setup()
    const inFlight = deferred()
    clerk.password.mockReturnValueOnce(inFlight.promise)
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    await user.click(optIn())
    expect(optIn()).not.toBeChecked()
    expect(clerk.password.mock.calls[0][0].unsafeMetadata).toEqual({
      mailingListOptIn: false,
    })
    await act(async () => inFlight.resolve(ok))
  })

  it('Google: the box is locked from the click, and stays locked while the browser leaves for Google', async () => {
    const user = userEvent.setup()
    const inFlight = deferred()
    clerk.sso.mockReturnValueOnce(inFlight.promise)
    render(<SignUpForm />)
    await user.click(optIn())
    await user.click(google())

    expect(clerk.sso.mock.calls[0][0].unsafeMetadata).toEqual({
      mailingListOptIn: true,
    })
    expect(optIn()).toBeDisabled()
    await user.click(optIn())
    expect(optIn()).toBeChecked()

    // Clerk answered without an error: the redirect to Google is under way.
    await act(async () => inFlight.resolve(ok))
    expect(optIn()).toBeDisabled()
    expect(clerk.sso).toHaveBeenCalledOnce()
  })

  it('Google: unlocks when Clerk refuses, and when the page comes back from the back-forward cache', async () => {
    const user = userEvent.setup()
    clerk.sso.mockResolvedValueOnce({ error: { message: 'No.' } })
    render(<SignUpForm />)
    await user.click(google())
    await waitFor(() => expect(optIn()).toBeEnabled())

    clerk.sso.mockResolvedValueOnce(ok)
    await user.click(google())
    await waitFor(() => expect(optIn()).toBeDisabled())
    // Back from Google's page: the browser restores this one as it was left.
    act(() => {
      const event = new Event('pageshow')
      Object.defineProperty(event, 'persisted', { value: true })
      window.dispatchEvent(event)
    })
    expect(optIn()).toBeEnabled()
  })
})

describe('SignUpForm: no state leaves the form locked for good', () => {
  it('Google: unlocks and says so if Clerk accepted the request but the browser never left', async () => {
    // Clerk's answer is held until the lock has been checked, so the short
    // timeout cannot run out before the assertion that precedes it.
    const user = userEvent.setup()
    const inFlight = deferred()
    clerk.sso.mockReturnValueOnce(inFlight.promise)
    render(<SignUpForm leaveTimeoutMs={30} />)
    await user.click(google())
    expect(optIn()).toBeDisabled()

    await act(async () => inFlight.resolve(ok))
    await waitFor(() => expect(optIn()).toBeEnabled())
    // Nothing is known to have failed, so it does not say so.
    expect(screen.getByRole('alert')).toHaveTextContent(
      /taking longer than expected/i,
    )
  })

  it('a successful sign-in whose navigation never happens unlocks to the finish step, without claiming failure', async () => {
    const user = userEvent.setup()
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      clerk.state.unverifiedFields = []
      return ok
    })
    render(<SignUpForm leaveTimeoutMs={30} />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await screen.findByRole('heading', { name: 'Your account is ready' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      /taking longer than expected/i,
    )
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('arms no timer when Clerk answers after the page has gone', async () => {
    const user = userEvent.setup()
    const inFlight = deferred()
    clerk.sso.mockReturnValueOnce(inFlight.promise)
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    try {
      const { unmount } = render(<SignUpForm leaveTimeoutMs={12_345} />)
      await user.click(google())
      unmount()
      await act(async () => inFlight.resolve(ok))
      expect(
        setTimeoutSpy.mock.calls.filter(([, ms]) => ms === 12_345),
      ).toHaveLength(0)
    } finally {
      setTimeoutSpy.mockRestore()
    }
  })

  it('email: keeps showing the locked first step while the code is sent, then the code step with its field focused', async () => {
    // Clerk reports "needs a code" as soon as the sign-up is created, while
    // the code is still being sent. The card must not switch to a disabled
    // code step (whose field could not take focus); it holds the first step
    // until the request settles.
    const user = userEvent.setup()
    const sending = deferred()
    clerk.password.mockImplementationOnce(async () => {
      awaitingCode()
      return ok
    })
    clerk.sendEmailCode.mockReturnValueOnce(sending.promise)
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    await waitFor(() => expect(clerk.sendEmailCode).toHaveBeenCalledOnce())
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
    expect(optIn()).toBeDisabled()

    await act(async () => sending.resolve(ok))
    expect(await screen.findByLabelText('Verification code')).toHaveFocus()
  })

  it('stays locked on the code step through the navigation after a successful sign-in', async () => {
    // `finalize()` leaves the sign-up `complete` a moment before the page
    // changes. Neither the first step nor the "account is ready" step
    // may flash by in that moment.
    const user = userEvent.setup()
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      clerk.state.unverifiedFields = []
      return ok
    })
    clerk.finalize.mockImplementationOnce(
      async ({ navigate }: { navigate: (p: unknown) => void }) => {
        navigate({ session: {}, decorateUrl: (url: string) => url })
        return ok
      },
    )
    render(<SignUpForm />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(clerk.push).toHaveBeenCalledWith('/'))
    expect(
      screen.getByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Verification code')).toBeDisabled()
    expect(
      screen.queryByRole('heading', { name: 'Your account is ready' }),
    ).not.toBeInTheDocument()
  })
})

describe('SignUpForm: the rest of the flow', () => {
  it('asks Clerk to email a code once the sign-up is started, then shows the code step', async () => {
    const user = userEvent.setup()
    clerk.password.mockImplementationOnce(async () => {
      awaitingCode()
      return ok
    })
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    await screen.findByRole('heading', { name: 'Check your email' })
    expect(clerk.sendEmailCode).toHaveBeenCalledOnce()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('verifies the code, finishes the sign-up and goes to the home page', async () => {
    const user = userEvent.setup()
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      return ok
    })
    clerk.finalize.mockImplementationOnce(
      async ({ navigate }: { navigate: (p: unknown) => void }) => {
        navigate({ session: {}, decorateUrl: (url: string) => url })
        return ok
      },
    )
    render(<SignUpForm />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(clerk.verifyEmailCode).toHaveBeenCalledExactlyOnceWith({
      code: '424242',
    })
    await waitFor(() => expect(clerk.push).toHaveBeenCalledWith('/'))
  })

  it('goes back to the page that sent the visitor here', async () => {
    const user = userEvent.setup()
    clerk.search.value = 'redirect_url=%2Farticles%2Fsome-post'
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      return ok
    })
    clerk.finalize.mockImplementationOnce(
      async ({ navigate }: { navigate: (p: unknown) => void }) => {
        navigate({ session: {}, decorateUrl: (url: string) => url })
        return ok
      },
    )
    render(<SignUpForm />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() =>
      expect(clerk.push).toHaveBeenCalledWith('/articles/some-post'),
    )
  })

  it('refuses a redirect_url that leaves the site', async () => {
    const user = userEvent.setup()
    clerk.search.value = 'redirect_url=https%3A%2F%2Fevil.example%2Fx'
    render(<SignUpForm />)
    await user.click(google())

    expect(clerk.sso).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        redirectCallbackUrl: '/sign-up/sso-callback',
        redirectUrl: '/',
      }),
    )
    expect(
      new URL(
        screen.getByRole<HTMLAnchorElement>('link', { name: 'Sign in' }).href,
      ).searchParams.has('redirect_url'),
    ).toBe(false)
  })

  it('carries a site redirect_url through Google and to the sign-in link', async () => {
    const user = userEvent.setup()
    clerk.search.value = 'redirect_url=%2Farticles%2Fsome-post'
    render(<SignUpForm />)
    expect(
      new URL(
        screen.getByRole<HTMLAnchorElement>('link', { name: 'Sign in' }).href,
      ).searchParams.get('redirect_url'),
    ).toBe('/articles/some-post')

    await user.click(google())
    expect(clerk.sso).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        redirectCallbackUrl:
          '/sign-up/sso-callback?redirect_url=%2Farticles%2Fsome-post',
        redirectUrl: '/articles/some-post',
      }),
    )
  })

  it('hands a decorated absolute URL to the browser instead of the router', async () => {
    const user = userEvent.setup()
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      return ok
    })
    const assign = vi.fn()
    clerk.finalize.mockImplementationOnce(
      async ({ navigate }: { navigate: (p: unknown) => void }) => {
        navigate({
          session: {},
          decorateUrl: (url: string) =>
            `https://accounts.example/sync?to=${url}`,
        })
        return ok
      },
    )
    render(<SignUpForm assignLocation={assign} />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://accounts.example/sync?to=/'),
    )
    expect(clerk.push).not.toHaveBeenCalled()
  })

  it('a failed sign-in after the account is created can be retried without signing up again', async () => {
    // `finalize()` fails once (the account exists, the session did not
    // start). Showing the first step would invite a second sign-up for an
    // address that now has an account.
    const user = userEvent.setup()
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      clerk.state.unverifiedFields = []
      return ok
    })
    clerk.finalize.mockResolvedValueOnce({
      error: { message: 'Could not start your session.' },
    })
    render(<SignUpForm />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await screen.findByRole('heading', { name: 'Your account is ready' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not start your session.',
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    clerk.finalize.mockImplementationOnce(
      async ({ navigate }: { navigate: (p: unknown) => void }) => {
        navigate({ session: {}, decorateUrl: (url: string) => url })
        return ok
      },
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(clerk.push).toHaveBeenCalledWith('/'))
    expect(clerk.finalize).toHaveBeenCalledTimes(2)
    expect(clerk.password).not.toHaveBeenCalled()
  })

  it('a retried sign-in that fails again leaves the visitor able to retry or go to sign-in, never to sign up again', async () => {
    // Clerk's sign-up is already complete when the page loads (a reload
    // after the first failure, say), and the sign-in keeps failing.
    const user = userEvent.setup()
    clerk.state.status = 'complete'
    clerk.finalize.mockResolvedValue({
      error: { message: 'Could not start your session.' },
    })
    render(<SignUpForm />)

    await screen.findByRole('heading', { name: 'Your account is ready' })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(clerk.finalize).toHaveBeenCalledTimes(1))

    // Still the same step, unlocked, with the reason and both ways out.
    const retry = await screen.findByRole('button', { name: 'Continue' })
    expect(retry).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not start your session.',
    )
    expect(
      new URL(
        screen.getByRole<HTMLAnchorElement>('link', { name: 'sign in' }).href,
      ).pathname,
    ).toMatch(/^\/sign-in\/?$/)

    await user.click(retry)
    await waitFor(() => expect(clerk.finalize).toHaveBeenCalledTimes(2))
    expect(
      screen.getByRole('heading', { name: 'Your account is ready' }),
    ).toBeInTheDocument()
    // Unlocked again after the second failure, and a third try goes out:
    // the step never locks for good.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not start your session.',
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(clerk.finalize).toHaveBeenCalledTimes(3))

    // Nothing on this step can start a sign-up: no fields, no Google, no box.
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue with Google' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(clerk.password).not.toHaveBeenCalled()
    expect(clerk.sso).not.toHaveBeenCalled()
  })

  it("shows Clerk's field and global errors in the form", async () => {
    clerk.state.errors.fields.emailAddress = {
      message: 'taken',
      longMessage: 'That email address is taken. Please try another.',
    }
    clerk.state.errors.fields.password = { message: 'Password is too short.' }
    clerk.state.errors.fields.captcha = { message: 'The bot check failed.' }
    clerk.state.errors.global = [{ message: 'Too many requests.' }]
    render(<SignUpForm />)

    expect(
      screen.getByText('That email address is taken. Please try another.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Password is too short.')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Too many requests.')
    expect(alert).toHaveTextContent('The bot check failed.')
  })

  it('says so when the sign-up needs something this form does not ask for', async () => {
    const user = userEvent.setup()
    clerk.password.mockImplementationOnce(async () => {
      clerk.state.missingFields = ['phone_number']
      return ok
    })
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn.t finish/i,
    )
    expect(clerk.sendEmailCode).not.toHaveBeenCalled()
    expect(optIn()).toBeEnabled()
    // The stuck attempt is discarded, so "try again" starts a new one
    // instead of updating the one that cannot be finished.
    expect(clerk.reset).toHaveBeenCalledOnce()
  })

  it('discards an earlier attempt when updating it fails, and keeps the reason on screen', async () => {
    // An attempt already exists (an abandoned trip to Google, say), so
    // clerk-js sends this submit as an update to it. If Clerk refuses the
    // update, retrying would update the same attempt again.
    const user = userEvent.setup()
    clerk.state.id = 'sua_existing'
    clerk.password.mockResolvedValueOnce({
      error: { message: 'This sign-up cannot be changed.' },
    })
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This sign-up cannot be changed.',
    )
    expect(clerk.reset).toHaveBeenCalledOnce()
    expect(optIn()).toBeEnabled()
  })

  it('does not discard anything when a first attempt is refused', async () => {
    const user = userEvent.setup()
    clerk.password.mockResolvedValueOnce({ error: { message: 'Taken.' } })
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    await waitFor(() => expect(optIn()).toBeEnabled())
    expect(clerk.reset).not.toHaveBeenCalled()
  })

  it('Google: discards an earlier attempt when updating it fails', async () => {
    const user = userEvent.setup()
    clerk.state.id = 'sua_existing'
    clerk.sso.mockResolvedValueOnce({ error: { message: 'Refused.' } })
    render(<SignUpForm />)
    await user.click(google())

    expect(await screen.findByRole('alert')).toHaveTextContent('Refused.')
    expect(clerk.reset).toHaveBeenCalledOnce()
  })

  it('unlocks and says so when Clerk throws instead of answering', async () => {
    const user = userEvent.setup()
    clerk.password.mockRejectedValueOnce(new Error('network'))
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /something went wrong/i,
    )
    expect(optIn()).toBeEnabled()
  })

  it('says so on the code step when the first code could not be sent, until a new one goes out', async () => {
    // #384: the card moves to the code step because Clerk's sign-up calls
    // for a code, whether or not the email went out.
    const user = userEvent.setup()
    clerk.password.mockImplementationOnce(async () => {
      awaitingCode()
      return ok
    })
    clerk.sendEmailCode.mockResolvedValueOnce({
      error: { message: 'Too many requests.' },
    })
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    await screen.findByRole('heading', { name: 'Check your email' })
    expect(screen.getByText(/couldn.t send a code to/i)).toBeInTheDocument()
    expect(screen.queryByText(/the code we sent/i)).not.toBeInTheDocument()

    // A resend that fails too changes nothing.
    clerk.sendEmailCode.mockResolvedValueOnce({
      error: { message: 'Too many requests.' },
    })
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))
    await waitFor(() => expect(clerk.sendEmailCode).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send a new code' }),
      ).toBeEnabled(),
    )
    expect(screen.getByText(/couldn.t send a code to/i)).toBeInTheDocument()

    // One that goes out puts the usual line back.
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/new code/i)
    expect(screen.getByText(/the code we sent/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/couldn.t send a code to/i),
    ).not.toBeInTheDocument()
  })

  it('the code step says a code was sent when the first send worked', async () => {
    const user = userEvent.setup()
    clerk.password.mockImplementationOnce(async () => {
      awaitingCode()
      return ok
    })
    render(<SignUpForm />)
    await fill(user)
    await user.click(submit())

    await screen.findByRole('heading', { name: 'Check your email' })
    expect(screen.getByText(/the code we sent/i)).toBeInTheDocument()
  })

  it('does not navigate when Clerk finishes the sign-in after the visitor has left the form', async () => {
    // #384: `finalize()` calls `navigate` a moment after the session is
    // set. A visitor who has gone elsewhere in that moment stays there.
    const user = userEvent.setup()
    awaitingCode()
    clerk.verifyEmailCode.mockImplementationOnce(async () => {
      clerk.state.status = 'complete'
      return ok
    })
    let navigate!: (p: unknown) => void
    const finalizing = deferred()
    clerk.finalize.mockImplementationOnce(
      ({ navigate: given }: { navigate: (p: unknown) => void }) => {
        navigate = given
        return finalizing.promise
      },
    )
    const assignLocation = vi.fn()
    const { unmount } = render(<SignUpForm assignLocation={assignLocation} />)
    await user.type(screen.getByLabelText('Verification code'), '424242')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(clerk.finalize).toHaveBeenCalledOnce())

    unmount()
    navigate({ session: {}, decorateUrl: () => 'https://example.com/' })
    navigate({ session: {}, decorateUrl: (url: string) => url })
    await act(async () => finalizing.resolve(ok))

    expect(clerk.push).not.toHaveBeenCalled()
    expect(assignLocation).not.toHaveBeenCalled()
  })

  it('sends a new code and says it did', async () => {
    const user = userEvent.setup()
    awaitingCode()
    render(<SignUpForm />)
    // A reload on the code step: the page has not seen a send yet.
    expect(screen.queryByText(/the code we sent/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Enter the verification code for/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    expect(clerk.sendEmailCode).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(/new code/i)
    expect(screen.getByText(/the code we sent/i)).toBeInTheDocument()
  })

  it('"Use a different email" discards the attempt, so its tick cannot outlive it', async () => {
    const user = userEvent.setup()
    awaitingCode()
    clerk.reset.mockImplementationOnce(async () => {
      clerk.state.unverifiedFields = []
      clerk.state.emailAddress = null
      return ok
    })
    render(<SignUpForm />)
    await user.click(
      screen.getByRole('button', { name: 'Use a different email' }),
    )

    expect(clerk.reset).toHaveBeenCalledOnce()
    await screen.findByRole('heading', { name: 'Create your account' })
    // A fresh form: the question is asked again, unticked.
    expect(optIn()).not.toBeChecked()
    // And focus lands in it, not at the top of the document.
    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toHaveFocus(),
    )
  })

  it("themes Clerk's bot check with the site", () => {
    const { container } = render(<SignUpForm />)
    expect(container.querySelector('#clerk-captcha')).toHaveAttribute(
      'data-cl-theme',
      'dark',
    )
  })
})

describe('SignUpForm: a sign-up back from Google that the form cannot finish (#384)', () => {
  /** Clerk's sign-up after Google verified the account, a field still missing. */
  function backFromGoogleMissing(field: string) {
    clerk.state.id = 'sua_google'
    clerk.state.status = 'missing_requirements'
    clerk.state.missingFields = [field]
    clerk.state.unverifiedFields = []
    clerk.state.externalAccountStatus = 'verified'
  }
  const resetClears = async () => {
    clerk.state.id = undefined
    clerk.state.missingFields = []
    clerk.state.externalAccountStatus = null
    return ok
  }

  it('says it could not finish, logs the field names and discards the attempt', async () => {
    backFromGoogleMissing('legal_accepted')
    clerk.reset.mockImplementationOnce(resetClears)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<SignUpForm />)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(
        /couldn.t finish creating your account with Google/i,
      )
      // It does not send the visitor round the same loop.
      expect(alert).not.toHaveTextContent(/sign up with Google/i)
      expect(clerk.reset).toHaveBeenCalledOnce()
      expect(logged).toHaveBeenCalledExactlyOnceWith(
        '[sign-up] unsupported requirement',
        {
          status: 'missing_requirements',
          missingFields: ['legal_accepted'],
          unverifiedFields: [],
        },
      )
      // The first step, unlocked, and the next choice starts a new attempt.
      await waitFor(() => expect(optIn()).toBeEnabled())
      expect(
        screen.getByRole('heading', { name: 'Create your account' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t finish/i)
      expect(clerk.sso).not.toHaveBeenCalled()
      expect(clerk.password).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })

  it('asks for one discard only, even if the attempt is still there afterwards', async () => {
    backFromGoogleMissing('phone_number')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<SignUpForm />)
      await screen.findByRole('alert')
      await waitFor(() => expect(optIn()).toBeEnabled())
      expect(clerk.reset).toHaveBeenCalledOnce()
      expect(logged).toHaveBeenCalledOnce()
    } finally {
      logged.mockRestore()
    }
  })

  it('leaves an abandoned trip to Google alone: nothing was verified there', async () => {
    // The visitor pressed Back at Google, or reloaded. Clerk still holds the
    // attempt with fields missing, and the first step shows as before.
    clerk.state.id = 'sua_google'
    clerk.state.missingFields = ['email_address']
    clerk.state.externalAccountStatus = 'unverified'
    render(<SignUpForm />)

    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument()
    await act(async () => {})
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(clerk.reset).not.toHaveBeenCalled()
    expect(optIn()).toBeEnabled()
  })

  it("leaves a sign-up with a bot check pending alone: Clerk's own message is the one to show", async () => {
    backFromGoogleMissing('legal_accepted')
    clerk.state.protectCheck = { status: 'pending' }
    clerk.state.errors.global = [{ message: 'Bot check failed.' }]
    render(<SignUpForm />)

    await act(async () => {})
    expect(screen.getByRole('alert')).toHaveTextContent('Bot check failed.')
    expect(screen.getByRole('alert')).not.toHaveTextContent(/couldn.t finish/i)
    expect(clerk.reset).not.toHaveBeenCalled()
  })

  it.each([
    [['password']],
    [['email_address']],
    [['email_address', 'password']],
  ])(
    'keeps an attempt missing only %j: the first step collects that, and its submit updates the attempt',
    async (missing) => {
      const user = userEvent.setup()
      backFromGoogleMissing('password')
      clerk.state.missingFields = missing
      render(<SignUpForm />)

      await act(async () => {})
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(clerk.reset).not.toHaveBeenCalled()

      // The submit updates the same attempt, which then needs its code.
      clerk.password.mockImplementationOnce(async () => {
        awaitingCode()
        return ok
      })
      await fill(user)
      await user.click(submit())
      expect(clerk.password).toHaveBeenCalledOnce()
      await screen.findByRole('heading', { name: 'Check your email' })
      expect(clerk.sendEmailCode).toHaveBeenCalledOnce()
      expect(clerk.reset).not.toHaveBeenCalled()
    },
  )

  it('discards when a field the form cannot collect is missing beside one it can', async () => {
    backFromGoogleMissing('password')
    clerk.state.missingFields = ['password', 'legal_accepted']
    clerk.reset.mockImplementationOnce(resetClears)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<SignUpForm />)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /couldn.t finish/i,
      )
      expect(clerk.reset).toHaveBeenCalledOnce()
    } finally {
      logged.mockRestore()
    }
  })

  it('leaves the code step alone when Google verified the account and only the email code is left, and does not say a code was sent', async () => {
    awaitingCode()
    clerk.state.id = 'sua_google'
    clerk.state.externalAccountStatus = 'verified'
    render(<SignUpForm />)

    expect(
      screen.getByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
    // This page sent nothing, and nothing says Clerk did.
    expect(screen.queryByText(/the code we sent/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Enter the verification code for/),
    ).toBeInTheDocument()
    expect(clerk.sendEmailCode).not.toHaveBeenCalled()
    await act(async () => {})
    expect(clerk.reset).not.toHaveBeenCalled()
  })

  it('leaves a finished sign-up on the finish step', async () => {
    clerk.state.id = 'sua_google'
    clerk.state.status = 'complete'
    clerk.state.externalAccountStatus = 'verified'
    render(<SignUpForm />)

    expect(
      screen.getByRole('heading', { name: 'Your account is ready' }),
    ).toBeInTheDocument()
    await act(async () => {})
    expect(clerk.reset).not.toHaveBeenCalled()
  })
})
