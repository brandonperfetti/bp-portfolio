'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { HandleSSOCallback, useSignUp } from '@clerk/nextjs'

import { safeRedirectPath, withRedirect } from '@/lib/auth/safeRedirect'

import { SIGN_IN_PATH, SIGN_UP_PATH } from './SignUpForm'

/**
 * How long the callback page waits for Clerk to send the visitor somewhere
 * before it offers a way out.
 *
 * @remarks Clerk's handler normally navigates within a second or two. It
 * calls none of its three handlers for a sign-up that came back from Google
 * still needing something this site's form has no field for (read from the
 * installed `@clerk/react` 6.18.9, and measured by the independent review of
 * #377), so without this the page would say "Finishing sign-up…" for ever.
 */
export const SSO_CALLBACK_STALL_MS = 10_000

/**
 * Where Google sends the visitor back to after "Continue with Google" on the
 * custom sign-up form (#377).
 *
 * @remarks
 * Clerk's `<HandleSSOCallback />` does the work: it finishes the sign-up, or,
 * when the Google account already belongs to a member, signs them in instead
 * (the mailing list is not touched for an existing member). It also shows
 * Clerk's bot check if the instance asks for one at this point, which is why
 * this is Clerk's component and not a copy of its logic.
 *
 * This component only says where to go next. `redirect_url` rode along in
 * this page's own URL (`SignUpForm` put it there) and is checked again here,
 * since a callback URL is as forgeable as any other.
 *
 * - **A session exists:** on to the target, or the home page.
 * - **The sign-in needs another step** (a second factor): to `/sign-in`,
 *   Clerk's prebuilt form, which continues it.
 * - **The sign-up could not finish and Clerk says so** (the bot check
 *   failed): back to `/sign-up`, where Clerk's error shows in the form.
 * - **Still here after `SSO_CALLBACK_STALL_MS`**, because Clerk said nothing
 *   or because the navigation it asked for has not happened: the page says it is
 *   taking longer than expected and offers "Start again" and "Sign in". It
 *   does not say the sign-up failed and does not redirect by itself: Clerk
 *   may still be working through a bot check or an account transfer, and
 *   finishes if left alone (measured by the review of #377). Following a
 *   link is the visitor's choice to leave that.
 *
 * @param assignLocation - How to leave for an absolute URL; a seam for tests.
 * @param stallMs - See {@link SSO_CALLBACK_STALL_MS}; a seam for tests.
 */
export function SignUpSsoCallback({
  assignLocation = (url: string) => window.location.assign(url),
  stallMs = SSO_CALLBACK_STALL_MS,
}: {
  assignLocation?: (url: string) => void
  stallMs?: number
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signUp } = useSignUp()
  // Read when a handler runs, never during render: `window` is not there on
  // the server, and the handlers only ever run in the browser.
  const target = () =>
    safeRedirectPath(searchParams.get('redirect_url'), window.location.origin)

  const navigated = useRef(false)
  const [stalled, setStalled] = useState(false)
  // The latest sign-up, for the log line below, without restarting the timer
  // each time Clerk's state changes.
  const latestSignUp = useRef(signUp)
  useEffect(() => {
    latestSignUp.current = signUp
  }, [signUp])

  useEffect(() => {
    const timer = setTimeout(() => {
      // Still on this page at the deadline, whatever the reason: offer the
      // way out. A navigation that was requested is not one that happened;
      // the destination can be slow, and "Finishing sign-up…" with nothing
      // to press would be the same dead end. The cleanup below cancels this
      // for a navigation that does complete.
      setStalled(true)
      if (navigated.current) return
      const current = latestSignUp.current
      // Clerk sent the visitor nowhere. Field names only: nothing they typed.
      console.error('[sign-up] sso callback unresolved', {
        status: current?.status,
        missingFields: current?.missingFields,
        unverifiedFields: current?.unverifiedFields,
      })
    }, stallMs)
    return () => clearTimeout(timer)
  }, [stallMs])

  const go = (navigate: () => void) => {
    navigated.current = true
    navigate()
  }

  const linkClass =
    'font-medium text-link-accent underline-offset-4 hover:underline'
  // Rendered after mount only (`stalled`), so `window` is there to check
  // the target against.
  const stalledLinks = stalled ? (
    <p className="mt-4 flex justify-center gap-6 text-sm">
      <Link href={withRedirect(SIGN_UP_PATH, target())} className={linkClass}>
        Start again
      </Link>
      <Link href={withRedirect(SIGN_IN_PATH, target())} className={linkClass}>
        Sign in
      </Link>
    </p>
  ) : null

  return (
    <div className="w-full max-w-[25rem] rounded-2xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm sm:p-8">
      <p role="status" className="text-sm text-muted-foreground">
        {stalled
          ? 'This is taking longer than expected.'
          : 'Finishing sign-up…'}
      </p>
      {stalledLinks}
      <HandleSSOCallback
        navigateToApp={({ decorateUrl }) =>
          go(() => {
            const url = decorateUrl(target() ?? '/')
            if (url.startsWith('http')) assignLocation(url)
            else router.push(url)
          })
        }
        navigateToSignIn={() =>
          go(() => router.push(withRedirect(SIGN_IN_PATH, target())))
        }
        navigateToSignUp={() =>
          go(() => router.push(withRedirect(SIGN_UP_PATH, target())))
        }
      />
    </div>
  )
}
