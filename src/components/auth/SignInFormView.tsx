'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

import {
  AUTH_LINK_CLASS,
  AuthCard,
  AuthField,
  AuthHeading,
  CodeStep,
  GlobalErrors,
  GoogleButton,
  PasswordField,
  type CodeDelivery,
} from './AuthFormParts'

/** Messages to show, already in words: one per field, plus any that belong to none. */
export type SignInFormErrors = {
  emailAddress?: string
  password?: string
  code?: string
  global?: string[]
}

/** What the first step reports when it is submitted. */
export type SignInFormValues = {
  emailAddress: string
  password: string
}

/** The steps of {@link SignInFormView}. */
export type SignInStep =
  | 'start'
  | 'email-code'
  | 'second-factor'
  | 'reset-code'
  | 'new-password'
  | 'finish'

/** Props of {@link SignInFormView}. */
export type SignInFormViewProps = {
  /**
   * `start`: Google, email and password, and the two ways round a password
   * (an emailed code, a reset). `email-code`: the code that signs in without
   * a password. `second-factor`: an emailed code Clerk asks for after the
   * first one (the new-device check, or a second factor). `reset-code`: the
   * code that starts a password reset. `new-password`: the new password.
   * `finish`: Clerk has signed the visitor in but making the session active
   * did not complete.
   */
  step: SignInStep
  /** A request is in flight: every control is disabled until it settles. */
  pending: boolean
  errors: SignInFormErrors
  /** Clerk's password minimum, for the hint on the new-password step. */
  passwordMinLength: number
  /** Where "Sign up" goes; the caller adds any `redirect_url`. */
  signUpHref: string
  /** Theme for Clerk's bot-check widget, when it shows one. */
  captchaTheme?: 'light' | 'dark'
  /** The address a code went to, on the code steps and the new password. */
  email?: string
  /** What is known about the code's delivery (code steps). Defaults to `sent`. */
  codeDelivery?: CodeDelivery
  /**
   * Why `second-factor` asks for a code. `new-device`: Clerk's Device Trust,
   * which production has on. `second-factor`: a second factor the account
   * has set up.
   */
  secondFactorReason?: 'new-device' | 'second-factor'
  /** A polite status line on a code step, such as "a new code was sent". */
  notice?: string
  onSubmit: (values: SignInFormValues) => void
  onGoogle: () => void
  /** Sign in with an emailed code instead of the password. */
  onEmailCode: (emailAddress: string) => void
  /** Start a password reset for this address. */
  onForgotPassword: (emailAddress: string) => void
  /** A code entered on any of the three code steps. */
  onVerify: (code: string) => void
  onResend: () => void
  /** Drop this attempt and go back to the first step. */
  onStartOver: () => void
  onNewPassword: (password: string) => void
  /** Make the session active (`finish` step). */
  onFinish: () => void
}

/**
 * The custom sign-in form's markup (#379): the same card, type and controls
 * as the sign-up form (`AuthFormParts`), so `/sign-in` and `/sign-up` read as
 * one pair.
 *
 * @remarks
 * Free of Clerk, so every state renders in jsdom and in Storybook without a
 * Clerk instance; `SignInForm` drives it from Clerk's `useSignIn()`.
 *
 * **One first step for every way in.** Google, then email and password, with
 * "Email me a sign-in code" for an account that has no password (one made
 * with Google, say) and "Forgot password?" beside the password label. Both
 * use the address typed above, so there is no separate screen to ask for it.
 *
 * **Every code step is the same `CodeStep`** as sign-up's: the line under
 * the heading never says a code was sent when this page did not see it
 * sent, and "Send a new code" is always there.
 *
 * `#clerk-captcha` is where clerk-js mounts its bot check when the instance
 * asks for a visible one; it stays empty otherwise.
 */
export function SignInFormView(props: SignInFormViewProps) {
  // As on sign-up: the first step takes no focus when the page loads, but
  // coming back to it from another step must not leave keyboard and
  // screen-reader users at the top of the document.
  const firstStep = useRef(props.step)
  const [cameFromAnotherStep, setCameFromAnotherStep] = useState(false)
  useEffect(() => {
    if (props.step !== firstStep.current) setCameFromAnotherStep(true)
  }, [props.step])

  const codeStep = (title: string, backLabel: string, intro?: string) => (
    <CodeStep
      title={title}
      intro={intro}
      email={props.email}
      codeDelivery={props.codeDelivery ?? 'sent'}
      pending={props.pending}
      codeError={props.errors.code}
      globalErrors={props.errors.global}
      notice={props.notice}
      submitLabel="Verify"
      pendingLabel="Verifying…"
      backLabel={backLabel}
      onVerify={props.onVerify}
      onResend={props.onResend}
      onBack={props.onStartOver}
    />
  )

  return (
    <AuthCard>
      {props.step === 'email-code' ? (
        codeStep('Check your email', 'Use another method')
      ) : props.step === 'second-factor' ? (
        codeStep(
          'Confirm it’s you',
          'Start over',
          props.secondFactorReason === 'second-factor'
            ? 'Your account asks for a second step.'
            : 'You’re signing in on a new device.',
        )
      ) : props.step === 'reset-code' ? (
        codeStep('Reset your password', 'Back to sign in')
      ) : props.step === 'new-password' ? (
        <NewPasswordStep {...props} />
      ) : props.step === 'finish' ? (
        <FinishStep {...props} />
      ) : (
        <StartStep {...props} focusOnArrival={cameFromAnotherStep} />
      )}
    </AuthCard>
  )
}

