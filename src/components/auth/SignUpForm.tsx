'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useSignUp } from '@clerk/nextjs'
import { useTheme } from 'next-themes'

import { safeRedirectPath, withRedirect } from '@/lib/auth/safeRedirect'
import { MAILING_LIST_OPT_IN_KEY } from '@/lib/email/mailingListOptIn'

import {
  SignUpFormView,
  type SignUpFormErrors,
  type SignUpFormValues,
} from './SignUpFormView'

/** The sign-up route. */
export const SIGN_UP_PATH = '/sign-up'
/** The page Google returns to (`sign-up/sso-callback/page.tsx`). */
export const SIGN_UP_SSO_CALLBACK_PATH = '/sign-up/sso-callback'
/** The sign-in route, still Clerk's prebuilt form. */
export const SIGN_IN_PATH = '/sign-in'

/**
 * Clerk's password minimum, for the hint under the field.
 *
 * @remarks Hardcoded: `useSignUp()` and the public `Clerk` object expose no
 * instance settings, so the dashboard value cannot be read here (Brandon's
 * decision 4 on #377: read it if the hook exposes it, otherwise hardcode and
 * say so). 15 is production's setting, measured 2026-11-18 from Clerk's
 * public environment endpoint. If the dashboard value changes, change this;
 * until then a too-short password is still refused by Clerk, whose message
 * shows under the field.
 */
export const PASSWORD_MIN_LENGTH = 15

/**
 * How long the form stays locked after Clerk accepts a Google sign-up without
 * the browser having left for Google.
 *
 * @remarks Leaving normally takes well under a second. If the page is still
 * here after this long, the hand-off did not happen, and a form locked for
 * good would be a dead end; it unlocks so the visitor can try again.
 */
export const SSO_HAND_OFF_TIMEOUT_MS = 10_000

const UNFINISHED_MESSAGE =
  "We couldn't finish creating your account here. Please try again, or sign up with Google."
const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.'

type Message = { message: string; longMessage?: string } | null | undefined

const text = (error: Message): string | undefined =>
  error ? (error.longMessage ?? error.message) : undefined

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
 * unlocks and the next submit reads the box again. On success the box is gone:
 * the email path moves to the code step, the Google path leaves the page.
 * "Use a different email" discards the attempt (`signUp.reset()`), so its
 * tick does not outlive it.
 *
 * **Which step shows** is read from Clerk's sign-up, not kept here, so a
 * reload on the code step stays on the code step.
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
 * @param ssoHandOffTimeoutMs - See {@link SSO_HAND_OFF_TIMEOUT_MS}; a seam for
 *   tests.
 */
export function SignUpForm({
  assignLocation = (url: string) => window.location.assign(url),
  ssoHandOffTimeoutMs = SSO_HAND_OFF_TIMEOUT_MS,
}: {
  assignLocation?: (url: string) => void
  ssoHandOffTimeoutMs?: number
} = {}) {
  const { signUp, errors } = useSignUp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolvedTheme } = useTheme()

  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const handOffTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(handOffTimer.current), [])
  const [localErrors, setLocalErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string>()
  // Unknown until mounted: the server render accepts a path only, and a
  // same-origin absolute `redirect_url` is accepted once the origin is known.
  const [origin, setOrigin] = useState<string>()
  useEffect(() => setOrigin(window.location.origin), [])

  // Leaving for Google keeps the form locked. If the visitor comes back with
  // the Back button, the browser may restore this page exactly as it was
  // left, locked; unlock it so they can choose again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      clearTimeout(handOffTimer.current)
      inFlight.current = false
      setBusy(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const redirectTarget = safeRedirectPath(
    searchParams.get('redirect_url'),
    origin,
  )
  const destination = redirectTarget ?? '/'

  /**
   * Runs one Clerk step with the form locked. `stayLocked` is for the step
   * that ends by leaving the page.
   */
  const run = useCallback(
    async (step: () => Promise<{ stayLocked?: boolean } | void>) => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)
      setLocalErrors([])
      setNotice(undefined)
      let stayLocked = false
      try {
        stayLocked = (await step())?.stayLocked ?? false
      } catch (error) {
        console.error('[sign-up] unexpected failure', error)
        setLocalErrors([UNEXPECTED_MESSAGE])
      } finally {
        if (!stayLocked) {
          inFlight.current = false
          setBusy(false)
        }
      }
    },
    [],
  )

  const finish = useCallback(async () => {
    const { error } = await signUp.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl(destination)
        if (url.startsWith('http')) assignLocation(url)
        else router.push(url)
      },
    })
    if (error) setLocalErrors([text(error) ?? UNEXPECTED_MESSAGE])
  }, [assignLocation, destination, router, signUp])

  const needsEmailCode = () =>
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0

  const onSubmit = ({
    emailAddress,
    password,
    mailingListOptIn,
  }: SignUpFormValues) =>
    run(async () => {
      const { error } = await signUp.password({
        emailAddress,
        password,
        unsafeMetadata: { [MAILING_LIST_OPT_IN_KEY]: mailingListOptIn },
      })
      if (error) return
      if (signUp.status === 'complete') return finish()
      if (!needsEmailCode()) {
        // The instance asks for something this form has no field for (a
        // dashboard setting changed). Say so instead of showing a dead end.
        console.error('[sign-up] unsupported requirement', {
          status: signUp.status,
          missingFields: signUp.missingFields,
          unverifiedFields: signUp.unverifiedFields,
        })
        setLocalErrors([UNFINISHED_MESSAGE])
        return
      }
      await signUp.verifications.sendEmailCode()
    })

  const onGoogle = ({
    mailingListOptIn,
  }: Pick<SignUpFormValues, 'mailingListOptIn'>) =>
    run(async () => {
      const { error } = await signUp.sso({
        strategy: 'oauth_google',
        redirectCallbackUrl: withRedirect(
          SIGN_UP_SSO_CALLBACK_PATH,
          redirectTarget,
        ),
        redirectUrl: destination,
        unsafeMetadata: { [MAILING_LIST_OPT_IN_KEY]: mailingListOptIn },
      })
      if (error) return
      // No error means the browser is on its way to Google: stay locked, so
      // nothing can be changed or sent again behind the redirect. If the page
      // is somehow still here after the timeout, unlock instead of stranding
      // the visitor on a disabled form.
      handOffTimer.current = setTimeout(() => {
        inFlight.current = false
        setBusy(false)
        setLocalErrors([UNEXPECTED_MESSAGE])
      }, ssoHandOffTimeoutMs)
      return { stayLocked: true }
    })

  const onVerify = (code: string) =>
    run(async () => {
      const { error } = await signUp.verifications.verifyEmailCode({ code })
      if (error) return
      if (signUp.status === 'complete') return finish()
      setLocalErrors([UNFINISHED_MESSAGE])
    })

  const onResend = () =>
    run(async () => {
      const { error } = await signUp.verifications.sendEmailCode()
      if (!error) setNotice('A new code is on its way.')
    })

  const onUseDifferentEmail = () =>
    run(async () => {
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
      step={needsEmailCode() ? 'verify' : 'start'}
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
      notice={notice}
      onSubmit={onSubmit}
      onGoogle={onGoogle}
      onVerify={onVerify}
      onResend={onResend}
      onUseDifferentEmail={onUseDifferentEmail}
    />
  )
}
