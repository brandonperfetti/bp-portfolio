'use client'

import { useEffect, useRef, useState } from 'react'

import { useSignIn } from '@clerk/nextjs'
import { useTheme } from 'next-themes'

import { withRedirect } from '@/lib/auth/safeRedirect'

import type { CodeDelivery } from './AuthFormParts'
import { SIGN_IN_SSO_CALLBACK_PATH, SIGN_UP_PATH } from './paths'
import {
  SignInFormView,
  type SignInFormErrors,
  type SignInFormValues,
  type SignInStep,
} from './SignInFormView'
import { PASSWORD_MIN_LENGTH } from './SignUpForm'
import {
  errorText as text,
  LEAVE_TIMEOUT_MS,
  UNEXPECTED_MESSAGE,
  useAuthSteps,
  useFinalizeNavigate,
  useRedirectTarget,
} from './useAuthSteps'

/**
 * For a sign-in that needs a step this form has none for: a second factor
 * other than an emailed code (an authenticator app, a text message), which
 * production does not offer today. It names no way forward it cannot offer.
 */
export const UNSUPPORTED_STEP_MESSAGE =
  "We couldn't finish signing you in here: your account asks for a verification step this page doesn't support yet."
/** "Email me a sign-in code" for an account that cannot have one. */
export const NO_EMAIL_CODE_MESSAGE =
  "We can't email a sign-in code for this account. Please sign in with your password or with Google."
/** "Forgot password?" for an account that cannot reset one by email. */
export const NO_RESET_MESSAGE =
  "We can't reset the password for this account by email. Please sign in with Google or an email code."

/** The strategy Clerk names on a factor or a verification. */
type HasStrategy = { strategy: string }

/**
 * The custom sign-in form (#379): Clerk's `useSignIn()` flow behind the same
 * markup as the sign-up form, so the two pages are one pair.
 *
 * @remarks
 * **Which step shows** is read from Clerk's sign-in, never kept here, so a
 * reload, or a return from Google that still needs something, lands on the
 * right step (`currentStep`). While a request is in flight the card holds
 * the step it was sent from (`heldStep`), as on sign-up.
 *
 * **The paths** (production, measured 2026-11-18 on #379: email with a
 * password, email with a code, Google; no second factor; Device Trust on):
 * - Email and password: `signIn.password()`.
 * - Email code: `signIn.create({ identifier })`, then
 *   `signIn.emailCode.sendCode()` and `verifyCode()`, offered only when the
 *   account lists `email_code` among its first factors.
 * - Forgot password: `signIn.create({ identifier })`, then Clerk's
 *   reset-by-email-code (`resetPasswordEmailCode`), then the new password,
 *   which signs out the account's other sessions.
 * - Google: `signIn.sso()`, returning to `/sign-in/sso-callback`, where
 *   Clerk's `<HandleSSOCallback />` finishes it.
 * - After any first factor, `proceed()`: a finished sign-in is made active
 *   (`finalize()`); Device Trust (`needs_client_trust`) or a second factor
 *   (`needs_second_factor`) that offers an emailed code sends one
 *   (`signIn.mfa.sendEmailCode()`) and shows the code step; anything else
 *   is a step this form does not have, and says so ({@link
 *   UNSUPPORTED_STEP_MESSAGE}) instead of showing a dead end.
 *
 * **A Google sign-in for an address with no account** is turned into a
 * sign-up by Clerk's callback handler (`signIn.isTransferable`). The account
 * is created with no mailing-list opt-in, so it is never added to the list:
 * the webhook adds a contact only for a literal `true` (#362, fail-closed).
 * The opt-in question is asked only on `/sign-up`.
 *
 * **Where the visitor lands.** `redirect_url` (gated articles and Corvus
 * send it) is honoured only as a path on this site (`safeRedirectPath`);
 * anything else falls back to the home page.
 *
 * @param assignLocation - How to leave for an absolute URL; a seam for tests.
 * @param leaveTimeoutMs - See {@link LEAVE_TIMEOUT_MS}; a seam for tests.
 */
