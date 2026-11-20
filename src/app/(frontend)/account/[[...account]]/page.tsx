import { UserProfile } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

export const metadata = { title: 'Account', robots: { index: false } }

// #76 B3: genuinely dynamic (reads `auth()` cookies + redirects on session), and
// noindex — opt out of prerender rather than Suspense-isolate. The route renders
// at request time; no SEO/static value is lost.
export const instant = false

/**
 * Signed-in account management; anonymous visitors are sent to sign-in.
 *
 * @remarks `<UserProfile>` path-routes its sub-pages (`/account/security`, …),
 * so this page lives at the optional catch-all `[[...account]]`, as sign-in and
 * sign-up do. On a plain `account/page.tsx` a click inside the profile worked
 * (client-side), but loading a sub-page directly fell through to the CMS
 * catch-all and 404'd (#391). `path`/`routing="path"` are explicit so Clerk
 * does not have to infer the base path. The session check runs for every
 * sub-page too: the catch-all shares this one server component.
 */
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
      <UserProfile path="/account" routing="path" />
    </div>
  )
}
