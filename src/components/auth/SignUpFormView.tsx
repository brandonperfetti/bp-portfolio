'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'

import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleIcon } from '@/icons'
import { MAILING_LIST_OPT_IN_KEY } from '@/lib/email/mailingListOptIn'

import { MailingListOptIn } from './MailingListOptIn'

/** Messages to show, already in words: one per field, plus any that belong to none. */
export type SignUpFormErrors = {
  emailAddress?: string
  password?: string
  code?: string
  global?: string[]
}

/** What the first step reports when it is submitted. */
export type SignUpFormValues = {
  emailAddress: string
  password: string
  /** The opt-in checkbox as it was at the moment of submit. */
  mailingListOptIn: boolean
}

/** Props of {@link SignUpFormView}. */
export type SignUpFormViewProps = {
  /**
   * `start`: opt-in, Google, email and password. `verify`: the email code.
   * `finish`: the account exists but signing in to it did not complete.
   */
  step: 'start' | 'verify' | 'finish'
  /** A request is in flight: every control is disabled until it settles. */
  pending: boolean
  errors: SignUpFormErrors
  /** Clerk's password minimum, for the hint under the field. */
  passwordMinLength: number
  /** Where "Sign in" goes; the caller adds any `redirect_url`. */
  signInHref: string
  /** Theme for Clerk's bot-check widget, when it shows one. */
  captchaTheme?: 'light' | 'dark'
  /** The address the code went to (`verify` step). */
  verifyEmail?: string
  /** A polite status line on the `verify` step, such as "a new code was sent". */
  notice?: string
  onSubmit: (values: SignUpFormValues) => void
  onGoogle: (values: Pick<SignUpFormValues, 'mailingListOptIn'>) => void
  onVerify: (code: string) => void
  onResend: () => void
  onUseDifferentEmail: () => void
  /** Try again to sign in to the account just created (`finish` step). */
  onFinish: () => void
}

const CARD_CLASS =
  'w-full max-w-[25rem] rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8'

const ERROR_CLASS = 'text-sm text-destructive'

/** Whether the opt-in box in `form` is ticked right now, read from the DOM. */
function readOptIn(form: HTMLFormElement | null): boolean {
  if (!form) return false
  return new FormData(form).get(MAILING_LIST_OPT_IN_KEY) === 'on'
}

/**
 * The custom sign-up form's markup (#377): the mailing-list opt-in inside the
 * form's own frame, above both ways of signing up.
 *
 * @remarks
 * Free of Clerk, so every state renders in jsdom and in Storybook without a
 * Clerk instance; `SignUpForm` drives it from Clerk's `useSignUp()`.
 *
 * **The opt-in comes first.** Someone signing up with Google never reaches
 * the email fields, so the question sits under the heading, before the Google
 * button (Brandon, 2026-11-18).
 *
 * **The tick is read from the form at the moment of submit**, for the
 * Continue button and the Google button alike (`readOptIn`), and handed up as
 * a plain boolean. From then on the value cannot change: it is a copy, and
 * the caller sets `pending`, which disables the whole `<fieldset>`, the box
 * included, until Clerk answers. That closes the limit #373 recorded, where
 * Clerk's prebuilt form reported no submit event and a tick changed in the
 * moment after Continue might not be the one sent.
 *
 * **The box is on the first step only.** The answer goes out with the request
 * that starts the sign-up; on the email-code step a box could be ticked to no
 * effect.
 *
 * **The `finish` step** is for one rare state: Clerk has created the account
 * but the last call, the one that signs the visitor in, failed. Showing the
 * first step again there would invite a second sign-up for an address that
 * now has an account, so the card offers the one thing left to do.
 *
 * `#clerk-captcha` is where clerk-js mounts its bot check when the instance
 * asks for a visible one; it stays empty otherwise.
 */
export function SignUpFormView(props: SignUpFormViewProps) {
  return (
    <div className={CARD_CLASS}>
      {props.step === 'verify' ? (
        <VerifyStep {...props} />
      ) : props.step === 'finish' ? (
        <FinishStep {...props} />
      ) : (
        <StartStep {...props} />
      )}
    </div>
  )
}

