'use client'

import { useEffect, useRef, useState } from 'react'

import { useSignIn } from '@clerk/nextjs'
import { useTheme } from 'next-themes'

import { withRedirect } from '@/lib/auth/safeRedirect'
import {
  DEFAULT_SOCIAL_PROVIDERS,
  SOCIAL_PROVIDERS,
  socialProviderNames,
  type SocialProvider,
} from '@/lib/auth/socialProviders'

import type { CodeDelivery } from './AuthFormParts'
import { SIGN_IN_SSO_CALLBACK_PATH, SIGN_UP_PATH } from './paths'
import {
  SignInFormView,
  type SignInFormErrors,
  type SignInFormValues,
  type SignInStep,
} from './SignInFormView'
import {
  errorText as text,
  LEAVE_TIMEOUT_MS,
  PASSWORD_MIN_LENGTH,
  SESSION_TASK_MESSAGE,
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
/**
 * "Email me a sign-in code" for an account that cannot have one, naming the
 * social connections on offer.
 *
 * @param providers - The connections the form offers.
 */
export const noEmailCodeMessage = (providers: readonly SocialProvider[]) =>
  `We can't email a sign-in code for this account. Please sign in with your password or with ${socialProviderNames(providers)}.`
/**
 * "Forgot password?" for an account that cannot reset one by email, naming
 * the social connections on offer.
 *
 * @param providers - The connections the form offers.
 */
export const noResetMessage = (providers: readonly SocialProvider[]) =>
  `We can't reset the password for this account by email. Please sign in with ${socialProviderNames(providers)} or an email code.`
/** {@link noEmailCodeMessage} for Google alone, the form's default. */
export const NO_EMAIL_CODE_MESSAGE = noEmailCodeMessage(
  DEFAULT_SOCIAL_PROVIDERS,
)
/** {@link noResetMessage} for Google alone, the form's default. */
export const NO_RESET_MESSAGE = noResetMessage(DEFAULT_SOCIAL_PROVIDERS)

/** The strategy Clerk names on a factor or a verification. */
type HasStrategy = { strategy: string }

/**
 * The custom sign-in form (#379): Clerk's `useSignIn()` flow behind the same
 * markup as the sign-up form, so the two pages are one pair.
 *
 * @remarks
 * **Which step shows** is read from Clerk's sign-in, never kept here, so a
 * reload, or a return from Google or GitHub that still needs something,
 * lands on the right step (`currentStep`). While a request is in flight the
 * card holds the step it was sent from (`heldStep`), as on sign-up.
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
 * - Google, and GitHub where it is on (#431): `signIn.sso()` with that
 *   connection's strategy, returning to `/sign-in/sso-callback`, where
 *   Clerk's `<HandleSSOCallback />` finishes it. Always a new attempt (see
 *   `onSocial`), so a trip to one connection the visitor abandoned, or a
 *   refused emailed code, never carries into the next.
 * - After any first factor, `proceed()`: a finished sign-in is made active
 *   (`finalize()`); Device Trust (`needs_client_trust`) or a second factor
 *   (`needs_second_factor`) that offers an emailed code sends one
 *   (`signIn.mfa.sendEmailCode()`) and shows the code step; anything else
 *   is a step this form does not have, and says so ({@link
 *   UNSUPPORTED_STEP_MESSAGE}) instead of showing a dead end.
 *
 * **A Google or GitHub sign-in for an account that does not exist** is
 * turned into a sign-up by Clerk's callback handler (`signIn.isTransferable`). The account
 * is created with no mailing-list opt-in, so it is never added to the list:
 * the webhook adds a contact only for a literal `true` (#362, fail-closed).
 * The opt-in question is asked only on `/sign-up`.
 *
 * **Where the visitor lands.** `redirect_url` (gated articles and Corvus
 * send it) is honoured only as a path on this site (`safeRedirectPath`);
 * anything else falls back to the home page.
 *
 * @param providers - The social connections to offer, in order; the page
 *   reads them from the environment (`enabledSocialProviders`).
 * @param assignLocation - How to leave for an absolute URL; a seam for tests.
 * @param leaveTimeoutMs - See {@link LEAVE_TIMEOUT_MS}; a seam for tests.
 */
export function SignInForm({
  providers = DEFAULT_SOCIAL_PROVIDERS,
  assignLocation = (url: string) => window.location.assign(url),
  leaveTimeoutMs = LEAVE_TIMEOUT_MS,
}: {
  providers?: readonly SocialProvider[]
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
  // Delivery for this challenge only. Clerk can move to another challenge
  // while the page is restored, even if we discard the old request's result.
  const [delivery, setDelivery] = useState<{
    attemptId: typeof signIn.id
    step: SignInStep
    status: Exclude<CodeDelivery, 'unknown'>
  }>()
  // A social sign-in waiting for the reset of an earlier attempt to settle,
  // so it starts on the replacement resource (`onSocial`).
  const [socialAfterReset, setSocialAfterReset] = useState<{
    provider: SocialProvider
    isCurrent: () => boolean
    discarded: typeof signIn
  } | null>(null)

  const { busy, run, localErrors, setLocalErrors, notice, setNotice } =
    useAuthSteps({
      logTag: 'sign-in',
      leaveTimeoutMs,
      onStart: () => setHeldStep(currentStep()),
    })
  const pending = busy || socialAfterReset !== null
  const step = pending ? heldStep : currentStep()
  const codeDelivery =
    delivery?.step === step && delivery.attemptId === signIn.id
      ? delivery.status
      : 'unknown'
  const recordDelivery = (
    step: SignInStep,
    status: Exclude<CodeDelivery, 'unknown'>,
  ) => setDelivery({ attemptId: signIn.id, step, status })
  const navigate = useFinalizeNavigate({
    destination,
    assignLocation,
    logTag: 'sign-in',
  })

  /** Makes the finished sign-in's session active and leaves. */
  const finish = async (isCurrent: () => boolean) => {
    let blockedTask: string | undefined
    const { error } = await signIn.finalize({
      navigate: (params) => {
        if (isCurrent()) blockedTask = navigate(params)
      },
    })
    if (!isCurrent()) return
    if (error) {
      setLocalErrors([text(error) ?? UNEXPECTED_MESSAGE])
      return
    }
    if (blockedTask) {
      setLocalErrors([SESSION_TASK_MESSAGE])
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
    setDelivery(undefined)
    await signIn.reset()
  }

  /** Sends the second-factor code, recording whether it went. */
  const sendSecondFactorCode = async (isCurrent: () => boolean) => {
    try {
      const sent = await signIn.mfa.sendEmailCode()
      if (isCurrent())
        recordDelivery('second-factor', sent.error ? 'failed' : 'sent')
    } catch (error) {
      // An earlier challenge's successful send does not apply to this code.
      if (isCurrent()) recordDelivery('second-factor', 'failed')
      throw error
    }
  }

  /** Takes the sign-in on from wherever a successful step left it. */
  const proceed = async (isCurrent: () => boolean) => {
    if (signIn.status === 'complete') return finish(isCurrent)
    // The reset code was accepted: the new-password step shows.
    if (signIn.status === 'needs_new_password') return
    if (needsEmailSecondFactor()) return sendSecondFactorCode(isCurrent)
    await discardAttempt(UNSUPPORTED_STEP_MESSAGE)
  }

  // At rest on a second step this form has no screen for: a reload, or a
  // return from Google or GitHub, can land here without a request of this page's
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

  // At rest on the second-factor step with no code sent by this page: a
  // return from Google or GitHub that needs the new-device code (`SsoCallback` sends
  // it here), or a reload. Send one, as the password path does, once per
  // attempt, so the visitor is not asked to press "Send a new code" first.
  const awaitingUnsentCode =
    !busy &&
    Boolean(signIn.id) &&
    codeDelivery === 'unknown' &&
    needsEmailSecondFactor()
  const autoSentAttempt = useRef<string>(undefined)
  useEffect(() => {
    if (!awaitingUnsentCode || autoSentAttempt.current === signIn.id) return
    autoSentAttempt.current = signIn.id
    void run(sendSecondFactorCode)
  }, [awaitingUnsentCode]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = ({ emailAddress, password }: SignInFormValues) =>
    run(async (isCurrent) => {
      const identifier = emailAddress.trim()
      if (!identifier) {
        setLocalErrors(['Enter your email address.'])
        return
      }
      const { error } = await signIn.password({
        emailAddress: identifier,
        password,
      })
      if (!isCurrent() || error) return
      return proceed(isCurrent)
    })

  const onEmailCode = (emailAddress: string) =>
    run(async (isCurrent) => {
      const { error } = await signIn.create({ identifier: emailAddress })
      if (!isCurrent() || error) return
      if (!hasStrategy(signIn.supportedFirstFactors ?? [], 'email_code')) {
        setLocalErrors([noEmailCodeMessage(providers)])
        return
      }
      const sent = await signIn.emailCode.sendCode()
      if (!isCurrent()) return
      recordDelivery('email-code', sent.error ? 'failed' : 'sent')
    })

  const onForgotPassword = (emailAddress: string) =>
    run(async (isCurrent) => {
      const { error } = await signIn.create({ identifier: emailAddress })
      if (!isCurrent() || error) return
      if (
        !hasStrategy(
          signIn.supportedFirstFactors ?? [],
          'reset_password_email_code',
        )
      ) {
        setLocalErrors([noResetMessage(providers)])
        return
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode()
      if (!isCurrent()) return
      recordDelivery('reset-code', sent.error ? 'failed' : 'sent')
    })

  const startSocial = (provider: SocialProvider) =>
    run(async (isCurrent) => {
      const { error } = await signIn.sso({
        strategy: SOCIAL_PROVIDERS[provider].strategy,
        redirectCallbackUrl: withRedirect(
          SIGN_IN_SSO_CALLBACK_PATH,
          redirectTarget,
        ),
        redirectUrl: destination,
      })
      if (!isCurrent() || error) return
      // Clerk hands off to the connection through this URL. Without it the
      // page is going nowhere, and a locked form would be a dead end.
      if (!signIn.firstFactorVerification?.externalVerificationRedirectURL) {
        console.error(
          `[sign-in] ${SOCIAL_PROVIDERS[provider].label} did not start`,
          { status: signIn.status },
        )
        setLocalErrors([UNEXPECTED_MESSAGE])
        return
      }
      return { stayLocked: true }
    })

  /**
   * A social button. Any attempt already here is dropped first, whichever
   * way it was started: a refused emailed code, or a trip to Google or
   * GitHub the visitor abandoned. Clerk replaces the resource on reset; the
   * old resource keeps its ID, so calling sso() on it would reuse the
   * attempt and can skip the redirect.
   */
  const onSocial = (provider: SocialProvider) => {
    if (!signIn.id) return startSocial(provider)
    return run(async (isCurrent) => {
      const { error } = await signIn.reset()
      if (isCurrent() && !error)
        setSocialAfterReset({ provider, isCurrent, discarded: signIn })
    })
  }

  useEffect(() => {
    if (busy || !socialAfterReset) return
    setSocialAfterReset(null)
    if (!socialAfterReset.isCurrent()) return
    if (signIn === socialAfterReset.discarded || signIn.id) {
      setLocalErrors([UNEXPECTED_MESSAGE])
      return
    }
    void startSocial(socialAfterReset.provider)
    // The idle render reads the replacement resource from Clerk's hook.
  }, [busy, socialAfterReset, signIn]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The Clerk calls behind each code step. Called on their objects, never
   * detached: clerk-js methods may read `this`.
   */
  const codeCalls = () => {
    switch (currentStep()) {
      case 'second-factor':
        return {
          send: () => signIn.mfa.sendEmailCode(),
          verify: (code: string) => signIn.mfa.verifyEmailCode({ code }),
        }
      case 'reset-code':
        return {
          send: () => signIn.resetPasswordEmailCode.sendCode(),
          verify: (code: string) =>
            signIn.resetPasswordEmailCode.verifyCode({ code }),
        }
      default:
        return {
          send: () => signIn.emailCode.sendCode(),
          verify: (code: string) => signIn.emailCode.verifyCode({ code }),
        }
    }
  }

  const onVerify = (code: string) =>
    run(async (isCurrent) => {
      const { error } = await codeCalls().verify(code)
      if (!isCurrent() || error) return
      return proceed(isCurrent)
    })

  const onResend = () =>
    run(async (isCurrent) => {
      const step = currentStep()
      const { error } = await codeCalls().send()
      if (!isCurrent() || error) return
      recordDelivery(step, 'sent')
      setNotice('A new code is on its way.')
    })

  const onNewPassword = (password: string) =>
    run(async (isCurrent) => {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      })
      if (!isCurrent() || error) return
      return proceed(isCurrent)
    })

  const onStartOver = () =>
    run(async () => {
      setDelivery(undefined)
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
      step={step}
      pending={pending}
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
      providers={providers}
      onSocial={onSocial}
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