function StartStep({
  pending,
  errors,
  signUpHref,
  captchaTheme,
  onSubmit,
  onGoogle,
  onEmailCode,
  onForgotPassword,
  focusOnArrival,
}: SignInFormViewProps & { focusOnArrival: boolean }) {
  const id = useId()
  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Back on this step from another one: start at the email field. On
  // arrival only, as on sign-up.
  useEffect(() => {
    if (focusOnArrival && !pending) emailRef.current?.focus()
  }, [focusOnArrival]) // eslint-disable-line react-hooks/exhaustive-deps

  // A rejected submit puts the visitor back on the first field to fix.
  useEffect(() => {
    if (pending) return
    if (errors.emailAddress) emailRef.current?.focus()
    else if (errors.password) passwordRef.current?.focus()
  }, [pending, errors.emailAddress, errors.password])

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onSubmit({ emailAddress: emailAddress.trim(), password })
      }}
    >
      <AuthHeading id={`${id}-title`} title="Sign in">
        Welcome back! Please sign in to continue.
      </AuthHeading>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <GoogleButton
          onClick={() => {
            if (pending) return
            onGoogle()
          }}
        />

        <AuthField
          id={`${id}-email`}
          inputRef={emailRef}
          label="Email address"
          error={errors.emailAddress}
          type="email"
          name="emailAddress"
          autoComplete="username email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={emailAddress}
          onChange={(event) => setEmailAddress(event.target.value)}
        />

        <PasswordField
          id={`${id}-password`}
          inputRef={passwordRef}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
          labelAction={
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => onForgotPassword(emailAddress.trim())}
            >
              Forgot password?
            </Button>
          }
        />

        <GlobalErrors messages={errors.global} />

        {/* Clerk mounts its bot check here when the instance shows one. */}
        <div
          id="clerk-captcha"
          data-cl-theme={captchaTheme}
          data-cl-size="flexible"
          className="empty:hidden"
        />

        <Button type="submit" className="w-full">
          {pending ? 'Signing in…' : 'Continue'}
        </Button>

        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => onEmailCode(emailAddress.trim())}
        >
          Email me a sign-in code instead
        </Button>
      </fieldset>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href={signUpHref} className={AUTH_LINK_CLASS}>
          Sign up
        </Link>
      </p>
    </form>
  )
}

function NewPasswordStep({
  pending,
  errors,
  email,
  passwordMinLength,
  onNewPassword,
  onStartOver,
}: SignInFormViewProps) {
  const id = useId()
  const [password, setPassword] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)

  // The code field is gone; land on the new one, and again after a refusal.
  useEffect(() => {
    if (!pending) passwordRef.current?.focus()
  }, [pending, errors.password])

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onNewPassword(password)
      }}
    >
      <AuthHeading id={`${id}-title`} title="Set a new password">
        {email ? (
          <>
            For{' '}
            <span className="font-medium break-all text-card-foreground">
              {email}
            </span>
            . Other devices signed in to this account will be signed out.
          </>
        ) : (
          'Other devices signed in to this account will be signed out.'
        )}
      </AuthHeading>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        {/* For password managers: which account the new password is for. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={email ?? ''}
          readOnly
          hidden
        />
        <PasswordField
          id={`${id}-password`}
          inputRef={passwordRef}
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`At least ${passwordMinLength} characters`}
          error={errors.password}
        />

        <GlobalErrors messages={errors.global} />

        <Button type="submit" className="w-full">
          {pending ? 'Saving…' : 'Reset password and sign in'}
        </Button>

        <Button type="button" variant="link" size="sm" onClick={onStartOver}>
          Back to sign in
        </Button>
      </fieldset>
    </form>
  )
}

function FinishStep({ pending, errors, onFinish }: SignInFormViewProps) {
  const id = useId()
  const continueRef = useRef<HTMLButtonElement>(null)

  // The field the visitor was in is gone; put focus on the one thing left.
  useEffect(() => {
    continueRef.current?.focus()
  }, [])

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onFinish()
      }}
    >
      <AuthHeading id={`${id}-title`} title="Almost there">
        One more step to sign you in.
      </AuthHeading>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <GlobalErrors messages={errors.global} />
        <Button ref={continueRef} type="submit" className="w-full">
          {pending ? 'Signing in…' : 'Continue'}
        </Button>
      </fieldset>
    </form>
  )
}
