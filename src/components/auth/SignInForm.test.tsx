import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NO_EMAIL_CODE_MESSAGE,
  NO_RESET_MESSAGE,
  SignInForm,
  UNSUPPORTED_STEP_MESSAGE,
} from './SignInForm'
import { SESSION_TASK_MESSAGE, UNEXPECTED_MESSAGE } from './useAuthSteps'

/**
 * #379: what the custom sign-in form does with Clerk.
 *
 * `@clerk/nextjs` is replaced by a fake `useSignIn()`. Each fake method moves
 * the fake sign-in to the state Clerk's own would be in after it, so the test
 * pins this site's half of the contract: which Clerk call each control makes,
 * in what order, and which step the card shows after it. No account is made
 * and no email is sent.
 */
type Result = { error: { message: string; longMessage?: string } | null }
type Factor = { strategy: string }

const clerk = vi.hoisted(() => {
  const state = {
    generation: 0,
    id: undefined as string | undefined,
    status: 'needs_identifier' as string,
    identifier: null as string | null,
    supportedFirstFactors: [] as Factor[],
    supportedSecondFactors: [] as Factor[],
    firstFactorVerification: {
      strategy: null as string | null,
      externalVerificationRedirectURL: undefined as URL | undefined,
    } as { strategy: string | null; externalVerificationRedirectURL?: URL },
    errors: {
      fields: {
        identifier: null as { message: string } | null,
        password: null as { message: string } | null,
        code: null as { message: string } | null,
      },
      global: null as { message: string }[] | null,
      raw: null,
    },
  }
  return {
    state,
    password: vi.fn(),
    create: vi.fn(),
    sso: vi.fn(),
    emailCodeSend: vi.fn(),
    emailCodeVerify: vi.fn(),
    resetSend: vi.fn(),
    resetVerify: vi.fn(),
    resetSubmit: vi.fn(),
    mfaSend: vi.fn(),
    mfaVerify: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
    push: vi.fn(),
    search: { value: '' },
  }
})

