// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `Users.access.update` and `delete` against a REAL Payload instance on REAL
 * Postgres (#255).
 *
 * @remarks **Why this tier and not a unit test.** The rule returns a `Where`
 * (`{ id: { equals: user.id } }`). What makes it safe is Payload ANDing that
 * constraint into the by-id and bulk operations, so a request for another
 * account finds no row. Only a real instance can show that the other account's
 * password, email and row survive. The password case also logs in with the old
 * password afterwards: a refusal that still rewrote the hash would pass a
 * shape-only check and fail here.
 *
 * Without the rule (`authenticated`, the previous value), the three non-owner
 * cases below fail: the update and delete succeed and the bulk update rewrites
 * the other row. Verified by restoring `authenticated` and re-running; the
 * result is recorded in the body of the commit that added this file.
 *
 * Runs in the pg tier (`vitest run --root evals`) with `DATABASE_URI` set.
 * Rows carry the `MARKER` in their email and are deleted in `afterAll`.
 */

const connectionString = process.env.DATABASE_URI

/** Marks every row this file writes, for exact cleanup. */
const MARKER = 'zz-users-self-scope-integration'
const PASSWORD = 'correct-horse-battery-staple'
const NEW_PASSWORD = 'a-different-horse-entirely'

describe('users self-scope integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

/**
 * Per-test budget for cases that hash passwords: Payload 3.90's PBKDF2 cost
 * makes each create and login slow enough to exceed Vitest's 5 s default under
 * a loaded tier (measured on the unlock file, #257).
 */
const AUTH_TEST_TIMEOUT_MS = 30_000

describe.skipIf(!connectionString)(
  'Users.access.update / delete (real Payload, real Postgres)',
  { timeout: AUTH_TEST_TIMEOUT_MS },
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

    /** A user row, shaped as `req.user` carries it. */
    const createUser = async (label: string) => {
      const email = `${MARKER}-${label}@example.test`
      const doc = await payload.create({
        collection: 'users',
        data: { email, password: PASSWORD, name: label },
        overrideAccess: true,
      })
      return { ...doc, collection: 'users' as const }
    }

    const login = (email: string, password: string) =>
      payload.login({ collection: 'users', data: { email, password } })

    const readRow = async (id: number) =>
      payload.findByID({
        collection: 'users',
        depth: 0,
        disableErrors: true,
        id,
        overrideAccess: true,
      })

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

    it("refuses a non-owner changing another account's password or email", async () => {
      const caller = await createUser('pw-caller')
      const target = await createUser('pw-target')

      await expect(
        payload.update({
          collection: 'users',
          data: {
            email: `${MARKER}-hijacked@example.test`,
            password: NEW_PASSWORD,
          },
          id: target.id,
          overrideAccess: false,
          user: caller,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden', status: 403 })

      expect((await readRow(target.id))?.email).toBe(target.email)
      await expect(login(target.email, PASSWORD)).resolves.toMatchObject({
        user: { email: target.email },
      })
      await expect(login(target.email, NEW_PASSWORD)).rejects.toThrow()
    })

    it('refuses a non-owner deleting another account', async () => {
      const caller = await createUser('del-caller')
      const target = await createUser('del-target')

      await expect(
        payload.delete({
          collection: 'users',
          id: target.id,
          overrideAccess: false,
          user: caller,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden', status: 403 })

      expect(await readRow(target.id)).toMatchObject({ id: target.id })
    })

    it("limits a non-owner's bulk update to their own row", async () => {
      const caller = await createUser('bulk-caller')
      const target = await createUser('bulk-target')

      const result = await payload.update({
        collection: 'users',
        data: { name: 'renamed-by-bulk' },
        overrideAccess: false,
        user: caller,
        where: { email: { like: `%${MARKER}-bulk-%` } },
      })

      expect(result.docs.map((doc) => doc.id)).toEqual([caller.id])
      expect((await readRow(target.id))?.name).toBe('bulk-target')
      expect((await readRow(caller.id))?.name).toBe('renamed-by-bulk')
    })

    it('lets an account change its own password and delete itself', async () => {
      // Positive control: the refusals above are the rule, not a broken
      // update or delete operation.
      const self = await createUser('self')

      await expect(
        payload.update({
          collection: 'users',
          data: { password: NEW_PASSWORD },
          id: self.id,
          overrideAccess: false,
          user: self,
        }),
      ).resolves.toMatchObject({ id: self.id })
      await expect(login(self.email, NEW_PASSWORD)).resolves.toMatchObject({
        user: { email: self.email },
      })

      await expect(
        payload.delete({
          collection: 'users',
          id: self.id,
          overrideAccess: false,
          user: self,
        }),
      ).resolves.toMatchObject({ id: self.id })
      expect(await readRow(self.id)).toBeNull()
    })

    it('refuses an anonymous update and delete', async () => {
      const target = await createUser('anon-target')

      await expect(
        payload.update({
          collection: 'users',
          data: { name: 'anon' },
          id: target.id,
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden', status: 403 })
      await expect(
        payload.delete({
          collection: 'users',
          id: target.id,
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden', status: 403 })

      expect(await readRow(target.id)).toMatchObject({ name: 'anon-target' })
    })
  },
)
