import { Suspense } from 'react'

import { SignUpSsoCallback } from '@/components/auth/SignUpSsoCallback'
import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Signing up', robots: { index: false } }

// Same reason as the sign-up page: the component reads the URL on the client
// and the route is noindex, so nothing is gained by prerendering it.
export const instant = false

/**
 * The page Google returns to after "Continue with Google" on `/sign-up`
 * (#377). `SignUpSsoCallback` carries what happens next.
 *
 * @remarks A static segment beside the `[[...sign-up]]` catch-all, so it
 * wins for this one path and every other `/sign-up/…` still renders the
 * form.
 */
export default function SignUpSsoCallbackPage() {
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
        <SignUpSsoCallback />
      </Suspense>
    </div>
  )
}
