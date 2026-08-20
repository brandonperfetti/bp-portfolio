import { auth } from '@clerk/nextjs/server'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Resolve the current end-user auth state for server-side gating.
 *
 * @returns `isAuthenticated` false whenever Clerk is unconfigured — gated
 * content then always renders its teaser, never its body.
 */
export async function getViewer(): Promise<{ isAuthenticated: boolean }> {
  if (!isClerkEnabled()) {
    return { isAuthenticated: false }
  }
  const { userId } = await auth()
  return { isAuthenticated: Boolean(userId) }
}
