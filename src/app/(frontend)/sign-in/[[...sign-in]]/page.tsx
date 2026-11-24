import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SignInForm } from '@/components/auth/SignInForm'
import { isClerkEnabled } from '@/lib/auth/clerkEnabled'
import { getViewer } from '@/lib/auth/getViewer'
import { safeRedirectPath } from '@/lib/auth/safeRedirect'
import { enabledSocialProviders } from '@/lib/auth/socialProviders'

export const metadata = { title: 'Sign in', robots: { index: false } }

// #76 B3: the form reads the URL on the client (`useSearchParams`, which
// blocks prerender), and the route is noindex — opt out of prerender.
// Request-time render; no SEO/static value lost.
export const instant = false

/**
 * In-app sign-in, in the site's own markup (#379), the pair of `/sign-up`.
 * Every step (password, email code, forgot password, the new-device code)
 * is part of the same form; `SignInForm` carries how each reaches Clerk.
 *
 * @remarks The optional catch-all (`[[...sign-in]]`) stays although the form
 * no longer routes by path: links Clerk built for its prebuilt form, and
 * bookmarks of them (`/sign-in/factor-one`, `/sign-in/reset-password`…),
 * land on the form instead of a 404, and the form picks up whatever step
 * Clerk's sign-in is on. `/sign-in/sso-callback` is its own page.
 *
 * **A signed-in visitor is sent on, and never sees the form**, as Clerk's
 * prebuilt `<SignIn />` did and as `/sign-up` does (#384): to the
 * `redirect_url` target when it is a path on this site (`safeRedirectPath`,
 * with no origin, so an absolute URL is refused here even when it is this
 * site's), else the home page.
 *
 * **Which social buttons show** is read here, per request, from
 * `CLERK_GITHUB_ENABLED` (`enabledSocialProviders`, #431): Google always,
 * GitHub only where that instance's GitHub connection is on.
 *
 * @param props - The route's props; of the query string, only `redirect_url`
 *   is read.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isClerkEnabled()) {
    return (
      <div className="mx-auto max-w-md py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Sign-in isn&apos;t configured in this environment yet.
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
        <SignInForm providers={enabledSocialProviders()} />
      </Suspense>
    </div>
  )
}
