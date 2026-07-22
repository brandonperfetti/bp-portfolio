import { SignIn } from '@clerk/nextjs'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Sign in', robots: { index: false } }

/** Clerk-hosted sign-in (renders a notice until Clerk is configured). */
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
      <SignIn />
    </div>
  )
}
