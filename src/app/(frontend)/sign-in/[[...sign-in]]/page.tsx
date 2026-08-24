import { SignIn } from '@clerk/nextjs'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Sign in', robots: { index: false } }

/**
 * In-app, site-themed sign-in (renders a notice until Clerk is configured).
 *
 * @remarks `path`/`routing="path"` pin the component to this route's
 * optional catch-all segment (`[[...sign-in]]`), and `signUpUrl` keeps its
 * own "Sign up" cross-link on the app route. Both are explicit so routing
 * stays correct even if `NEXT_PUBLIC_CLERK_SIGN_UP_URL` is left unset —
 * without either, Clerk falls back to the unstyled hosted Account Portal
 * (#96).
 */
export default function SignInPage() {
  if (!isClerkEnabled()) {
    return (
      <div className="mx-auto max-w-md py-24 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Sign-in isn&apos;t configured in this environment yet.
      </div>
    )
  }
  return (
    <div className="flex justify-center py-16">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </div>
  )
}
