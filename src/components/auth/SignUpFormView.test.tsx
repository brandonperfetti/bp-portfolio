import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

import { SignUpFormView, type SignUpFormViewProps } from './SignUpFormView'

/**
 * #377: the sign-up form's markup and the one piece of behaviour it owns,
 * which is reading the form at the moment of submit. It knows nothing of
 * Clerk; `SignUpForm.test.tsx` covers what is done with what it reports.
 */
function setup(overrides: Partial<SignUpFormViewProps> = {}) {
  const props: SignUpFormViewProps = {
    step: 'start',
    pending: false,
    errors: {},
    passwordMinLength: 15,
    signInHref: '/sign-in',
    onSubmit: vi.fn(),
    onSocial: vi.fn(),
    onVerify: vi.fn(),
    onResend: vi.fn(),
    onUseDifferentEmail: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  }
  const view = render(<SignUpFormView {...props} />)
  return { props, user: userEvent.setup(), ...view }
}

const optIn = () =>
  screen.getByRole('checkbox', { name: MAILING_LIST_OPT_IN_LABEL })

/**
 * The ids `field` names in `aria-describedby`, as whole tokens.
 *
 * @remarks `toContain(id)` on the raw attribute passes for an empty id (every
 * string contains ''), and for an id that is only part of another (#384).
 */
function describedBy(field: HTMLElement): string[] {
  return (field.getAttribute('aria-describedby') ?? '').split(/\s+/)
}

/** `element`'s id, which must not be empty for anything to point at it. */
function idOf(element: HTMLElement): string {
  expect(element.id).not.toBe('')
  return element.id
}

