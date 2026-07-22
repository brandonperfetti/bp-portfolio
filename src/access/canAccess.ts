import type { Post } from '@/payload-types'

/**
 * Server-side gate for content marked `access.visibility = 'gated'`.
 *
 * @param isAuthenticated - Whether the requesting end user has a Clerk session.
 * @param doc - The document (Post) whose access group is being evaluated.
 * @returns `true` when the requester may read the full body.
 *
 * @remarks This is THE single authoritative check — RSCs/routes must call it
 * before including gated bodies in any payload sent to the client. `<Protect>`
 * style client components are UX only. Phase 5 threads real Clerk `auth()` /
 * `has()` results in here.
 * TODO(brandon): enable Clerk Billing — extend with `has({ plan })` against
 * `requiredPlan` / `requiredFeature` when billing flips on.
 */
export const canAccess = (
  isAuthenticated: boolean,
  doc: Pick<Post, 'access'> | null | undefined,
): boolean => {
  const visibility = doc?.access?.visibility ?? 'public'
  if (visibility === 'public') return true
  return isAuthenticated
}