vi.mock('@clerk/nextjs', () => ({
  useSignIn: () => {
    const generation = clerk.state.generation
    return {
      fetchStatus: 'idle',
      errors: clerk.state.errors,
      signIn: {
        get id() {
          return clerk.state.id
        },
        get status() {
          return clerk.state.status
        },
        get identifier() {
          return clerk.state.identifier
        },
        get supportedFirstFactors() {
          return clerk.state.supportedFirstFactors
        },
        get supportedSecondFactors() {
          return clerk.state.supportedSecondFactors
        },
        get firstFactorVerification() {
          return clerk.state.firstFactorVerification
        },
        password: clerk.password,
        create: clerk.create,
        sso: (params: unknown) =>
          generation === clerk.state.generation
            ? clerk.sso(params)
            : Promise.resolve(ok),
        emailCode: {
          sendCode: clerk.emailCodeSend,
          verifyCode: clerk.emailCodeVerify,
        },
        resetPasswordEmailCode: {
          sendCode: clerk.resetSend,
          verifyCode: clerk.resetVerify,
          submitPassword: clerk.resetSubmit,
        },
        mfa: {
          sendEmailCode: clerk.mfaSend,
          verifyEmailCode: clerk.mfaVerify,
        },
        finalize: clerk.finalize,
        reset: clerk.reset,
      },
    }
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: clerk.push }),
  useSearchParams: () => new URLSearchParams(clerk.search.value),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

const ok: Result = { error: null }
const EMAIL = 'a@example.com'

/** The fake sign-in once Clerk knows the address and wants a first factor. */
function identified(firstFactors: string[]) {
  clerk.state.id = 'sia_1'
  clerk.state.status = 'needs_first_factor'
  clerk.state.identifier = EMAIL
  clerk.state.supportedFirstFactors = firstFactors.map((strategy) => ({
    strategy,
  }))
}

/** The fake sign-in after a first factor, wanting the new-device code. */
function needsClientTrust(secondFactors = ['email_code']) {
  clerk.state.status = 'needs_client_trust'
  clerk.state.supportedSecondFactors = secondFactors.map((strategy) => ({
    strategy,
  }))
}

const complete = () => {
  clerk.state.status = 'complete'
}

beforeEach(() => {
  vi.clearAllMocks()
  clerk.search.value = ''
  Object.assign(clerk.state, {
    id: undefined,
    status: 'needs_identifier',
    identifier: null,
    supportedFirstFactors: [],
    supportedSecondFactors: [],
    firstFactorVerification: { strategy: null },
  })
  clerk.state.errors.fields.identifier = null
  clerk.state.errors.fields.password = null
  clerk.state.errors.fields.code = null
  clerk.state.errors.global = null

  clerk.password.mockImplementation(async () => {
    identified(['password', 'email_code', 'reset_password_email_code'])
    complete()
    return ok
  })
  clerk.create.mockImplementation(async () => {
    identified(['password', 'email_code', 'reset_password_email_code'])
    return ok
  })
  // As clerk-js does: the hand-off to Google is the URL on the attempt.
  clerk.sso.mockImplementation(async () => {
    clerk.state.id = 'sia_google'
    clerk.state.firstFactorVerification = {
      strategy: 'oauth_google',
      externalVerificationRedirectURL: new URL(
        'https://accounts.google.com/o/oauth2/auth',
      ),
    }
    return ok
  })
  clerk.emailCodeSend.mockImplementation(async () => {
    clerk.state.firstFactorVerification = { strategy: 'email_code' }
    return ok
  })
  clerk.emailCodeVerify.mockImplementation(async () => {
    complete()
    return ok
  })
  clerk.resetSend.mockImplementation(async () => {
    clerk.state.firstFactorVerification = {
      strategy: 'reset_password_email_code',
    }
    return ok
  })
  clerk.resetVerify.mockImplementation(async () => {
    clerk.state.status = 'needs_new_password'
    return ok
  })
  clerk.resetSubmit.mockImplementation(async () => {
    complete()
    return ok
  })
  clerk.mfaSend.mockResolvedValue(ok)
  clerk.mfaVerify.mockImplementation(async () => {
    complete()
    return ok
  })
  clerk.finalize.mockImplementation(
    async ({
      navigate,
    }: {
      navigate: (p: { decorateUrl: (u: string) => string }) => void
    }) => {
      navigate({ decorateUrl: (url) => url })
      return ok
    },
  )
  clerk.reset.mockImplementation(async () => {
    clerk.state.generation += 1
    Object.assign(clerk.state, {
      id: undefined,
      status: 'needs_identifier',
      identifier: null,
      supportedFirstFactors: [],
      supportedSecondFactors: [],
      firstFactorVerification: { strategy: null },
    })
    return ok
  })
})

const heading = () => screen.getByRole('heading', { level: 1 })

async function typeEmail(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), EMAIL)
}