function GlobalErrors({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return (
    <div role="alert" className={`${ERROR_CLASS} space-y-1`}>
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}

function StartStep({
  pending,
  errors,
  passwordMinLength,
  signInHref,
  captchaTheme,
  onSubmit,
  onGoogle,
}: SignUpFormViewProps) {
  const id = useId()
  const [optIn, setOptIn] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // A rejected submit puts the visitor back on the first field to fix. Not
  // while `pending`: a disabled field cannot take focus, and Clerk's error
  // can arrive a render before the form unlocks.
  useEffect(() => {
    if (pending) return
    if (errors.emailAddress) emailRef.current?.focus()
    else if (errors.password) passwordRef.current?.focus()
  }, [pending, errors.emailAddress, errors.password])

  const passwordDescribedBy = [
    `${id}-password-hint`,
    errors.password ? `${id}-password-error` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onSubmit({
          emailAddress: emailAddress.trim(),
          password,
          mailingListOptIn: readOptIn(event.currentTarget),
        })
      }}
    >
      <div className="text-center">
        <h1 id={`${id}-title`} className="text-lg font-semibold">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome! Please fill in the details to get started.
        </p>
      </div>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <MailingListOptIn
          checked={optIn}
          onChange={setOptIn}
          name={MAILING_LIST_OPT_IN_KEY}
        />

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={(event) => {
            if (pending) return
            onGoogle({ mailingListOptIn: readOptIn(event.currentTarget.form) })
          }}
        >
          <GoogleIcon className="size-4" />
          Continue with Google
        </Button>

        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-xs text-muted-foreground"
        >
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-email`}>Email address</Label>
          <Input
            ref={emailRef}
            id={`${id}-email`}
            type="email"
            name="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            aria-invalid={errors.emailAddress ? true : undefined}
            aria-describedby={
              errors.emailAddress ? `${id}-email-error` : undefined
            }
          />
          {errors.emailAddress ? (
            <p id={`${id}-email-error`} className={ERROR_CLASS}>
              {errors.emailAddress}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-password`}>Password</Label>
          <div className="relative">
            <Input
              ref={passwordRef}
              id={`${id}-password`}
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              required
              className="pr-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={passwordDescribedBy}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          <p
            id={`${id}-password-hint`}
            className="text-sm text-muted-foreground"
          >
            At least {passwordMinLength} characters
          </p>
          {errors.password ? (
            <p id={`${id}-password-error`} className={ERROR_CLASS}>
              {errors.password}
            </p>
          ) : null}
        </div>

        <GlobalErrors messages={errors.global} />

        {/* Clerk mounts its bot check here when the instance shows one. */}
        <div
          id="clerk-captcha"
          data-cl-theme={captchaTheme}
          data-cl-size="flexible"
          className="empty:hidden"
        />

        <Button type="submit" className="w-full">
          {pending ? 'Creating account…' : 'Continue'}
        </Button>
      </fieldset>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={signInHref}
          className="font-medium text-link-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  )
}

function VerifyStep({
  pending,
  errors,
  verifyEmail,
  notice,
  onVerify,
  onResend,
  onUseDifferentEmail,
}: SignUpFormViewProps) {
  const id = useId()
  const [code, setCode] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)

  // Arriving on this step, and every rejected code, lands on the code field.
  // The step first renders while the code is still being sent (`pending`),
  // when the disabled field cannot take focus, so this runs again when the
  // form unlocks.
  useEffect(() => {
    if (!pending) codeRef.current?.focus()
  }, [pending, errors.code])

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onVerify(code.trim())
      }}
    >
      <div className="text-center">
        <h1 id={`${id}-title`} className="text-lg font-semibold">
          Check your email
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the code we sent to{' '}
          {verifyEmail ? (
            <span className="font-medium break-all text-card-foreground">
              {verifyEmail}
            </span>
          ) : (
            'your email address'
          )}
          .
        </p>
      </div>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-code`}>Verification code</Label>
          <Input
            ref={codeRef}
            id={`${id}-code`}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={errors.code ? `${id}-code-error` : undefined}
          />
          {errors.code ? (
            <p id={`${id}-code-error`} className={ERROR_CLASS}>
              {errors.code}
            </p>
          ) : null}
        </div>

        <GlobalErrors messages={errors.global} />

        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {notice}
        </p>

        <Button type="submit" className="w-full">
          {pending ? 'Verifying…' : 'Verify'}
        </Button>

        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
          <Button type="button" variant="link" size="sm" onClick={onResend}>
            Send a new code
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onUseDifferentEmail}
          >
            Use a different email
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

function FinishStep({
  pending,
  errors,
  signInHref,
  onFinish,
}: SignUpFormViewProps) {
  const id = useId()
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
      <div className="text-center">
        <h1 id={`${id}-title`} className="text-lg font-semibold">
          Your account is ready
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We created your account but couldn&apos;t sign you in.
        </p>
      </div>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <GlobalErrors messages={errors.global} />
        <Button type="submit" className="w-full">
          {pending ? 'Signing in…' : 'Try again'}
        </Button>
      </fieldset>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Or{' '}
        <Link
          href={signInHref}
          className="font-medium text-link-accent underline-offset-4 hover:underline"
        >
          sign in
        </Link>{' '}
        with the account you just made.
      </p>
    </form>
  )
}
