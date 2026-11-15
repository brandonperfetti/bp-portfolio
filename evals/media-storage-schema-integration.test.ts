// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { MEDIA_STORAGE_COORDINATES_ERROR } from '../src/collections/Media'

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
 * imported. Nothing here uploads, deletes or fetches: Media reads and fileless
 * updates never contact the store, so no real Blob store is touched even when
 * a real token is exported in the shell (it is overridden for this file).
 *
 * The coordinate case (#339) checks the storage-coordinate guard with the
 * adapter ENABLED, the shape the release review measured (F1): its fixture row
 * is inserted and removed with SQL, because a Local API create would upload
 * and a Local API delete would call the store.
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

    it('refuses a fileless prefix or _objectKey update with the adapter enabled (#339)', async () => {
      const { pool } = payload.db as unknown as {
        pool: {
          query: (
            text: string,
            values?: unknown[],
          ) => Promise<{ rows: Record<string, unknown>[] }>
        }
      }
      const filename = 'zz-media-storage-schema-coordinates.png'
      const { rows } = await pool.query(
        `insert into media (alt, filename, mime_type, filesize, width, height)
         values ('zz-media-storage-schema coordinates', $1, 'image/png', 4, 1, 1)
         returning id`,
        [filename],
      )
      const id = rows[0].id as number
      try {
        for (const data of [
          { prefix: 'other-folder' },
          { _objectKey: 'other-key' },
        ]) {
          await expect(
            payload.update({
              collection: 'media',
              context: { disableRevalidate: true },
              id,
              data: data as never,
              overrideAccess: true,
            }),
          ).rejects.toMatchObject({
            message: MEDIA_STORAGE_COORDINATES_ERROR,
            status: 400,
          })
        }
        const updated = await payload.update({
          collection: 'media',
          context: { disableRevalidate: true },
          id,
          data: { alt: 'zz-media-storage-schema coordinates, edited' },
          overrideAccess: true,
        })
        expect(updated.alt).toBe('zz-media-storage-schema coordinates, edited')
        const stored = await pool.query(
          'select prefix, _objectkey from media where id = $1',
          [id],
        )
        expect(stored.rows[0]).toEqual({ prefix: '', _objectkey: null })
      } finally {
        await pool.query('delete from media where id = $1', [id])
      }
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
