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
    status: 'missing_requirements' as string,
    unverifiedFields: [] as string[],
    missingFields: [] as string[],
    emailAddress: null as string | null,
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
      password: clerk.password,
      sso: clerk.sso,
      verifications: {
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
  clerk.state.status = 'missing_requirements'
  clerk.state.unverifiedFields = []
  clerk.state.missingFields = []
  clerk.state.emailAddress = null
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
    // the box as it is at that submit, so the latest answer is the one Clerk
    // holds.
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
    const user = userEvent.setup()
    render(<SignUpForm ssoHandOffTimeoutMs={30} />)
    await user.click(google())
    expect(optIn()).toBeDisabled()

    await waitFor(() => expect(optIn()).toBeEnabled())
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
  })

  it('email: focuses the code field once the code has been sent', async () => {
    // The code step appears while the code is still being sent, so it first
    // renders locked; focus has to land when it unlocks.
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

    const code = await screen.findByLabelText('Verification code')
    expect(code).toBeDisabled()
    await act(async () => sending.resolve(ok))
    await waitFor(() =>
      expect(screen.getByLabelText('Verification code')).toHaveFocus(),
    )
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

  it('sends a new code and says it did', async () => {
    const user = userEvent.setup()
    awaitingCode()
    render(<SignUpForm />)
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    expect(clerk.sendEmailCode).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(/new code/i)
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
  })

  it("themes Clerk's bot check with the site", () => {
    const { container } = render(<SignUpForm />)
    expect(container.querySelector('#clerk-captcha')).toHaveAttribute(
      'data-cl-theme',
      'dark',
    )
  })
})