describe('SignUpFormView, first step', () => {
  it('shows the accepted heading and welcome line', () => {
    setup()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Welcome! Please fill in the details to get started.'),
    ).toBeInTheDocument()
  })

  it('puts the opt-in, unticked, before both ways of signing up', () => {
    setup()
    expect(optIn()).not.toBeChecked()

    // Decision 6 (#377): someone signing up with Google must reach the
    // question before the Google button, so it comes first in the form.
    const form = screen.getByRole('form', { name: 'Create your account' })
    const controls = Array.from(
      form.querySelectorAll<HTMLElement>('input, button, a'),
    )
    const expected: HTMLElement[] = [
      optIn(),
      screen.getByRole('button', { name: 'Continue with Google' }),
      screen.getByLabelText('Email address'),
      screen.getByLabelText('Password'),
      screen.getByRole('button', { name: 'Show password' }),
      screen.getByRole('button', { name: 'Continue' }),
      screen.getByRole('link', { name: 'Sign in' }),
    ]
    expect(controls.map((el) => expected.indexOf(el))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
  })

  it('reports the email, the password and the tick as they are at submit', async () => {
    const { user, props } = setup()
    await user.type(screen.getByLabelText('Email address'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'a long enough password')
    await user.click(optIn())
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith({
      emailAddress: 'a@example.com',
      password: 'a long enough password',
      mailingListOptIn: true,
    })
  })

  it('reports an unticked box as an explicit false', async () => {
    const { user, props } = setup()
    await user.type(screen.getByLabelText('Email address'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'a long enough password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ mailingListOptIn: false }),
    )
  })

  it('reports the tick with the Google button too, without needing the fields', async () => {
    const { user, props } = setup()
    await user.click(optIn())
    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )
    expect(props.onSocial).toHaveBeenCalledExactlyOnceWith('google', {
      mailingListOptIn: true,
    })

    await user.click(optIn())
    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )
    expect(props.onSocial).toHaveBeenLastCalledWith('google', {
      mailingListOptIn: false,
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('offers Google alone unless GitHub is passed in (#431)', () => {
    setup()
    expect(
      screen.queryByRole('button', { name: 'Continue with GitHub' }),
    ).not.toBeInTheDocument()
  })

  it('reports the tick with the GitHub button, after the opt-in, like Google (#431)', async () => {
    const { user, props } = setup({ providers: ['google', 'github'] })
    const github = screen.getByRole('button', { name: 'Continue with GitHub' })
    // The question still comes first: before every way of signing up.
    expect(
      optIn().compareDocumentPosition(github) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(github)
    expect(props.onSocial).toHaveBeenLastCalledWith('github', {
      mailingListOptIn: false,
    })
    await user.click(optIn())
    await user.click(github)
    expect(props.onSocial).toHaveBeenLastCalledWith('github', {
      mailingListOptIn: true,
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('disables the GitHub button with the rest while a request is pending (#431)', async () => {
    const { user, props } = setup({
      pending: true,
      providers: ['google', 'github'],
    })
    const github = screen.getByRole('button', { name: 'Continue with GitHub' })
    expect(github).toBeDisabled()
    await user.click(github)
    expect(props.onSocial).not.toHaveBeenCalled()
  })

  it('submits on Enter from the password field', async () => {
    const { user, props } = setup()
    await user.type(screen.getByLabelText('Email address'), 'a@example.com')
    await user.type(
      screen.getByLabelText('Password'),
      'a long enough password{Enter}',
    )
    expect(props.onSubmit).toHaveBeenCalledOnce()
  })

  it('disables every control while a request is pending, and reports nothing', async () => {
    const { user, props } = setup({ pending: true })

    expect(optIn()).toBeDisabled()
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled()
    const submit = screen.getByRole('button', { name: /creating account/i })
    expect(submit).toBeDisabled()

    await user.click(optIn())
    expect(optIn()).not.toBeChecked()
    await user.click(submit)
    expect(props.onSubmit).not.toHaveBeenCalled()
    expect(props.onSocial).not.toHaveBeenCalled()
  })

  it('states the password minimum and ties it to the field', () => {
    setup({ passwordMinLength: 15 })
    const password = screen.getByLabelText('Password')
    const hint = screen.getByText('At least 15 characters')
    expect(describedBy(password)).toContain(idOf(hint))
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'autocomplete',
      'email',
    )
  })

  it('shows and hides the password', async () => {
    const { user } = setup()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('shows each field error under its field, linked and marked invalid', () => {
    setup({
      errors: {
        emailAddress: 'That email address is taken.',
        password: 'Passwords must be 15 characters or more.',
      },
    })
    const email = screen.getByLabelText('Email address')
    const emailError = screen.getByText('That email address is taken.')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(email)).toEqual([idOf(emailError)])

    const password = screen.getByLabelText('Password')
    const passwordError = screen.getByText(
      'Passwords must be 15 characters or more.',
    )
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(password)).toContain(idOf(passwordError))
  })

  it('moves focus to the first field with an error', () => {
    const { rerender, props } = setup()
    rerender(<SignUpFormView {...props} errors={{ password: 'Too short.' }} />)
    expect(screen.getByLabelText('Password')).toHaveFocus()

    rerender(
      <SignUpFormView
        {...props}
        errors={{ emailAddress: 'Taken.', password: 'Too short.' }}
      />,
    )
    expect(screen.getByLabelText('Email address')).toHaveFocus()
  })

  it('waits for the form to unlock before moving focus to a field with an error', () => {
    // Clerk's error can land while the request is still marked in flight; a
    // disabled field cannot take focus, so the move must happen on unlock.
    const { rerender, props } = setup({ pending: true })
    rerender(
      <SignUpFormView {...props} pending errors={{ emailAddress: 'Taken.' }} />,
    )
    expect(screen.getByLabelText('Email address')).not.toHaveFocus()

    rerender(
      <SignUpFormView
        {...props}
        pending={false}
        errors={{ emailAddress: 'Taken.' }}
      />,
    )
    expect(screen.getByLabelText('Email address')).toHaveFocus()
  })

  it('announces errors that belong to no field', () => {
    setup({ errors: { global: ['Too many requests. Try again in a bit.'] } })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Too many requests. Try again in a bit.',
    )
  })

  it("leaves a place for Clerk's bot check, themed with the site", () => {
    const { container } = setup({ captchaTheme: 'dark' })
    const slot = container.querySelector('#clerk-captcha')
    expect(slot).not.toBeNull()
    expect(slot).toHaveAttribute('data-cl-theme', 'dark')
  })

  it('links to sign-in, carrying whatever target it was given', () => {
    setup({ signInHref: '/sign-in?redirect_url=%2Farticles%2Fx' })
    // Parsed, not compared as text: next/link's href formatting outside a
    // Next build adds a trailing slash to the path, which is not under test.
    const href = new URL(
      screen.getByRole<HTMLAnchorElement>('link', { name: 'Sign in' }).href,
    )
    expect(href.pathname).toMatch(/^\/sign-in\/?$/)
    expect(href.searchParams.get('redirect_url')).toBe('/articles/x')
  })
})

describe('SignUpFormView, email-code step', () => {
  const verify = (overrides: Partial<SignUpFormViewProps> = {}) =>
    setup({ step: 'verify', verifyEmail: 'a@example.com', ...overrides })

  it('names the address the code went to and focuses the code field', () => {
    verify()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Check your email' }),
    ).toBeInTheDocument()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    const code = screen.getByLabelText('Verification code')
    expect(code).toHaveFocus()
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(code).toHaveAttribute('inputmode', 'numeric')
  })

  it('focuses the code field when the step unlocks, having first rendered locked', () => {
    // A transition the view supports, though `SignUpForm` now holds the
    // first step until the code is sent: the step rendered locked.
    const { rerender, props } = verify({ pending: true })
    const code = screen.getByLabelText('Verification code')
    expect(code).toBeDisabled()
    expect(code).not.toHaveFocus()

    rerender(<SignUpFormView {...props} pending={false} />)
    expect(screen.getByLabelText('Verification code')).toHaveFocus()
  })

  it('says a code was sent, to the address', () => {
    verify()
    expect(screen.getByText(/Enter the code we sent to/).textContent).toBe(
      'Enter the code we sent to a@example.com.',
    )
  })

  it('says so instead when the code could not be sent, and names the way forward (#384)', () => {
    verify({ codeDelivery: 'failed' })
    expect(screen.queryByText(/the code we sent/i)).not.toBeInTheDocument()
    expect(screen.getByText(/couldn.t send a code to/i).textContent).toBe(
      'We couldn\'t send a code to a@example.com. Choose "Send a new code" to try again.',
    )
    expect(
      screen.getByRole('button', { name: 'Send a new code' }),
    ).toBeEnabled()
  })

  it('claims neither when the page did not see a send (#384)', () => {
    verify({ codeDelivery: 'unknown' })
    expect(screen.queryByText(/the code we sent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/couldn.t send/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Enter the verification code for/).textContent,
    ).toBe(
      'Enter the verification code for a@example.com. If you don\'t have one, choose "Send a new code".',
    )
  })

  it('no longer shows the opt-in: the answer has already been sent', () => {
    verify()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('reports the code, trimmed', async () => {
    const { user, props } = verify()
    await user.type(screen.getByLabelText('Verification code'), ' 424242 ')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(props.onVerify).toHaveBeenCalledExactlyOnceWith('424242')
  })

  it('offers a new code and a different email', async () => {
    const { user, props } = verify()
    await user.click(screen.getByRole('button', { name: 'Send a new code' }))
    expect(props.onResend).toHaveBeenCalledOnce()
    await user.click(
      screen.getByRole('button', { name: 'Use a different email' }),
    )
    expect(props.onUseDifferentEmail).toHaveBeenCalledOnce()
  })

  it('shows a code error under the field and a notice when one is given', () => {
    verify({
      errors: { code: 'That code is incorrect.' },
      notice: 'A new code is on its way.',
    })
    const code = screen.getByLabelText('Verification code')
    const error = screen.getByText('That code is incorrect.')
    expect(code).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy(code)).toEqual([idOf(error)])
    expect(screen.getByRole('status')).toHaveTextContent(
      'A new code is on its way.',
    )
  })

  it('disables the step while a request is pending', () => {
    verify({ pending: true })
    const form = screen.getByRole('form', { name: 'Check your email' })
    for (const control of within(form).getAllByRole('button')) {
      expect(control).toBeDisabled()
    }
    expect(screen.getByLabelText('Verification code')).toBeDisabled()
  })
})

describe('SignUpFormView, moving between steps', () => {
  it('takes no focus when the first step is what the page loads with', () => {
    setup()
    expect(document.body).toHaveFocus()
  })

  it('focuses the email field when the card comes back to the first step', () => {
    // "Use a different email": the button that was pressed is gone with the
    // code step, so focus has to be put somewhere on the new one.
    const { rerender, props } = setup()
    rerender(
      <SignUpFormView {...props} step="verify" verifyEmail="a@example.com" />,
    )
    expect(screen.getByLabelText('Verification code')).toHaveFocus()

    rerender(<SignUpFormView {...props} step="start" />)
    expect(screen.getByLabelText('Email address')).toHaveFocus()
  })

  it('does the same when the page loaded on the code step', () => {
    const { rerender, props } = setup({
      step: 'verify',
      verifyEmail: 'a@example.com',
    })
    rerender(<SignUpFormView {...props} step="start" />)
    expect(screen.getByLabelText('Email address')).toHaveFocus()
  })
})

describe('SignUpFormView, finish step', () => {
  it('offers one thing: to try signing in again, or the sign-in page', async () => {
    const { user, props } = setup({
      step: 'finish',
      signInHref: '/sign-in',
      errors: { global: ['Could not start your session.'] },
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your account is ready' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not start your session.',
    )
    // No way to start a second sign-up for an address that has an account.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(props.onFinish).toHaveBeenCalledOnce()
    expect(
      new URL(
        screen.getByRole<HTMLAnchorElement>('link', { name: 'sign in' }).href,
      ).pathname,
    ).toMatch(/^\/sign-in\/?$/)
  })

  it('puts focus on Continue when the card arrives on this step', () => {
    // From the code step, whose field has gone with it.
    const { rerender, props } = setup({
      step: 'verify',
      verifyEmail: 'a@example.com',
    })
    expect(screen.getByLabelText('Verification code')).toHaveFocus()

    rerender(<SignUpFormView {...props} step="finish" />)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
  })

  it('disables the button while the retry is pending', () => {
    setup({ step: 'finish', pending: true })
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })
})
