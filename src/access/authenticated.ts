import type { AccessArgs } from 'payload'

import type { User } from '@/payload-types'

type IsAuthenticated = (args: AccessArgs<User>) => boolean

/**
 * Access control that allows any logged-in Payload admin user.
 *
 * @remarks Payload auth guards the `/admin` UI and Local/REST APIs. End-user
 * (Clerk) identity is handled separately and never grants CMS access.
 */
export const authenticated: IsAuthenticated = ({ req: { user } }) => {
  return Boolean(user)
}
