import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SignInFormView } from './SignInFormView'

/**
 * The custom sign-in form (#379) in each of its states, without Clerk:
 * `SignInForm` drives this view from Clerk's `useSignIn()`, which needs a
 * live instance and cannot mount here.
 *
 * Every state has a dark twin and a phone-width one (375px, the narrowest
 * the site supports): "matches `/sign-up` in both themes and at phone width"
 * is #379's acceptance, and `Auth/SignUpForm` is the pair to compare with.
 */
const meta = {
  title: 'Auth/SignInForm',
  component: SignInFormView,
  args: {
    step: 'start',
    pending: false,
    errors: {},
    passwordMinLength: 15,
    signUpHref: '/sign-up',
    email: 'reader@example.com',
    onSubmit: fn(),
    onSocial: fn(),
    onEmailCode: fn(),
    onForgotPassword: fn(),
    onVerify: fn(),
    onResend: fn(),
    onStartOver: fn(),
    onNewPassword: fn(),
    onFinish: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SignInFormView>

export default meta
type Story = StoryObj<typeof meta>

const phone: Story['decorators'] = [
  (Story) => (
    <div className="w-[375px] px-4">
      <Story />
    </div>
  ),
]
const dark = { globals: { theme: 'dark' } }

/** The first step: Google, then email and password, and the two ways round a password. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(
      canvas.getByLabelText('Email address'),
      'reader@example.com',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Email me a sign-in code instead' }),
    )
    await expect(args.onEmailCode).toHaveBeenCalledWith('reader@example.com')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Forgot password?' }),
    )
    await expect(args.onForgotPassword).toHaveBeenCalledWith(
      'reader@example.com',
    )
    await userEvent.type(canvas.getByLabelText('Password'), 'correct horse')
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }))
    await expect(args.onSubmit).toHaveBeenCalledWith({
      emailAddress: 'reader@example.com',
      password: 'correct horse',
    })
  },
}
export const DefaultDark: Story = { ...dark }
export const Phone: Story = { decorators: phone }
export const PhoneDark: Story = { decorators: phone, ...dark }

/** GitHub switched on (#431): its button sits under Google's. */
export const WithGitHub: Story = {
  args: { providers: ['google', 'github'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Continue with GitHub' }),
    )
    await expect(args.onSocial).toHaveBeenCalledWith('github')
  },
}
export const WithGitHubDark: Story = {
  args: { providers: ['google', 'github'] },
  ...dark,
}
export const WithGitHubPhone: Story = {
  args: { providers: ['google', 'github'] },
  decorators: phone,
}

/** A request is in flight: every control is disabled. */
export const Submitting: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Signing in…' }),
    ).toBeDisabled()
  },
}
export const SubmittingDark: Story = { ...Submitting, ...dark }

/** Clerk's field errors, under their fields. */
export const FieldErrors: Story = {
  args: {
    errors: {
      emailAddress: "Couldn't find your account.",
      password: 'Password is incorrect. Try again, or use another method.',
    },
  },
}
export const FieldErrorsDark: Story = { ...FieldErrors, ...dark }
export const FieldErrorsPhone: Story = { ...FieldErrors, decorators: phone }

/** A message that belongs to no field, such as a step this form lacks. */
export const GlobalError: Story = {
  args: {
    errors: {
      global: [
        "We couldn't finish signing you in here: your account asks for a verification step this page doesn't support yet.",
      ],
    },
  },
}
export const GlobalErrorDark: Story = { ...GlobalError, ...dark }

/** Signing in with an emailed code instead of a password. */
export const EmailCode: Story = {
  args: { step: 'email-code', codeDelivery: 'sent' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Verification code'), '424242')
    await userEvent.click(canvas.getByRole('button', { name: 'Verify' }))
    await expect(args.onVerify).toHaveBeenCalledWith('424242')
  },
}
export const EmailCodeDark: Story = { ...EmailCode, ...dark }
export const EmailCodePhone: Story = { ...EmailCode, decorators: phone }

/** Clerk's new-device check (Device Trust), on by default in production. */
export const NewDevice: Story = {
  args: { step: 'second-factor', secondFactorReason: 'new-device' },
}
export const NewDeviceDark: Story = { ...NewDevice, ...dark }
export const NewDevicePhone: Story = { ...NewDevice, decorators: phone }

/** Arrived without this page sending a code (a reload, back from Google). */
export const NewDeviceDeliveryUnknown: Story = {
  args: { ...NewDevice.args, codeDelivery: 'unknown' },
}
export const NewDeviceDeliveryUnknownDark: Story = {
  ...NewDeviceDeliveryUnknown,
  ...dark,
}

/** A second factor the account set up (none in production today). */
export const SecondFactor: Story = {
  args: { step: 'second-factor', secondFactorReason: 'second-factor' },
}
export const SecondFactorDark: Story = { ...SecondFactor, ...dark }

/** A rejected code, with a new one just sent. */
export const CodeError: Story = {
  args: {
    step: 'second-factor',
    errors: { code: 'Incorrect code' },
    notice: 'A new code is on its way.',
  },
}
export const CodeErrorDark: Story = { ...CodeError, ...dark }

/** Sending the code failed: the step does not say one was sent. */
export const CodeSendFailed: Story = {
  args: {
    step: 'email-code',
    codeDelivery: 'failed',
    errors: { global: ['Too many requests. Please try again in a bit.'] },
  },
}
export const CodeSendFailedDark: Story = { ...CodeSendFailed, ...dark }

/** Forgot password: the reset code. */
export const ResetCode: Story = { args: { step: 'reset-code' } }
export const ResetCodeDark: Story = { ...ResetCode, ...dark }
export const ResetCodePhone: Story = { ...ResetCode, decorators: phone }

/** Forgot password: the new password. */
export const NewPassword: Story = {
  args: { step: 'new-password' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(
      canvas.getByLabelText('New password'),
      'a brand new long password',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Reset password and sign in' }),
    )
    await expect(args.onNewPassword).toHaveBeenCalledWith(
      'a brand new long password',
    )
  },
}
export const NewPasswordDark: Story = { ...NewPassword, ...dark }
export const NewPasswordPhone: Story = { ...NewPassword, decorators: phone }

/** The new password refused by Clerk. */
export const NewPasswordError: Story = {
  args: {
    step: 'new-password',
    errors: { password: 'Passwords must be 15 characters or more.' },
  },
}
export const NewPasswordErrorDark: Story = { ...NewPasswordError, ...dark }

/** Clerk finished the sign-in but making the session active did not complete. */
export const Finish: Story = {
  args: {
    step: 'finish',
    errors: { global: ['Something went wrong. Please try again.'] },
  },
}
export const FinishDark: Story = { ...Finish, ...dark }
