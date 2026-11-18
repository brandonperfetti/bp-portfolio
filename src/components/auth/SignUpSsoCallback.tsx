'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import { HandleSSOCallback } from '@clerk/nextjs'

import { safeRedirectPath, withRedirect } from '@/lib/auth/safeRedirect'

import { SIGN_IN_PATH, SIGN_UP_PATH } from './SignUpForm'

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
 * - **The sign-up could not finish** (the bot check failed, or the instance
 *   requires something more): back to `/sign-up`, where Clerk's error shows
 *   in the form.
 *
 * @param assignLocation - How to leave for an absolute URL; a seam for tests.
 */
export function SignUpSsoCallback({
  assignLocation = (url: string) => window.location.assign(url),
}: {
  assignLocation?: (url: string) => void
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Read when a handler runs, never during render: `window` is not there on
  // the server, and the handlers only ever run in the browser.
  const target = () =>
    safeRedirectPath(searchParams.get('redirect_url'), window.location.origin)

  return (
    <div className="w-full max-w-[25rem] rounded-2xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm sm:p-8">
      <p role="status" className="text-sm text-muted-foreground">
        Finishing sign-up…
      </p>
      <HandleSSOCallback
        navigateToApp={({ decorateUrl }) => {
          const url = decorateUrl(target() ?? '/')
          if (url.startsWith('http')) assignLocation(url)
          else router.push(url)
        }}
        navigateToSignIn={() =>
          router.push(withRedirect(SIGN_IN_PATH, target()))
        }
        navigateToSignUp={() =>
          router.push(withRedirect(SIGN_UP_PATH, target()))
        }
      />
    </div>
  )
}
