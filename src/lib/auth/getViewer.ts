import { auth } from '@clerk/nextjs/server'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Resolve the current end-user auth state for server-side gating.
 *
 * @returns `isAuthenticated` false whenever Clerk is unconfigured — gated
 * content then always renders its teaser, never its body. `userId` is the
 * Clerk user id when authenticated, otherwise `null` (added for #74: the
 * Hermes chat gate keys signed-in abuse limits by userId instead of IP).
 */
export async function getViewer(): Promise<{
  isAuthenticated: boolean
  userId: string | null
}> {
  if (!isClerkEnabled()) {
    return { isAuthenticated: false, userId: null }
  }
  const { userId } = await auth()
  return { isAuthenticated: Boolean(userId), userId: userId ?? null }
}
