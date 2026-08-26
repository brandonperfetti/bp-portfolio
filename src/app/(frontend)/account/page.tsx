import { UserProfile } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Account', robots: { index: false } }

// #76 B3: genuinely dynamic (reads `auth()` cookies + redirects on session), and
// noindex — opt out of prerender rather than Suspense-isolate. The route renders
// at request time; no SEO/static value is lost.
export const instant = false

/** Signed-in account management; anonymous visitors are sent to sign-in. */
export default async function AccountPage() {
  if (!isClerkEnabled()) {
    redirect('/')
  }
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }
  return (
    <div className="flex justify-center py-16">
      <UserProfile />
    </div>
  )
}
