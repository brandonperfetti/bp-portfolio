import { SignUp } from '@clerk/nextjs'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Sign up', robots: { index: false } }

/**
 * In-app, site-themed sign-up (email capture entry point; consent handled
 * by Clerk legal/consent settings). The email-code verification step is
 * part of the same `<SignUp>` flow, so it renders in-app and on-theme too —
 * it isn't a separate route.
 *
 * @remarks `path`/`routing="path"` pin the component to this route's
 * optional catch-all segment (`[[...sign-up]]`), and `signInUrl` keeps its
 * "Sign in" cross-link on the app route. Both are explicit so routing stays
 * correct even if `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is left unset — without
 * either, Clerk falls back to the unstyled hosted Account Portal (#96).
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
    <div className="flex justify-center py-16">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
    </div>
  )
}