async function signInWithPassword(user: ReturnType<typeof userEvent.setup>) {
  await typeEmail(user)
  await user.type(screen.getByLabelText('Password'), 'correct horse')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

async function enterCode(
  user: ReturnType<typeof userEvent.setup>,
  code = '424242',
) {
  await user.type(await screen.findByLabelText('Verification code'), code)
  await user.click(screen.getByRole('button', { name: 'Verify' }))
}

describe('SignInForm: email and password', () => {
  it.each(['', '   '])(
    'does not submit a blank email (%j) against a retained Clerk attempt',
    async (value) => {
      identified(['password'])
      const user = userEvent.setup()
      render(<SignInForm />)
      if (value) await user.type(screen.getByLabelText('Email address'), value)
      await user.type(screen.getByLabelText('Password'), 'correct horse')
      await user.click(screen.getByRole('button', { name: 'Continue' }))

      expect(clerk.password).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter your email address.',
      )
    },
  )

  it('does not finalize a password request that settles after a Back-button restore', async () => {
    let resolvePassword!: (result: Result) => void
    clerk.password.mockImplementationOnce(
      () =>
        new Promise<Result>((resolve) => {
          resolvePassword = resolve
        }),
    )
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('pageshow'), { persisted: true }),
      )
    })
    await act(async () => {
      complete()
      resolvePassword(ok)
    })

    expect(clerk.finalize).not.toHaveBeenCalled()
    expect(clerk.push).not.toHaveBeenCalled()
  })

  it('sends the address and password, then makes the session active and goes home', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    expect(clerk.password).toHaveBeenCalledExactlyOnceWith({
      emailAddress: EMAIL,
      password: 'correct horse',
    })
    expect(clerk.finalize).toHaveBeenCalledOnce()
    expect(clerk.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('goes to an on-site redirect_url once signed in', async () => {
    clerk.search.value = 'redirect_url=%2Farticles%2Fgated'
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)
    expect(clerk.push).toHaveBeenCalledExactlyOnceWith('/articles/gated')
  })

  it('does not follow a redirect_url that leaves the site', async () => {
    clerk.search.value = 'redirect_url=https%3A%2F%2Fevil.example%2F'
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)
    expect(clerk.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it("shows Clerk's error under the field it belongs to and stays on the first step", async () => {
    clerk.password.mockImplementation(async () => {
      clerk.state.errors.fields.password = {
        message: 'Password is incorrect. Try again, or use another method.',
      }
      return { error: { message: 'Password is incorrect.' } }
    })
    const user = userEvent.setup()
    const { rerender } = render(<SignInForm />)
    await signInWithPassword(user)
    rerender(<SignInForm />)

    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      /password is incorrect/i,
    )
    expect(heading()).toHaveTextContent('Sign in')
    expect(clerk.finalize).not.toHaveBeenCalled()
  })

  it('shows an unknown-account error on the email field', async () => {
    clerk.password.mockImplementation(async () => {
      clerk.state.errors.fields.identifier = {
        message: "Couldn't find your account.",
      }
      return { error: { message: "Couldn't find your account." } }
    })
    const user = userEvent.setup()
    const { rerender } = render(<SignInForm />)
    await signInWithPassword(user)
    rerender(<SignInForm />)

    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      "Couldn't find your account.",
    )
  })

  it('locks the form while Clerk answers, so a second click sends nothing', async () => {
    let answer!: (result: Result) => void
    clerk.password.mockImplementation(
      () =>
        new Promise<Result>((resolve) => {
          answer = resolve
        }),
    )
    const user = userEvent.setup()
    render(<SignInForm />)
    await typeEmail(user)
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const submit = screen.getByRole('button', { name: 'Signing in…' })
    expect(submit).toBeDisabled()
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    await user.click(submit)
    expect(clerk.password).toHaveBeenCalledOnce()

    answer({ error: { message: 'nope' } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    )
  })

  it('does not leave when Clerk left the session with a task this site has no step for, and says so', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    clerk.finalize.mockImplementation(
      async ({
        navigate,
      }: {
        navigate: (p: {
          session: { currentTask: { key: string } }
          decorateUrl: (u: string) => string
        }) => void
      }) => {
        navigate({
          session: { currentTask: { key: 'reset-password' } },
          decorateUrl: (url) => url,
        })
        return ok
      },
    )
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      SESSION_TASK_MESSAGE,
    )
    expect(clerk.push).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(
      '[sign-in] session task this site has no step for',
      { task: 'reset-password' },
    )
    error.mockRestore()
  })

  it('ignores a stale finalize callback and returned error after a Back-button restore', async () => {
    let settleFinalize!: () => void
    const decorateUrl = vi.fn((url: string) => url)
    clerk.finalize.mockImplementationOnce(
      ({ navigate }: { navigate: (params: unknown) => void }) =>
        new Promise<Result>((resolve) => {
          settleFinalize = () => {
            navigate({ decorateUrl })
            resolve({ error: { message: 'Stale sign-in error' } })
          }
        }),
    )
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)
    expect(clerk.finalize).toHaveBeenCalledOnce()

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('pageshow'), { persisted: true }),
      )
    })
    await act(async () => settleFinalize())

    expect(decorateUrl).not.toHaveBeenCalled()
    expect(clerk.push).not.toHaveBeenCalled()
    expect(screen.queryByText('Stale sign-in error')).not.toBeInTheDocument()
  })

  it('shows the message and unlocks when making the session active fails', async () => {
    clerk.finalize.mockResolvedValue({
      error: { message: 'Session could not be set.' },
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Session could not be set.',
    )
    expect(heading()).toHaveTextContent('Almost there')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(clerk.finalize).toHaveBeenCalledTimes(2)
    // The retry failed too; focus is back on the button, not lost.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus(),
    )
  })
})

