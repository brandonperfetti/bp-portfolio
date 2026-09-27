import type { Access, CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import type { User } from '@/payload-types'

/**
 * Unlock access: a signed-in user may clear only their OWN account's login
 * lockout, never another account's.
 *
 * @remarks Closes CVE-2026-11779 / GHSA-jg8r-5jh2-v2xj on payload 3.88.0
 * (#232). With no `access.unlock`, Payload's default (`Boolean(user)` — the
 * same test `authenticated` makes) lets ANY authenticated user reset any other
 * account's `loginAttempts`/`lockUntil`, which turns the brute-force lockout
 * into a speed bump. Reusing `authenticated` would therefore change nothing;
 * this rule is stricter. Payload's unlock operation ANDs the returned `Where`
 * with the email being unlocked, so a request for someone else's email finds
 * no row and is refused (`Forbidden`). A lockout on another account expires
 * on its own after `lockTime` (Payload default 10 minutes) or is cleared with
 * `overrideAccess` from the Local API.
 *
 * Scope: this hardens only the lockout reset. `update` and `delete` below
 * stay `authenticated`, so any Payload user can still edit or delete another
 * user's account (tracked separately). The trade-off: an admin can no longer
 * clear another admin's lockout from the admin UI — the lock expires after
 * `lockTime`, or `overrideAccess` clears it.
 */
const unlockOwnAccountOnly: Access<User> = ({ req: { user } }) => {
  if (!user) return false
  return { id: { equals: user.id } }
}

/**
 * Payload admin users (CMS staff). Auth-enabled collection guarding `/admin`.
 *
 * @remarks Distinct from end-user (Clerk) identity — Clerk users never get
 * Payload accounts. Keep this collection minimal.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    unlock: unlockOwnAccountOnly,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
  timestamps: true,
}
