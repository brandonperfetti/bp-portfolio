import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

import { SignUpFormView } from './SignUpFormView'

/**
 * The custom sign-up form (#377) in each of its states, without Clerk:
 * `SignUpForm` drives this view from Clerk's `useSignUp()`, which needs a
 * live instance and cannot mount here.
 *
 * Every state has a dark twin, and the first step has a phone-width one
 * (375px, the narrowest the site supports), because "inside the form's frame
 * in both themes and at phone width" is #377's acceptance.
 */
const meta = {
  title: 'Auth/SignUpForm',
  component: SignUpFormView,
  args: {
    step: 'start',
    pending: false,
    errors: {},
    passwordMinLength: 15,
    signInHref: '/sign-in',
    onSubmit: fn(),
    onGoogle: fn(),
    onVerify: fn(),
    onResend: fn(),
    onUseDifferentEmail: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SignUpFormView>

export default meta
type Story = StoryObj<typeof meta>

const phone: Story['decorators'] = [
  (Story) => (
    <div className="w-[375px] px-4">
      <Story />
    </div>
  ),
]

/**
 * The first step. The opt-in is unticked and comes before both ways of
 * signing up; the tick is reported with whichever button is pressed.
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', {
      name: MAILING_LIST_OPT_IN_LABEL,
    })
    await expect(box).not.toBeChecked()

    await userEvent.click(box)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Continue with Google' }),
    )
    await expect(args.onGoogle).toHaveBeenCalledWith({ mailingListOptIn: true })

    await userEvent.type(
      canvas.getByLabelText('Email address'),
      'reader@example.com',
    )
    await userEvent.type(
      canvas.getByLabelText('Password'),
      'a long enough password',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }))
    await expect(args.onSubmit).toHaveBeenCalledWith({
      emailAddress: 'reader@example.com',
      password: 'a long enough password',
      mailingListOptIn: true,
    })
  },
}

export const DefaultDark: Story = { globals: { theme: 'dark' } }

/** 375px: the card fills the width and the opt-in wraps inside it. */
export const Phone: Story = { decorators: phone }

export const PhoneDark: Story = {
  decorators: phone,
  globals: { theme: 'dark' },
}

/**
 * A request is in flight: every control is disabled, the opt-in included, so
 * the box cannot drift from the value already sent.
 */
export const Submitting: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('checkbox', { name: MAILING_LIST_OPT_IN_LABEL }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled()
  },
}

export const SubmittingDark: Story = {
  ...Submitting,
  globals: { theme: 'dark' },
}

/** Clerk's field errors, under their fields. */
export const FieldErrors: Story = {
  args: {
    errors: {
      emailAddress: 'That email address is taken. Please try another.',
      password: 'Passwords must be 15 characters or more.',
    },
  },
}

export const FieldErrorsDark: Story = {
  ...FieldErrors,
  globals: { theme: 'dark' },
}

/** An error that belongs to no field. */
export const GlobalError: Story = {
  args: {
    errors: { global: ['Too many requests. Please try again in a bit.'] },
  },
}

export const GlobalErrorDark: Story = {
  ...GlobalError,
  globals: { theme: 'dark' },
}

/** The email-code step. The opt-in is gone: its answer has been sent. */
export const VerifyEmail: Story = {
  args: { step: 'verify', verifyEmail: 'reader@example.com' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.type(canvas.getByLabelText('Verification code'), '424242')
    await userEvent.click(canvas.getByRole('button', { name: 'Verify' }))
    await expect(args.onVerify).toHaveBeenCalledWith('424242')
  },
}

export const VerifyEmailDark: Story = {
  args: { step: 'verify', verifyEmail: 'reader@example.com' },
  globals: { theme: 'dark' },
}

export const VerifyEmailPhone: Story = {
  args: {
    step: 'verify',
    verifyEmail: 'a.reader.with.a.long.address@example.com',
  },
  decorators: phone,
}

/** A rejected code, and the notice after "Send a new code". */
export const VerifyEmailError: Story = {
  args: {
    step: 'verify',
    verifyEmail: 'reader@example.com',
    errors: { code: 'That code is incorrect.' },
    notice: 'A new code is on its way.',
  },
}

export const VerifyEmailErrorDark: Story = {
  ...VerifyEmailError,
  globals: { theme: 'dark' },
}