describe('SignInForm: the new-device check (Device Trust)', () => {
  beforeEach(() => {
    clerk.password.mockImplementation(async () => {
      identified(['password', 'email_code'])
      needsClientTrust()
      return ok
    })
  })

  it('sends the code, shows the code step, and signs in with it', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    expect(clerk.mfaSend).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Confirm it’s you')
    expect(
      screen.getByText(/signing in on a new device/i, { exact: false }),
    ).toHaveTextContent(`Enter the code we sent to ${EMAIL}.`)

    await enterCode(user)
    expect(clerk.mfaVerify).toHaveBeenCalledExactlyOnceWith({ code: '424242' })
    expect(clerk.emailCodeVerify).not.toHaveBeenCalled()
    expect(clerk.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('does not say a code was sent when sending it failed', async () => {
    clerk.mfaSend.mockResolvedValue({ error: { message: 'Too many requests' } })
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    expect(
      screen.getByText(/couldn't send a code to/i, { exact: false }),
    ).toBeInTheDocument()
  })

  it('clears the first code’s delivery confirmation when the new-device send throws', async () => {
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      clerk.emailCodeVerify.mockImplementationOnce(async () => {
        needsClientTrust()
        return ok
      })
      clerk.mfaSend.mockRejectedValueOnce(new Error('Provider unavailable'))
      const user = userEvent.setup()
      render(<SignInForm />)
      await typeEmail(user)
      await user.click(
        screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
      )
      expect(screen.getByText(/enter the code we sent/i)).toBeInTheDocument()

      await enterCode(user)

      expect(screen.getByText(/couldn't send a code to/i)).toBeInTheDocument()
      expect(logging.mock.calls).toContainEqual([
        '[sign-in] unexpected failure',
      ])
    } finally {
      logging.mockRestore()
    }
  })

  it('sends a new-device code when a superseded first-code verification advances Clerk', async () => {
    let finishOldVerify!: (result: Result) => void
    clerk.emailCodeVerify.mockImplementationOnce(
      () =>
        new Promise<Result>((resolve) => {
          finishOldVerify = resolve
        }),
    )
    const user = userEvent.setup()
    const { rerender } = render(<SignInForm />)
    await typeEmail(user)
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )
    expect(screen.getByText(/enter the code we sent/i)).toBeInTheDocument()
    await enterCode(user)

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('pageshow'), { persisted: true }),
      )
    })
    await act(async () => {
      needsClientTrust()
      finishOldVerify(ok)
    })
    // Clerk publishes the new challenge independently of the stale request.
    rerender(<SignInForm />)

    await waitFor(() => expect(clerk.mfaSend).toHaveBeenCalledOnce())
    expect(heading()).toHaveTextContent('Confirm it’s you')
  })

  it('sends a new code with the second-factor method', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    expect(clerk.mfaSend).toHaveBeenCalledTimes(2)
    expect(clerk.emailCodeSend).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'A new code is on its way.',
    )
  })

  it('"Start over" drops the attempt and returns to the first step', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)
    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(clerk.reset).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Sign in')
    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toHaveFocus(),
    )
  })

  it('a second factor other than an emailed code is said to be unsupported, not a dead end', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    clerk.password.mockImplementation(async () => {
      identified(['password'])
      clerk.state.status = 'needs_second_factor'
      clerk.state.supportedSecondFactors = [{ strategy: 'totp' }]
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await signInWithPassword(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      UNSUPPORTED_STEP_MESSAGE,
    )
    expect(clerk.mfaSend).not.toHaveBeenCalled()
    expect(clerk.reset).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledWith('[sign-in] unsupported step', {
      status: 'needs_second_factor',
      secondFactors: ['totp'],
    })
    error.mockRestore()
  })
})

