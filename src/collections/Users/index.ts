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
 * this rule is stricter.
 *
 * **Keep it after the 3.90 bump (#257).** Upstream's fix in 3.90.0
 * (`c3e4d01f3`; `payload/dist/auth/defaultUnlockAccess.js` at 3.90.2) changes
 * the default to `user.collection === admin.user`. This
 * collection IS `admin.user`, so for every signed-in admin that default is
 * still `Boolean(user)` here: removing this rule would reopen the hole.
 * `evals/users-unlock-access-integration.test.ts` pins it. Payload's unlock operation ANDs the returned `Where`
 * with the email being unlocked, so a request for someone else's email finds
 * no row and is refused (`Forbidden`). A lockout on another account expires
 * on its own after `lockTime` (Payload default 10 minutes) or is cleared with
 * `overrideAccess` from the Local API.
 *
 * The trade-off: an admin can no longer clear another admin's lockout from
 * the admin UI — the lock expires after `lockTime`, or `overrideAccess`
 * clears it. `update` and `delete` follow the same self-only rule
 * ({@link ownAccountOnly}).
 */
const unlockOwnAccountOnly: Access<User> = ({ req: { user } }) => {
  if (!user) return false
  return { id: { equals: user.id } }
}

/**
 * Update and delete access: a signed-in user may change or delete only their
 * OWN account (#255).
 *
 * @remarks With `authenticated` here, any Payload user could change another
 * Payload user's email or password, or delete them: an account-takeover path
 * between staff accounts. Production has one Payload account (Brandon,
 * 2026-09-08, #100) and Clerk users never get one, so this changes nothing
 * today; it closes the hole before a second account exists rather than after.
 * There is no admin role to exempt, so none is modelled; add one here if one
 * is ever introduced. The `Where` makes a by-id request for another account a
 * `Forbidden`, and a bulk `where` request match only the caller's own row.
 * Payload's own writes to the row (login attempts, sessions, logout, refresh,
 * forgot and reset password) go through `payload.db.updateOne` or the Local
 * API's default `overrideAccess: true`, so they are unaffected
 * `[source: payload 3.90.2 dist/auth/operations/*, auth/sessions.js]`.
 * `evals/users-self-scope-access-integration.test.ts` pins it.
 */
const ownAccountOnly: Access<User> = ({ req: { user } }) => {
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
    delete: ownAccountOnly,
    read: authenticated,
    unlock: unlockOwnAccountOnly,
    update: ownAccountOnly,
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
