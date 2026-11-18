import { Suspense } from 'react'

import { SignUpForm } from '@/components/auth/SignUpForm'
import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

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
 * no longer routes by path: Clerk's prebuilt sign-in, which this release
 * keeps, links and redirects to paths under `/sign-up/…`, and those must land
 * on the form, not a 404. `/sign-up/sso-callback` is its own page.
 */
export default function SignUpPage() {
  if (!isClerkEnabled()) {
    return (
      <div className="mx-auto max-w-md py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Sign-up isn&apos;t configured in this environment yet.
      </div>
    )
  }
  return (
    <div className="flex justify-center px-4 py-16">
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </div>
  )
}
