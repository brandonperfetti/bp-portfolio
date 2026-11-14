// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Media reads with Blob storage ENABLED, against the schema the committed
 * migrations build (#257).
 *
 * @remarks **Why this file exists.** Since Payload 3.90 an enabled
 * cloud-storage adapter always adds an `_objectKey` column to the collections
 * it serves. The rest of this tier, CI and the `migrate:create` drift check
 * all run without a Blob token, so the adapter is disabled there and none of
 * them saw the column: a migration generated that way left it out, and every
 * Media read on a deploy WITH a token (staging, production) failed with
 * Postgres 42703. `alwaysInsertFields: true` in `src/payload.config.ts` keeps
 * the schema the same either way; this file shows it holds by reading Media
 * through a config that has a token, on a database migrated by the committed
 * migrations only.
 *
 * The token is a syntactically valid dummy, set before the config is
 * imported. Nothing here writes or fetches: Media reads never contact the
 * store, so no real Blob store is touched even when a real token is exported
 * in the shell (it is overridden for this file).
 *
 * Runs in the pg tier (`vitest run --root evals`) with `DATABASE_URI` set.
 */

const connectionString = process.env.DATABASE_URI

/** A well-formed token for a store that does not exist. */
const DUMMY_BLOB_TOKEN =
  'vercel_blob_rw_zzstorageschema_notarealsecret00000000000000'

describe('media storage schema integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'Media with Blob storage enabled (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let config: Awaited<typeof import('../src/payload.config').default>

    beforeAll(async () => {
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', DUMMY_BLOB_TOKEN)
      const { getPayload } = await import('payload')
      config = await (await import('../src/payload.config')).default
      payload = await getPayload({ config })
    }, 120_000)

    afterAll(async () => {
      try {
        await payload?.db?.destroy?.()
      } finally {
        vi.unstubAllEnvs()
      }
    }, 60_000)

    it('resolves the adapter fields the migrations must carry', () => {
      const media = config.collections.find((c) => c.slug === 'media')
      const names = (media?.fields ?? []).flatMap((field) =>
        'name' in field ? [field.name] : [],
      )
      expect(names).toEqual(expect.arrayContaining(['_objectKey', 'prefix']))
    })

    it('reads Media without a missing-column error', async () => {
      await expect(
        payload.find({
          collection: 'media',
          depth: 0,
          limit: 1,
          overrideAccess: true,
        }),
      ).resolves.toMatchObject({ docs: expect.any(Array) })
    })
  },
)
