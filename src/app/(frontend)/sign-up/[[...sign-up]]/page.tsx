import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SignUpForm } from '@/components/auth/SignUpForm'
import { isClerkEnabled } from '@/lib/auth/clerkEnabled'
import { getViewer } from '@/lib/auth/getViewer'
import { safeRedirectPath } from '@/lib/auth/safeRedirect'
import { enabledSocialProviders } from '@/lib/auth/socialProviders'

export const metadata = { title: 'Sign up', robots: { index: false } }

// #76 B3: the form reads the URL on the client (`useSearchParams`, which
// blocks prerender), and the route is noindex — opt out of prerender.
// Request-time render; no SEO/static value lost.
export const instant = false

/**
 * In-app sign-up, in the site's own markup (#377). An account joins the
 * mailing list only when the visitor ticks the opt-in inside the form (#362;
 * `SignUpForm` carries how that reaches the webhook). The email-code step is
 * part of the same form, so it is not a separate route.
 *
 * @remarks The optional catch-all (`[[...sign-up]]`) stays although the form
 * no longer routes by path: links Clerk's prebuilt forms built into
 * `/sign-up/…` before #379, and bookmarks of them, must land on the form,
 * not a 404. `/sign-up/sso-callback` is its own page.
 *
 * **A signed-in visitor is sent on, and never sees the form** (#384). Clerk's
 * prebuilt `<SignUp />` did this itself; the custom form rendered for
 * everyone. They go where a finished sign-up goes: the `redirect_url` target
 * when it is a path on this site (`safeRedirectPath`, with no origin, so an
 * absolute URL is refused here even when it is this site's), else the home
 * page. It is decided on the server so there is nothing for them to submit.
 * `/sign-up/sso-callback` is a separate page and is not redirected: a
 * visitor Google has just signed in must reach Clerk's handler there.
 *
 * **Which social buttons show** is read here, per request, from
 * `CLERK_GITHUB_ENABLED` (`enabledSocialProviders`, #431): Google always,
 * GitHub only where that instance's GitHub connection is on.
 *
 * @param props - The route's props; of the query string, only `redirect_url`
 *   is read.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isClerkEnabled()) {
    return (
      <div className="mx-auto max-w-md py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Sign-up isn&apos;t configured in this environment yet.
      </div>
    )
  }
  const { isAuthenticated } = await getViewer()
  if (isAuthenticated) {
    const { redirect_url: target } = await searchParams
    redirect(
      safeRedirectPath(Array.isArray(target) ? target[0] : target) ?? '/',
    )
  }
  return (
    <div className="flex justify-center px-4 py-16">
      <Suspense fallback={null}>
        <SignUpForm providers={enabledSocialProviders()} />
      </Suspense>
    </div>
  )
}
