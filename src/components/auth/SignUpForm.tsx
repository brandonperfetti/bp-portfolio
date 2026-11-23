'use client'

import { useEffect, useRef, useState } from 'react'

import { useSignUp } from '@clerk/nextjs'
import { useTheme } from 'next-themes'

import { withRedirect } from '@/lib/auth/safeRedirect'
import { MAILING_LIST_OPT_IN_KEY } from '@/lib/email/mailingListOptIn'

import { SIGN_IN_PATH, SIGN_UP_SSO_CALLBACK_PATH } from './paths'

import {
  SignUpFormView,
  type SignUpCodeDelivery,
  type SignUpFormErrors,
  type SignUpFormValues,
  type SignUpFormViewProps,
} from './SignUpFormView'
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

const UNFINISHED_MESSAGE =
  "We couldn't finish creating your account here. Please try again, or sign up with Google."
/**
 * For a sign-up that came back from Google still needing something this form
 * has no field for. It does not point at Google again: that is the route
 * that has just not finished.
 */
const UNFINISHED_GOOGLE_MESSAGE =
  "We couldn't finish creating your account with Google here. Please try again, or sign up with your email and a password."
/** The sign-up fields the first step has inputs for, in Clerk's names. */
const COLLECTED_FIELDS: readonly string[] = ['email_address', 'password']

/**
 * The custom sign-up form (#377): Clerk's `useSignUp()` flow behind this
 * site's own markup, so the mailing-list opt-in is a field of the form.
 *
 * @remarks
 * **How the tick travels.** `SignUpFormView` reads the box at the moment of
 * submit and hands it here as a boolean. It goes to Clerk as
 * `unsafeMetadata` on the one request that starts the sign-up:
 * `signUp.password()` for email and password, `signUp.sso()` for Google.
 * Clerk keeps it on the sign-up (across the trip to Google too) and copies it
 * to the user it creates, so `user.created` carries it as `unsafe_metadata`
 * and the webhook's rule is unchanged: a contact only for a literal `true`
 * (`hasMailingListOptIn`, #362). An unticked box sends an explicit `false`.
 *
 * **Why a tick changed mid-submit cannot be sent.** The value is copied into
 * the call's arguments in the same event as the click. `busy` is set in that
 * same event, which disables the whole form until Clerk answers, and
 * `inFlight` refuses a second request beside the first. On an error the form
 * unlocks and the next submit reads the box again (and if the failed request
 * was an update to an earlier attempt, that attempt is discarded, so the
 * retry is a new one: `discardAttempt`). On success the box is gone:
 * the email path moves to the code step, the Google path leaves the page.
 * "Use a different email" discards the attempt (`signUp.reset()`), so its
 * tick does not outlive it.
 *
 * **Which step shows** is read from Clerk's sign-up, so a reload on the
 * code step stays on the code step. The one thing kept here is `heldStep`:
 * while a request is in flight the card shows the step it was sent from. A
 * sign-up Clerk has completed without the visitor being signed in yet
 * (`finalize()` returned an error, the navigation after it never happened,
 * or the page was reloaded in between) shows the `finish` step, which calls
 * `finalize()` and nothing else; the first step there would start a second
 * sign-up for an address that now has an account.
 *
 * **A sign-up back from Google that this form cannot finish** (#384). When a
 * sign-up requirement is switched on in the Clerk dashboard that the form
 * has no field for, a Google sign-up returns with the Google account
 * verified and a field still missing. Clerk's callback handler sends the
 * visitor nowhere for it, and they reach this form again by "Start again"
 * or by the address. The first step with no message would be a loop:
 * "Continue with Google" updates the same attempt and comes back the same
 * way. So the form says it could not finish, logs
 * `[sign-up] unsupported requirement`, and discards the attempt, as the
 * email route does for the same state. An attempt missing only the email
 * or the password is kept: the first step collects those, and its submit
 * updates the attempt. A Google trip the visitor abandoned
 * is not this: Google has verified nothing there, and the first step shows
 * as before.
 *
 * **Still fail-closed:** a Google sign-up that turns out to be an existing
 * account is signed in by the callback page and the list is not touched; an
 * account created from `/sign-in` or the Clerk dashboard never passes this
 * form and has no opt-in.
 *
 * **Where the new member lands.** `redirect_url` (gated articles and Corvus
 * send it by way of `/sign-in`) is honoured only as a path on this site
 * (`safeRedirectPath`); anything else falls back to the home page.
 *
 * @param assignLocation - How to leave for an absolute URL; a seam for tests.
 * @param leaveTimeoutMs - See {@link LEAVE_TIMEOUT_MS}; a seam for
 *   tests.
 */
