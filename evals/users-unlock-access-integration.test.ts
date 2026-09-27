// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `Users.access.unlock` against a REAL Payload instance on REAL Postgres
 * (#232, CVE-2026-11779 / GHSA-jg8r-5jh2-v2xj).
 *
 * @remarks **Why this tier and not a unit test.** The rule returns a `Where`
 * (`{ id: { equals: user.id } }`), and what makes it safe is Payload's unlock
 * operation ANDing that constraint with the email being unlocked
 * (`payload/dist/auth/operations/unlock.js`). A unit test of the access
 * function alone can only assert the constraint's shape; it cannot show that a
 * second account's lockout survives an unlock request. This file drives the
 * real sequence: lock an account by failing its login `maxLoginAttempts`
 * times, then ask a DIFFERENT signed-in user to unlock it.
 *
 * Without the rule, Payload's default unlock access is `Boolean(user)`, so
 * the non-owner case below unlocks the account and that test fails — verified
 * by removing the rule and re-running (#232 lane report). The anonymous case
 * is refused by the default too; it is pinned so the rule never widens. Each
 * case locks its own account, so no case depends on another's state.
 *
 * Runs in the pg tier (`vitest run --root evals`) with `DATABASE_URI` set.
 * Rows carry the `MARKER` in their email and are deleted in `afterAll`.
 */

const connectionString = process.env.DATABASE_URI

/** Marks every row this file writes, for exact cleanup. */
const MARKER = 'zz-users-unlock-integration'
const OWNER_EMAIL = `${MARKER}-owner@example.test`
const OTHER_EMAIL = `${MARKER}-other@example.test`
const ANON_TARGET_EMAIL = `${MARKER}-anon-target@example.test`
const SELF_EMAIL = `${MARKER}-self@example.test`
const PASSWORD = 'correct-horse-battery-staple'

describe('users unlock integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'Users.access.unlock (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'users',
        where: { email: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    const createUser = async (email: string) => {
      const doc = await payload.create({
        collection: 'users',
        data: { email, password: PASSWORD, name: email },
        overrideAccess: true,
      })
      return { ...doc, collection: 'users' as const }
    }

    const login = (email: string, password: string) =>
      payload.login({ collection: 'users', data: { email, password } })

    /**
     * `payload.unlock` through the access rule (`overrideAccess: false`), as
     * `user` — or anonymously when `user` is omitted.
     *
     * @remarks The generated `UserAuthOperations['unlock']` type requires a
     * `password`, but the unlock operation reads only `email`/`username`
     * (`payload/dist/auth/operations/unlock.js`), so an empty one is passed to
     * satisfy the type. The caller rides on `req.user`, which is the only
     * user slot the local unlock `Options` type exposes.
     */
    const unlockAs = (
      email: string,
      user?: Awaited<ReturnType<typeof createUser>>,
    ) =>
      payload.unlock({
        collection: 'users',
        data: { email, password: '' },
        overrideAccess: false,
        req: user ? { user } : undefined,
      })

    /** Fail the login until Payload locks the account. */
    const lockOut = async (email: string) => {
      const attempts = payload.collections.users.config.auth.maxLoginAttempts
      expect(attempts, 'lockout must be enabled on Users').toBeGreaterThan(0)
      for (let i = 0; i < attempts; i += 1) {
        await expect(login(email, 'wrong-password')).rejects.toThrow()
      }
    }

    const isLocked = async (email: string) => {
      const { docs } = await payload.find({
        collection: 'users',
        depth: 0,
        overrideAccess: true,
        showHiddenFields: true,
        where: { email: { equals: email } },
      })
      const lockUntil = docs[0]?.lockUntil
      return Boolean(lockUntil && new Date(lockUntil).getTime() > Date.now())
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      await cleanup()
    }, 120_000)

    // `finally`, so a REJECTED cleanup still destroys the pool.
    afterAll(async () => {
      try {
        await cleanup()
      } finally {
        await payload?.db?.destroy?.()
      }
    }, 60_000)

    it('refuses an authenticated non-owner unlocking another account', async () => {
      const owner = await createUser(OWNER_EMAIL)
      await createUser(OTHER_EMAIL)

      await lockOut(OTHER_EMAIL)
      expect(await isLocked(OTHER_EMAIL)).toBe(true)

      await expect(unlockAs(OTHER_EMAIL, owner)).rejects.toMatchObject({
        name: 'Forbidden',
        status: 403,
      })

      expect(await isLocked(OTHER_EMAIL)).toBe(true)
      await expect(login(OTHER_EMAIL, PASSWORD)).rejects.toThrow()
    })

    it('refuses an anonymous unlock', async () => {
      // Payload's default refuses this too; pinned so the rule never widens.
      await createUser(ANON_TARGET_EMAIL)
      await lockOut(ANON_TARGET_EMAIL)
      expect(await isLocked(ANON_TARGET_EMAIL)).toBe(true)

      await expect(unlockAs(ANON_TARGET_EMAIL)).rejects.toMatchObject({
        name: 'Forbidden',
        status: 403,
      })

      expect(await isLocked(ANON_TARGET_EMAIL)).toBe(true)
    })

    it('lets an account clear its own lockout', async () => {
      // Positive control: the refusals above are the rule, not a broken
      // unlock operation or a lock that could never be cleared.
      const self = await createUser(SELF_EMAIL)
      await lockOut(SELF_EMAIL)
      expect(await isLocked(SELF_EMAIL)).toBe(true)

      await expect(unlockAs(SELF_EMAIL, self)).resolves.toBe(true)

      expect(await isLocked(SELF_EMAIL)).toBe(false)
      await expect(login(SELF_EMAIL, PASSWORD)).resolves.toMatchObject({
        user: { email: SELF_EMAIL },
      })
    })
  },
)