describe('SignInForm: an emailed sign-in code instead of a password', () => {
  it('identifies the account, sends the code, and signs in with it', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await typeEmail(user)
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )

    expect(clerk.create).toHaveBeenCalledExactlyOnceWith({ identifier: EMAIL })
    expect(clerk.emailCodeSend).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Check your email')

    await enterCode(user)
    expect(clerk.emailCodeVerify).toHaveBeenCalledExactlyOnceWith({
      code: '424242',
    })
    expect(clerk.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('goes on to the new-device code when Clerk asks for it after the email code', async () => {
    clerk.emailCodeVerify.mockImplementation(async () => {
      needsClientTrust()
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await typeEmail(user)
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )
    await enterCode(user)

    expect(clerk.mfaSend).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Confirm it’s you')
  })

  it('the new-device code step starts empty, not with the email code just used', async () => {
    clerk.emailCodeVerify.mockImplementation(async () => {
      needsClientTrust()
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await typeEmail(user)
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )
    await enterCode(user, '111111')

    expect(heading()).toHaveTextContent('Confirm it’s you')
    expect(screen.getByLabelText('Verification code')).toHaveValue('')
  })

  it('says so for an account that cannot have an emailed code, and sends none', async () => {
    clerk.create.mockImplementation(async () => {
      identified(['password'])
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await typeEmail(user)
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(NO_EMAIL_CODE_MESSAGE)
    expect(clerk.emailCodeSend).not.toHaveBeenCalled()
    expect(heading()).toHaveTextContent('Sign in')
  })

  it('a reload on the code step stays there, and claims no code was sent', () => {
    identified(['email_code'])
    clerk.state.firstFactorVerification = { strategy: 'email_code' }
    render(<SignInForm />)

    expect(heading()).toHaveTextContent('Check your email')
    expect(
      screen.getByText(/Enter the verification code for/, { exact: false }),
    ).toBeInTheDocument()
  })

  it('"Use another method" returns to the first step', async () => {
    identified(['email_code'])
    clerk.state.firstFactorVerification = { strategy: 'email_code' }
    const user = userEvent.setup()
    render(<SignInForm />)
    await user.click(screen.getByRole('button', { name: 'Use another method' }))

    expect(clerk.reset).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Sign in')
  })
})

describe('SignInForm: forgot password', () => {
  async function startReset(user: ReturnType<typeof userEvent.setup>) {
    await typeEmail(user)
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  }

  it('sends the reset code, takes it, takes the new password, and signs in', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await startReset(user)

    expect(clerk.create).toHaveBeenCalledExactlyOnceWith({ identifier: EMAIL })
    expect(clerk.resetSend).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Reset your password')

    await enterCode(user)
    expect(clerk.resetVerify).toHaveBeenCalledExactlyOnceWith({
      code: '424242',
    })
    expect(heading()).toHaveTextContent('Set a new password')
    expect(clerk.finalize).not.toHaveBeenCalled()

    await user.type(
      screen.getByLabelText('New password'),
      'a brand new long password',
    )
    await user.click(
      screen.getByRole('button', { name: 'Reset password and sign in' }),
    )
    expect(clerk.resetSubmit).toHaveBeenCalledExactlyOnceWith({
      password: 'a brand new long password',
      signOutOfOtherSessions: true,
    })
    expect(clerk.push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('resends the reset code with the reset method', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await startReset(user)
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    expect(clerk.resetSend).toHaveBeenCalledTimes(2)
    expect(clerk.emailCodeSend).not.toHaveBeenCalled()
  })

  it('goes on to the new-device code when Clerk asks for it after the reset', async () => {
    clerk.resetSubmit.mockImplementation(async () => {
      needsClientTrust()
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await startReset(user)
    await enterCode(user)
    await user.type(screen.getByLabelText('New password'), 'new long password')
    await user.click(
      screen.getByRole('button', { name: 'Reset password and sign in' }),
    )

    expect(clerk.mfaSend).toHaveBeenCalledOnce()
    expect(heading()).toHaveTextContent('Confirm it’s you')
  })

  it("shows Clerk's refusal of the new password under the field", async () => {
    clerk.resetSubmit.mockImplementation(async () => {
      clerk.state.errors.fields.password = {
        message: 'Passwords must be 15 characters or more.',
      }
      return { error: { message: 'too short' } }
    })
    const user = userEvent.setup()
    const { rerender } = render(<SignInForm />)
    await startReset(user)
    await enterCode(user)
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(
      screen.getByRole('button', { name: 'Reset password and sign in' }),
    )
    rerender(<SignInForm />)

    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /15 characters or more/,
    )
    expect(clerk.finalize).not.toHaveBeenCalled()
  })

  it('says so for an account that cannot reset by email', async () => {
    clerk.create.mockImplementation(async () => {
      identified(['email_code'])
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await startReset(user)

    expect(screen.getByRole('alert')).toHaveTextContent(NO_RESET_MESSAGE)
    expect(clerk.resetSend).not.toHaveBeenCalled()
  })
})

describe('SignInForm: Google', () => {
  it('starts the Google sign-in with the callback page and the target, and stays locked', async () => {
    clerk.search.value = 'redirect_url=%2Farticles%2Fgated'
    const user = userEvent.setup()
    render(<SignInForm />)
    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    expect(clerk.sso).toHaveBeenCalledExactlyOnceWith({
      strategy: 'oauth_google',
      redirectCallbackUrl:
        '/sign-in/sso-callback?redirect_url=%2Farticles%2Fgated',
      redirectUrl: '/articles/gated',
    })
    // The browser is on its way to Google; nothing may be sent behind it.
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled()
  })

  it('starts Google as a new attempt after a refused emailed code, so clerk-js does not reuse the old one', async () => {
    clerk.create.mockImplementation(async () => {
      identified(['password'])
      return ok
    })
    const user = userEvent.setup()
    render(<SignInForm />)
    await typeEmail(user)
    await user.click(
      screen.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(NO_EMAIL_CODE_MESSAGE)

    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )
    expect(clerk.reset).toHaveBeenCalledOnce()
    expect(clerk.reset.mock.invocationCallOrder[0]).toBeLessThan(
      clerk.sso.mock.invocationCallOrder[0],
    )
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled()
  })

  it('unlocks and says so when Clerk returns without a way to Google', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolveSso!: (result: Result) => void
    clerk.sso.mockImplementationOnce(
      () =>
        new Promise<Result>((resolve) => {
          resolveSso = resolve
        }),
    )
    const user = userEvent.setup()
    render(<SignInForm />)
    const google = screen.getByRole('button', { name: 'Continue with Google' })
    await user.click(google)
    expect(google).toBeDisabled()
    // JSDOM keeps disabled controls focused. Model a browser that drops focus.
    document.body.tabIndex = -1
    document.body.focus()
    document.body.removeAttribute('tabindex')
    await act(async () => resolveSso(ok))

    expect(screen.getByRole('alert')).toHaveTextContent(UNEXPECTED_MESSAGE)
    expect(google).toBeEnabled()
    expect(screen.getByLabelText('Email address')).toHaveFocus()
    expect(error).toHaveBeenCalledWith(
      '[sign-in] Google did not start',
      expect.anything(),
    )
    error.mockRestore()
  })

  it('carries no mailing-list opt-in: an account Clerk makes from it never joins the list (#362)', async () => {
    const user = userEvent.setup()
    render(<SignInForm />)
    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )
    expect(clerk.sso.mock.calls[0][0]).not.toHaveProperty('unsafeMetadata')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('a return from Google needing a second factor this form lacks is said to be unsupported', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    clerk.state.id = 'sia_2'
    clerk.state.status = 'needs_second_factor'
    clerk.state.supportedSecondFactors = [{ strategy: 'phone_code' }]
    render(<SignInForm />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      UNSUPPORTED_STEP_MESSAGE,
    )
    expect(clerk.reset).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('a return from Google needing the new-device code sends the code once and shows the code step', async () => {
    clerk.state.id = 'sia_3'
    clerk.state.identifier = EMAIL
    needsClientTrust()
    const { rerender } = render(<SignInForm />)

    expect(heading()).toHaveTextContent('Confirm it’s you')
    await waitFor(() =>
      expect(
        screen.getByText(/Enter the code we sent to/, { exact: false }),
      ).toBeInTheDocument(),
    )
    rerender(<SignInForm />)
    expect(clerk.mfaSend).toHaveBeenCalledOnce()
  })

  it('a return from Google whose new-device code could not be sent says so', async () => {
    clerk.state.id = 'sia_4'
    needsClientTrust()
    clerk.mfaSend.mockResolvedValue({ error: { message: 'Too many requests' } })
    render(<SignInForm />)

    expect(
      await screen.findByText(/couldn't send a code to/i, { exact: false }),
    ).toBeInTheDocument()
    expect(clerk.mfaSend).toHaveBeenCalledOnce()
  })
})

describe('SignInForm: around the form', () => {
  it('links to sign-up, carrying the target', () => {
    clerk.search.value = 'redirect_url=%2Farticles%2Fgated'
    render(<SignInForm />)
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/sign-up\/?\?redirect_url=%2Farticles%2Fgated$/),
    )
  })

  it('a sign-in Clerk has finished but not made active offers only to continue', async () => {
    complete()
    const user = userEvent.setup()
    render(<SignInForm />)

    expect(heading()).toHaveTextContent('Almost there')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(clerk.finalize).toHaveBeenCalledOnce()
    expect(clerk.password).not.toHaveBeenCalled()
  })
})