export function SignUpForm({
  assignLocation = (url: string) => window.location.assign(url),
  leaveTimeoutMs = LEAVE_TIMEOUT_MS,
}: {
  assignLocation?: (url: string) => void
  leaveTimeoutMs?: number
} = {}) {
  const { signUp, errors } = useSignUp()
  const { resolvedTheme } = useTheme()
  const { redirectTarget, destination } = useRedirectTarget()

  /**
   * Whether the code step can finish this sign-up: the email is the only
   * thing left to verify. A sign-up that also wants a phone verified (a
   * dashboard setting) would end, after the code, on a dead end, so it is
   * treated like any other requirement this form has no step for (#386).
   */
  const needsEmailCode = () =>
    signUp.status === 'missing_requirements' &&
    signUp.missingFields.length === 0 &&
    signUp.unverifiedFields.length > 0 &&
    signUp.unverifiedFields.every((field) => field === 'email_address')

  /**
   * The message for a sign-up this form cannot finish. One that came by
   * Google is not pointed back at Google: that route has just not finished.
   */
  const unfinishedMessage = () =>
    signUp.verifications.externalAccount?.status === 'verified'
      ? UNFINISHED_GOOGLE_MESSAGE
      : UNFINISHED_MESSAGE

  /** The step Clerk's sign-up calls for right now. */
  const currentStep = (): SignUpFormViewProps['step'] => {
    if (needsEmailCode()) return 'verify'
    // The account exists and only the sign-in is left.
    if (signUp.status === 'complete') return 'finish'
    return 'start'
  }
  // While a request is in flight the card keeps showing the step it was
  // sent from: Clerk's sign-up passes through other states on the way (the
  // code step while the code is still being sent, `complete` before the
  // navigation), and none of them should flash by.
  const [heldStep, setHeldStep] = useState<SignUpFormViewProps['step']>('start')
  // What this page has seen of the code's delivery, so the code step never
  // says one was sent when it was not. `unknown` until a send is made here:
  // a reload on the code step, or a return from Google with only the email
  // left to verify, arrives without this page having sent anything.
  const [codeDelivery, setCodeDelivery] =
    useState<SignUpCodeDelivery>('unknown')

  // The lock around each request (`useAuthSteps`), holding the step it was
  // sent from while it is in flight.
  const { busy, run, mounted, localErrors, setLocalErrors, notice, setNotice } =
    useAuthSteps({
      logTag: 'sign-up',
      leaveTimeoutMs,
      onStart: () => setHeldStep(currentStep()),
    })
  const { navigate, blockedTask } = useFinalizeNavigate({
    destination,
    mounted,
    assignLocation,
    logTag: 'sign-up',
  })

  /** Signs the visitor in to the account Clerk has just created. */
  const finish = async () => {
    // `navigate` does nothing for a visitor who has already gone somewhere
    // else (the header, the Back button): they are signed in either way.
    const { error } = await signUp.finalize({ navigate })
    if (error) {
      setLocalErrors([text(error) ?? UNEXPECTED_MESSAGE])
      return
    }
    if (blockedTask.current) {
      setLocalErrors([SESSION_TASK_MESSAGE])
      return
    }
    // Signed in, and on the way to the destination.
    return { stayLocked: true }
  }

  /**
   * Discards Clerk's current attempt, keeping `message` on screen.
   *
   * clerk-js sends a submit as an UPDATE to an attempt that already exists
   * (an earlier submit, or a trip to Google that was abandoned). When such an
   * update fails, or leaves the attempt somewhere this form cannot take it,
   * every retry would update the same stuck attempt. Discarding it makes the
   * next submit a new attempt. `reset()` is local and also clears Clerk's
   * own error state, which is why the message is kept here instead.
   */
  const discardAttempt = async (message: string) => {
    setLocalErrors([message])
    setCodeDelivery('unknown')
    await signUp.reset()
  }

  // Back from Google with the Google account verified, and Clerk still wants
  // something this form cannot collect (see the remarks above). Read at
  // rest only: the email route handles its own case inside its request.
  const stuckAfterGoogle =
    !busy &&
    Boolean(signUp.id) &&
    signUp.status === 'missing_requirements' &&
    signUp.verifications.externalAccount?.status === 'verified' &&
    // A bot check Clerk is still running, or has failed, has its own
    // message; this one would be shown in its place.
    !signUp.protectCheck &&
    !needsEmailCode() &&
    // Missing only what the first step asks for: the visitor can still
    // finish this attempt by filling it in, so it is not discarded.
    !(
      signUp.missingFields.length > 0 &&
      signUp.missingFields.every((field) => COLLECTED_FIELDS.includes(field))
    )
  // One discard per attempt: `reset()` clears it, and this keeps a reset
  // that did not from being asked for again on every render.
  const discardedAttempt = useRef<string>(undefined)
  useEffect(() => {
    if (!stuckAfterGoogle || discardedAttempt.current === signUp.id) return
    discardedAttempt.current = signUp.id
    // Field names only: nothing the visitor typed.
    console.error('[sign-up] unsupported requirement', {
      status: signUp.status,
      missingFields: signUp.missingFields,
      unverifiedFields: signUp.unverifiedFields,
    })
    void run(() => discardAttempt(UNFINISHED_GOOGLE_MESSAGE))
    // Keyed on the state alone: `run` and `discardAttempt` are new on every
    // render and read nothing that this state does not already cover.
  }, [stuckAfterGoogle]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = ({
    emailAddress,
    password,
    mailingListOptIn,
  }: SignUpFormValues) =>
    run(async () => {
      const hadAttempt = Boolean(signUp.id)
      const { error } = await signUp.password({
        emailAddress,
        password,
        unsafeMetadata: { [MAILING_LIST_OPT_IN_KEY]: mailingListOptIn },
      })
      if (error) {
        if (hadAttempt) await discardAttempt(text(error) ?? UNEXPECTED_MESSAGE)
        return
      }
      if (signUp.status === 'complete') return finish()
      if (!needsEmailCode()) {
        // The instance asks for something this form has no field or step
        // for (a dashboard setting changed: a field, or a phone to verify
        // beside the email, #386). Say so instead of showing a dead end.
        console.error('[sign-up] unsupported requirement', {
          status: signUp.status,
          missingFields: signUp.missingFields,
          unverifiedFields: signUp.unverifiedFields,
        })
        await discardAttempt(UNFINISHED_MESSAGE)
        return
      }
      // The card moves to the code step either way, because Clerk's
      // sign-up now calls for a code. If this send failed, no code is on
      // its way and the step has to say so (#384); Clerk's own message
      // shows there too, and "Send a new code" is the way forward.
      const sent = await signUp.verifications.sendEmailCode()
      setCodeDelivery(sent.error ? 'failed' : 'sent')
    })

  const onGoogle = ({
    mailingListOptIn,
  }: Pick<SignUpFormValues, 'mailingListOptIn'>) =>
    run(async () => {
      const hadAttempt = Boolean(signUp.id)
      const { error } = await signUp.sso({
        strategy: 'oauth_google',
        redirectCallbackUrl: withRedirect(
          SIGN_UP_SSO_CALLBACK_PATH,
          redirectTarget,
        ),
        redirectUrl: destination,
        unsafeMetadata: { [MAILING_LIST_OPT_IN_KEY]: mailingListOptIn },
      })
      if (error) {
        if (hadAttempt) await discardAttempt(text(error) ?? UNEXPECTED_MESSAGE)
        return
      }
      // No error means the browser is on its way to Google.
      return { stayLocked: true }
    })

  const onVerify = (code: string) =>
    run(async () => {
      const { error } = await signUp.verifications.verifyEmailCode({ code })
      if (error) return
      if (signUp.status === 'complete') return finish()
      await discardAttempt(unfinishedMessage())
    })

  const onResend = () =>
    run(async () => {
      const { error } = await signUp.verifications.sendEmailCode()
      if (error) return
      setCodeDelivery('sent')
      setNotice('A new code is on its way.')
    })

  const onFinish = () => run(finish)

  const onUseDifferentEmail = () =>
    run(async () => {
      setCodeDelivery('unknown')
      await signUp.reset()
    })

  const captchaError = text(errors.fields.captcha)
  const global = [
    ...(errors.global ?? []).map((error) => text(error) ?? UNEXPECTED_MESSAGE),
    ...(captchaError ? [captchaError] : []),
    ...localErrors,
  ]
  const formErrors: SignUpFormErrors = {
    emailAddress: text(errors.fields.emailAddress),
    password: text(errors.fields.password),
    code: text(errors.fields.code),
    global: global.length ? global : undefined,
  }

  return (
    <SignUpFormView
      step={busy ? heldStep : currentStep()}
      pending={busy}
      errors={formErrors}
      passwordMinLength={PASSWORD_MIN_LENGTH}
      signInHref={withRedirect(SIGN_IN_PATH, redirectTarget)}
      captchaTheme={
        resolvedTheme === 'dark' || resolvedTheme === 'light'
          ? resolvedTheme
          : undefined
      }
      verifyEmail={signUp.emailAddress ?? undefined}
      codeDelivery={codeDelivery}
      notice={notice}
      onSubmit={onSubmit}
      onGoogle={onGoogle}
      onVerify={onVerify}
      onResend={onResend}
      onUseDifferentEmail={onUseDifferentEmail}
      onFinish={onFinish}
    />
  )
}
