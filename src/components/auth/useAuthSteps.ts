'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { safeRedirectPath } from '@/lib/auth/safeRedirect'

/**
 * How long a form stays locked after a step that should end by leaving the
 * page (the redirect to Google, the navigation after signing in) without the
 * page having gone.
 *
 * @remarks Leaving normally takes well under a second. If the page is still
 * here after this long, a form locked for good would be a dead end; it
 * unlocks and says it is taking long, so the visitor can act. It does not
 * say anything failed: the timer only knows the page is still here.
 */
export const LEAVE_TIMEOUT_MS = 10_000

/**
 * Clerk's password minimum, for the hint under the field on sign-up and
 * on sign-in's new-password step.
 *
 * @remarks Hardcoded: `useSignUp()`, `useSignIn()` and the public `Clerk` object expose no
 * instance settings, so the dashboard value cannot be read here (Brandon's
 * decision 4 on #377: read it if the hook exposes it, otherwise hardcode and
 * say so). 15 is production's setting, measured 2026-11-18 from Clerk's
 * public environment endpoint. If the dashboard value changes, change this;
 * until then a too-short password is still refused by Clerk, whose message
 * shows under the field.
 */
export const PASSWORD_MIN_LENGTH = 15

/** For any failure Clerk gave no words for. */
export const UNEXPECTED_MESSAGE = 'Something went wrong. Please try again.'
/** For a navigation that has not happened yet: nothing is known to have failed. */
export const SLOW_MESSAGE = 'This is taking longer than expected.'

/** A Clerk error, or the absence of one. */
export type ClerkMessage =
  { message: string; longMessage?: string } | null | undefined

/** The words to show for a Clerk error: its long message when it has one. */
export const errorText = (error: ClerkMessage): string | undefined =>
  error ? (error.longMessage ?? error.message) : undefined

/** What a step tells the runner when it settles. */
export type StepOutcome = { stayLocked?: boolean } | void

/**
 * The lock both custom auth forms (#377 sign-up, #379 sign-in) put around
 * each Clerk request.
 *
 * @remarks
 * - **One request at a time.** `run` refuses a step while another is in
 *   flight (`inFlight`, a ref, so two clicks in the same event cannot both
 *   pass) and sets `busy`, which the views use to disable the whole form.
 * - **`stayLocked`** is for a step that ends by leaving the page: the lock
 *   holds so nothing can be changed or sent again behind the navigation, and
 *   is released after `leaveTimeoutMs` with {@link SLOW_MESSAGE} if the page
 *   is somehow still here. No timer is armed after unmount.
 * - **Back from Google.** A browser may restore the page exactly as it was
 *   left, locked. A restore (`pageshow` with `persisted`) unlocks it so the
 *   visitor can choose again; it unlocks whatever the lock was for, which
 *   favours recovery over a form that could stay locked for good (#384).
 * - **A step that throws** is logged under `logTag` and shown as
 *   {@link UNEXPECTED_MESSAGE}; Clerk's own errors come back as values and
 *   are the caller's to show.
 *
 * @param options - `logTag`: The prefix of the console line, such as `sign-in`.
 *   `leaveTimeoutMs`: See {@link LEAVE_TIMEOUT_MS}.
 *   `onStart`: Called as a step starts, before the lock shows;
 *   the forms use it to hold the step the request was sent from.
 * @returns The lock state, the messages this side of Clerk owns, `run`, and
 *   `mounted` for a navigation callback to check.
 */
export function useAuthSteps({
  logTag,
  leaveTimeoutMs = LEAVE_TIMEOUT_MS,
  onStart,
}: {
  logTag: string
  leaveTimeoutMs?: number
  onStart?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // A Clerk call can settle after the page has gone; `run` must not arm a
  // timer then, since this cleanup has already run.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(leaveTimer.current)
    }
  }, [])
  const [localErrors, setLocalErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      clearTimeout(leaveTimer.current)
      inFlight.current = false
      setBusy(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const run = async (step: () => Promise<StepOutcome>) => {
    if (inFlight.current) return
    inFlight.current = true
    onStart?.()
    setBusy(true)
    setLocalErrors([])
    setNotice(undefined)
    let stayLocked = false
    try {
      stayLocked = (await step())?.stayLocked ?? false
    } catch (error) {
      console.error(`[${logTag}] unexpected failure`, error)
      setLocalErrors([UNEXPECTED_MESSAGE])
    } finally {
      if (stayLocked) {
        if (mounted.current) {
          leaveTimer.current = setTimeout(() => {
            inFlight.current = false
            setBusy(false)
            setLocalErrors([SLOW_MESSAGE])
          }, leaveTimeoutMs)
        }
      } else {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  return {
    busy,
    run,
    mounted,
    localErrors,
    setLocalErrors,
    notice,
    setNotice,
  }
}

/**
 * Where a finished sign-in or sign-up goes, read from `redirect_url`.
 *
 * @remarks Honoured only as a path on this site (`safeRedirectPath`):
 * anything else falls back to the home page. The origin is unknown until
 * mount, so the server render accepts a path only and a same-origin absolute
 * `redirect_url` is accepted once the origin is known.
 *
 * @returns `redirectTarget`, the checked target or `null`, to carry on to
 *   another auth page; `destination`, where to land.
 */
export function useRedirectTarget() {
  const searchParams = useSearchParams()
  const [origin, setOrigin] = useState<string>()
  useEffect(() => setOrigin(window.location.origin), [])
  const redirectTarget = safeRedirectPath(
    searchParams.get('redirect_url'),
    origin,
  )
  return { redirectTarget, destination: redirectTarget ?? '/' }
}

/**
 * The `navigate` callback for Clerk's `finalize()`: on to `destination`,
 * through `decorateUrl` (which may turn it into an absolute URL Clerk needs
 * to set the session on), unless the visitor has already left this page.
 *
 * @param options - `mounted`: From {@link useAuthSteps}; a visitor who left in
 *   the moment before Clerk called this is signed in either way, and is not
 *   pulled back.
 *   `assignLocation`: How to leave for an absolute URL.
 */
export function useFinalizeNavigate({
  destination,
  mounted,
  assignLocation,
}: {
  destination: string
  mounted: { current: boolean }
  assignLocation: (url: string) => void
}) {
  const router = useRouter()
  return ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
    if (!mounted.current) return
    const url = decorateUrl(destination)
    if (url.startsWith('http')) assignLocation(url)
    else router.push(url)
  }
}
