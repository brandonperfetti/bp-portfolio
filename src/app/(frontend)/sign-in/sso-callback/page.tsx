import { Suspense } from 'react'

import { SsoCallback } from '@/components/auth/SsoCallback'
import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Signing in', robots: { index: false } }

// Same reason as the sign-in page: the component reads the URL on the client
// and the route is noindex, so nothing is gained by prerendering it.
export const instant = false

/**
 * The page Google returns to after "Continue with Google" on `/sign-in`
 * (#379). `SsoCallback` carries what happens next, including the sign-up
 * Clerk makes for an address with no account (no mailing-list opt-in, #362).
 *
 * @remarks A static segment beside the `[[...sign-in]]` catch-all, so it
 * wins for this one path and every other `/sign-in/…` still renders the
 * form. It is not redirected for a signed-in visitor: one Google has just
 * signed in must reach Clerk's handler here.
 */
export default function SignInSsoCallbackPage() {
  if (!isClerkEnabled()) {
    return (
      <div className="mx-auto max-w-md py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Sign-in isn&apos;t configured in this environment yet.
      </div>
    )
  }
  return (
    <div className="flex justify-center px-4 py-16">
      <Suspense fallback={null}>
        <SsoCallback flow="sign-in" />
      </Suspense>
    </div>
  )
}