export function SignInForm({
  assignLocation = (url: string) => window.location.assign(url),
  leaveTimeoutMs = LEAVE_TIMEOUT_MS,
}: {
  assignLocation?: (url: string) => void
  leaveTimeoutMs?: number
} = {}) {
  const { signIn, errors } = useSignIn()
  const { resolvedTheme } = useTheme()
  const { redirectTarget, destination } = useRedirectTarget()

  const hasStrategy = (factors: readonly HasStrategy[], strategy: string) =>
    factors.some((factor) => factor.strategy === strategy)

  /** Clerk wants a code after the first factor, and can email one. */
  const needsEmailSecondFactor = () =>
    (signIn.status === 'needs_client_trust' ||
      signIn.status === 'needs_second_factor') &&
    hasStrategy(signIn.supportedSecondFactors ?? [], 'email_code')

  /** The step Clerk's sign-in calls for right now. */
  const currentStep = (): SignInStep => {
    switch (signIn.status) {
      case 'complete':
        return 'finish'
      case 'needs_new_password':
        return 'new-password'
      case 'needs_client_trust':
      case 'needs_second_factor':
        return needsEmailSecondFactor() ? 'second-factor' : 'start'
      case 'needs_first_factor': {
        const strategy = signIn.firstFactorVerification?.strategy
        if (strategy === 'email_code') return 'email-code'
        if (strategy === 'reset_password_email_code') return 'reset-code'
        return 'start'
      }
      default:
        return 'start'
    }
  }
  const [heldStep, setHeldStep] = useState<SignInStep>('start')
  // What this page has seen of the latest code's delivery, so a code step
  // never says one was sent when it was not (as on sign-up, #384).
  const [codeDelivery, setCodeDelivery] = useState<CodeDelivery>('unknown')

  const { busy, run, mounted, localErrors, setLocalErrors, notice, setNotice } =
    useAuthSteps({
      logTag: 'sign-in',
      leaveTimeoutMs,
      onStart: () => setHeldStep(currentStep()),
    })
  const navigate = useFinalizeNavigate({
    destination,
    mounted,
    assignLocation,
  })

  /** Makes the finished sign-in's session active and leaves. */
  const finish = async () => {
    const { error } = await signIn.finalize({ navigate })
    if (error) {
      setLocalErrors([text(error) ?? UNEXPECTED_MESSAGE])
      return
    }
    return { stayLocked: true }
  }

  /**
   * Drops the attempt, keeping `message` on screen. `reset()` also clears
   * Clerk's own errors, which is why the message is kept here.
   */
  const discardAttempt = async (message: string) => {
    // Status and factor names only: nothing the visitor typed.
    console.error('[sign-in] unsupported step', {
      status: signIn.status,
      secondFactors: (signIn.supportedSecondFactors ?? []).map(
        (factor) => factor.strategy,
      ),
    })
    setLocalErrors([message])
    setCodeDelivery('unknown')
    await signIn.reset()
  }

  /** Sends the second-factor code, recording whether it went. */
  const sendSecondFactorCode = async () => {
    const sent = await signIn.mfa.sendEmailCode()
    setCodeDelivery(sent.error ? 'failed' : 'sent')
  }

  /** Takes the sign-in on from wherever a successful step left it. */
  const proceed = async () => {
    if (signIn.status === 'complete') return finish()
    // The reset code was accepted: the new-password step shows.
    if (signIn.status === 'needs_new_password') return
    if (needsEmailSecondFactor()) return sendSecondFactorCode()
    await discardAttempt(UNSUPPORTED_STEP_MESSAGE)
  }

  // At rest on a second step this form has no screen for: a reload, or a
  // return from Google, can land here without a request of this page's
  // making. Say so instead of showing the first step as if nothing were
  // pending, once per attempt.
  const stuck =
    !busy &&
    Boolean(signIn.id) &&
    (signIn.status === 'needs_client_trust' ||
      signIn.status === 'needs_second_factor') &&
    !needsEmailSecondFactor()
  const discardedAttempt = useRef<string>(undefined)
  useEffect(() => {
    if (!stuck || discardedAttempt.current === signIn.id) return
    discardedAttempt.current = signIn.id
    void run(() => discardAttempt(UNSUPPORTED_STEP_MESSAGE))
    // Keyed on the state alone, as sign-up's twin of this is.
  }, [stuck]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = ({ emailAddress, password }: SignInFormValues) =>
    run(async () => {
      const { error } = await signIn.password({ emailAddress, password })
      if (error) return
      return proceed()
    })

  const onEmailCode = (emailAddress: string) =>
    run(async () => {
      const { error } = await signIn.create({ identifier: emailAddress })
      if (error) return
      if (!hasStrategy(signIn.supportedFirstFactors ?? [], 'email_code')) {
        setLocalErrors([NO_EMAIL_CODE_MESSAGE])
        return
      }
      const sent = await signIn.emailCode.sendCode()
      setCodeDelivery(sent.error ? 'failed' : 'sent')
    })

  const onForgotPassword = (emailAddress: string) =>
    run(async () => {
      const { error } = await signIn.create({ identifier: emailAddress })
      if (error) return
      if (
        !hasStrategy(
          signIn.supportedFirstFactors ?? [],
          'reset_password_email_code',
        )
      ) {
        setLocalErrors([NO_RESET_MESSAGE])
        return
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode()
      setCodeDelivery(sent.error ? 'failed' : 'sent')
    })

  const onGoogle = () =>
    run(async () => {
      const { error } = await signIn.sso({
        strategy: 'oauth_google',
        redirectCallbackUrl: withRedirect(
          SIGN_IN_SSO_CALLBACK_PATH,
          redirectTarget,
        ),
        redirectUrl: destination,
      })
      if (error) return
      // No error means the browser is on its way to Google.
      return { stayLocked: true }
    })

  const onVerify = (code: string) =>
    run(async () => {
      const step = currentStep()
      // Called on their objects: clerk-js methods may read `this`.
      const { error } =
        step === 'second-factor'
          ? await signIn.mfa.verifyEmailCode({ code })
          : step === 'reset-code'
            ? await signIn.resetPasswordEmailCode.verifyCode({ code })
            : await signIn.emailCode.verifyCode({ code })
      if (error) return
      return proceed()
    })

  const onResend = () =>
    run(async () => {
      const step = currentStep()
      const { error } =
        step === 'second-factor'
          ? await signIn.mfa.sendEmailCode()
          : step === 'reset-code'
            ? await signIn.resetPasswordEmailCode.sendCode()
            : await signIn.emailCode.sendCode()
      if (error) return
      setCodeDelivery('sent')
      setNotice('A new code is on its way.')
    })

  const onNewPassword = (password: string) =>
    run(async () => {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      })
      if (error) return
      return proceed()
    })

  const onStartOver = () =>
    run(async () => {
      setCodeDelivery('unknown')
      await signIn.reset()
    })

  const onFinish = () => run(finish)

  const formErrors: SignInFormErrors = {
    emailAddress: text(errors.fields.identifier),
    password: text(errors.fields.password),
    code: text(errors.fields.code),
  }
  const global = [
    ...(errors.global ?? []).map((error) => text(error) ?? UNEXPECTED_MESSAGE),
    ...localErrors,
  ]
  if (global.length) formErrors.global = global

  return (
    <SignInFormView
      step={busy ? heldStep : currentStep()}
      pending={busy}
      errors={formErrors}
      passwordMinLength={PASSWORD_MIN_LENGTH}
      signUpHref={withRedirect(SIGN_UP_PATH, redirectTarget)}
      captchaTheme={
        resolvedTheme === 'dark' || resolvedTheme === 'light'
          ? resolvedTheme
          : undefined
      }
      email={signIn.identifier ?? undefined}
      codeDelivery={codeDelivery}
      secondFactorReason={
        signIn.status === 'needs_second_factor' ? 'second-factor' : 'new-device'
      }
      notice={notice}
      onSubmit={onSubmit}
      onGoogle={onGoogle}
      onEmailCode={onEmailCode}
      onForgotPassword={onForgotPassword}
      onVerify={onVerify}
      onResend={onResend}
      onStartOver={onStartOver}
      onNewPassword={onNewPassword}
      onFinish={onFinish}
    />
  )
}
