import { SignUp } from '@clerk/nextjs'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Sign up', robots: { index: false } }

/** Clerk-hosted sign-up (email capture entry point; consent handled by Clerk legal/consent settings). */
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
      <SignUp />
    </div>
  )
}
