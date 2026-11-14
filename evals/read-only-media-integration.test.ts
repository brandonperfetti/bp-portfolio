// @vitest-environment node
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { READ_ONLY_MEDIA_UPLOAD_ERROR } from '../src/lib/storage/readOnlyMedia'

/**
 * Read-only media mode (#328) through the REAL Local API on REAL Postgres.
 *
 * @remarks The unit suite (`src/lib/storage/readOnlyMedia.test.ts`) pins the
 * hooks' decision table with a faked `doc` and `req.file`. This tier pins what
 * a local developer relies on: that a row read through Payload, with the
 * storage plugin off and only `STORAGE_VERCEL_BLOB_BASE_URL` set, comes back
 * with its `url` on that origin rather than Payload's local-disk route, and
 * that a real upload is refused before any row is written.
 *
 * The mode reads the environment on each call, so each case sets the origin
 * itself and restores it in `finally`. The plugin's `enabled` flag is fixed at
 * config import, and the gate runs with no `BLOB_READ_WRITE_TOKEN`, so the
 * fixture row is written to local disk (`media/`). Never run this tier with
 * that token exported. The origin is on the reserved `.invalid` TLD: nothing
 * here fetches it.
 *
 * Runs in the pg tier (`vitest run --root evals`) with `DATABASE_URI` set; the
 * fixture row is unwound in `try/finally`, and the `afterAll` sweep by
 * `MARKER` in `alt` is only the backstop for a run that died mid-case.
 */

const connectionString = process.env.DATABASE_URI

/** Marks every row this file writes, for exact cleanup. */
const MARKER = 'zz-read-only-media-integration'

const ORIGIN = 'https://store-328.invalid'

/** Skip the Media afterChange revalidation: there is no Next request store. */
const context = { disableRevalidate: true }

/** Run `fn` with read-only mode on, restoring the prior environment. */
async function withReadOnlyOrigin<T>(fn: () => Promise<T>): Promise<T> {
  const prior = process.env.STORAGE_VERCEL_BLOB_BASE_URL
  process.env.STORAGE_VERCEL_BLOB_BASE_URL = ORIGIN
  try {
    return await fn()
  } finally {
    if (prior === undefined) delete process.env.STORAGE_VERCEL_BLOB_BASE_URL
    else process.env.STORAGE_VERCEL_BLOB_BASE_URL = prior
  }
}

describe.skipIf(!connectionString)(
  'Read-only media mode (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'media',
        context,
        overrideAccess: true,
        where: { alt: { like: `%${MARKER}%` } },
      })
    }

    const countMarked = async () =>
      (
        await payload.count({
          collection: 'media',
          overrideAccess: true,
          where: { alt: { like: `%${MARKER}%` } },
        })
      ).totalDocs

    const png = () =>
      sharp({
        create: {
          width: 4,
          height: 3,
          channels: 3,
          background: { r: 60, g: 40, b: 20 },
        },
      })
        .png()
        .toBuffer()

    beforeAll(async () => {
      expect(
        process.env.BLOB_READ_WRITE_TOKEN,
        'run this tier without a Blob token, or the fixture lands in the shared store',
      ).toBeFalsy()
      const payloadModule = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await payloadModule.getPayload({ config })
      await cleanup()
    }, 120_000)

    afterAll(async () => {
      try {
        await cleanup()
      } finally {
        await payload?.db?.destroy?.()
      }
    }, 60_000)

    it('serves a stored row from the public origin, by id and in a list', async () => {
      const bytes = await png()
      const created = await payload.create({
        collection: 'media',
        context,
        data: { alt: `${MARKER} restored` },
        file: {
          data: bytes,
          mimetype: 'image/png',
          name: `${MARKER}-restored.png`,
          size: bytes.byteLength,
        },
        overrideAccess: true,
      })
      try {
        // Mode off: Payload's own local-disk route.
        expect(created.url).toBe(
          `/api/media/file/${encodeURIComponent(created.filename ?? '')}`,
        )

        await withReadOnlyOrigin(async () => {
          const byId = await payload.findByID({
            collection: 'media',
            id: created.id,
            overrideAccess: true,
          })
          expect(byId.url).toBe(`${ORIGIN}/${created.filename}`)

          const list = await payload.find({
            collection: 'media',
            overrideAccess: true,
            where: { id: { equals: created.id } },
          })
          expect(list.docs[0]?.url).toBe(`${ORIGIN}/${created.filename}`)
        })
      } finally {
        await payload.delete({
          collection: 'media',
          context,
          id: created.id,
          overrideAccess: true,
        })
      }
    })

    it('refuses a real upload and writes no row', async () => {
      const before = await countMarked()
      const bytes = await png()
      await withReadOnlyOrigin(() =>
        expect(
          payload.create({
            collection: 'media',
            context,
            data: { alt: `${MARKER} refused` },
            file: {
              data: bytes,
              mimetype: 'image/png',
              name: `${MARKER}-refused.png`,
              size: bytes.byteLength,
            },
            overrideAccess: true,
          }),
        ).rejects.toMatchObject({
          message: READ_ONLY_MEDIA_UPLOAD_ERROR,
          status: 400,
        }),
      )
      expect(await countMarked()).toBe(before)
    })
  },
)
