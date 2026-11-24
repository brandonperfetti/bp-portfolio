'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { MAILING_LIST_OPT_IN_KEY } from '@/lib/email/mailingListOptIn'

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

/** What the form knows about the email code's delivery. */
export type SignUpCodeDelivery = CodeDelivery

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
  /**
   * What is known about the code's delivery (`verify` step), which decides
   * the line under the heading. `sent`: this page asked Clerk to send one
   * and Clerk accepted. `failed`: it asked and Clerk refused. `unknown`: the
   * page did not see a send (a reload, a return from Google), so the line
   * claims neither. Defaults to `sent`.
   */
  codeDelivery?: SignUpCodeDelivery
  /** A polite status line on the `verify` step, such as "a new code was sent". */
  notice?: string
  onSubmit: (values: SignUpFormValues) => void
  onGoogle: (values: Pick<SignUpFormValues, 'mailingListOptIn'>) => void
  onVerify: (code: string) => void
  onResend: () => void
  onUseDifferentEmail: () => void
  /** Sign in to the account just created (`finish` step). */
  onFinish: () => void
}

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
 * but the visitor is not signed in yet (the last call failed, or the page
 * was reloaded before it). Showing the first step again there would invite a
 * second sign-up for an address that now has an account, so the card offers
 * the one thing left to do. Its copy claims no failure; a known reason shows
 * as an error above the button.
 *
 * `#clerk-captcha` is where clerk-js mounts its bot check when the instance
 * asks for a visible one; it stays empty otherwise.
 */
export function SignUpFormView(props: SignUpFormViewProps) {
  // Whether the card has shown another step before this one. The first step
  // takes no focus when the page loads (the visitor has not asked for
  // anything yet), but coming back to it from the code step ("Use a different
  // email") must not leave keyboard and screen-reader users at the top of
  // the document: the control they pressed is gone.
  const firstStep = useRef(props.step)
  const [cameFromAnotherStep, setCameFromAnotherStep] = useState(false)
  useEffect(() => {
    if (props.step !== firstStep.current) setCameFromAnotherStep(true)
  }, [props.step])

  return (
    <AuthCard>
      {props.step === 'verify' ? (
        <VerifyStep {...props} />
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
  passwordMinLength,
  signInHref,
  captchaTheme,
  onSubmit,
  onGoogle,
  focusOnArrival,
}: SignUpFormViewProps & { focusOnArrival: boolean }) {
  const id = useId()
  const [optIn, setOptIn] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Back on this step from another one: start at the email field.
  useEffect(() => {
    if (focusOnArrival && !pending) emailRef.current?.focus()
    // On arrival only. `pending` is read but is not a dependency: a later
    // unlock must not pull focus out of a field the visitor is in. The card
    // arrives here unlocked, because it holds the step it came from until
    // the request that leaves it has settled.
  }, [focusOnArrival]) // eslint-disable-line react-hooks/exhaustive-deps

  // A rejected submit puts the visitor back on the first field to fix. Not
  // while `pending`: a disabled field cannot take focus, and Clerk's error
  // can arrive a render before the form unlocks.
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
        onSubmit({
          emailAddress: emailAddress.trim(),
          password,
          mailingListOptIn: readOptIn(event.currentTarget),
        })
      }}
    >
      <AuthHeading id={`${id}-title`} title="Create your account">
        Welcome! Please fill in the details to get started.
      </AuthHeading>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <MailingListOptIn
          checked={optIn}
          onChange={setOptIn}
          name={MAILING_LIST_OPT_IN_KEY}
        />

        <GoogleButton
          onClick={(event) => {
            if (pending) return
            onGoogle({ mailingListOptIn: readOptIn(event.currentTarget.form) })
          }}
        />

        <AuthField
          id={`${id}-email`}
          inputRef={emailRef}
          label="Email address"
          error={errors.emailAddress}
          type="email"
          name="emailAddress"
          autoComplete="email"
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
          autoComplete="new-password"
          hint={`At least ${passwordMinLength} characters`}
          error={errors.password}
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
          {pending ? 'Creating account…' : 'Continue'}
        </Button>
      </fieldset>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href={signInHref} className={AUTH_LINK_CLASS}>
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
  codeDelivery = 'sent',
  notice,
  onVerify,
  onResend,
  onUseDifferentEmail,
}: SignUpFormViewProps) {
  return (
    <CodeStep
      title="Check your email"
      email={verifyEmail}
      codeDelivery={codeDelivery}
      pending={pending}
      codeError={errors.code}
      globalErrors={errors.global}
      notice={notice}
      submitLabel="Verify"
      pendingLabel="Verifying…"
      backLabel="Use a different email"
      onVerify={onVerify}
      onResend={onResend}
      onBack={onUseDifferentEmail}
    />
  )
}

function FinishStep({
  pending,
  errors,
  signInHref,
  onFinish,
}: SignUpFormViewProps) {
  const id = useId()
  const continueRef = useRef<HTMLButtonElement>(null)

  // The card arrives here from a step whose field is gone; put focus on the
  // one thing left to do. Again whenever a retry settles: the button is
  // disabled while it runs, which takes focus from it, so a failed retry
  // would otherwise leave keyboard and screen-reader users at the top.
  useEffect(() => {
    if (!pending) continueRef.current?.focus()
  }, [pending])

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
      <AuthHeading id={`${id}-title`} title="Your account is ready">
        One more step to sign you in.
      </AuthHeading>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <GlobalErrors messages={errors.global} />
        <Button ref={continueRef} type="submit" className="w-full">
          {pending ? 'Signing in…' : 'Continue'}
        </Button>
      </fieldset>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Or{' '}
        <Link href={signInHref} className={AUTH_LINK_CLASS}>
          sign in
        </Link>{' '}
        with the account you just made.
      </p>
    </form>
  )
}
