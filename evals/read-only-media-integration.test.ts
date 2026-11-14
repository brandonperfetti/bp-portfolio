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
 * that a real upload is refused before any row is written, and so is a file
 * Payload makes itself after `beforeOperation` (a duplicate), and a crop under
 * `?uploadEdits`, which is refused before Payload fetches the image. The
 * developer's own `STORAGE_VERCEL_BLOB_BASE_URL` is cleared for the run, so
 * fixtures always upload to local disk.
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

    /** The developer's own setting, cleared so fixtures upload to local disk. */
    let ambientOrigin: string | undefined

    beforeAll(async () => {
      ambientOrigin = process.env.STORAGE_VERCEL_BLOB_BASE_URL
      delete process.env.STORAGE_VERCEL_BLOB_BASE_URL
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
        if (ambientOrigin !== undefined) {
          process.env.STORAGE_VERCEL_BLOB_BASE_URL = ambientOrigin
        }
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

    it('refuses a duplicate, whose file Payload makes after beforeOperation', async () => {
      // Duplicate enters create with no file; generateFileData copies the
      // source row's bytes and sets req.file later, so only the beforeValidate
      // guard sees it. The source row is written with the mode off, so its
      // bytes are on local disk and the copy would otherwise succeed.
      const bytes = await png()
      const source = await payload.create({
        collection: 'media',
        context,
        data: { alt: `${MARKER} duplicate-source` },
        file: {
          data: bytes,
          mimetype: 'image/png',
          name: `${MARKER}-duplicate.png`,
          size: bytes.byteLength,
        },
        overrideAccess: true,
      })
      try {
        const before = await countMarked()
        await withReadOnlyOrigin(() =>
          expect(
            payload.duplicate({
              collection: 'media',
              context,
              id: source.id,
              overrideAccess: true,
            }),
          ).rejects.toMatchObject({
            message: READ_ONLY_MEDIA_UPLOAD_ERROR,
            status: 400,
          }),
        )
        expect(await countMarked()).toBe(before)
      } finally {
        await payload.delete({
          collection: 'media',
          context,
          id: source.id,
          overrideAccess: true,
        })
      }
    })

    it('refuses a crop of a stored row and leaves its file as it was', async () => {
      // A crop under ?uploadEdits makes Payload fetch the image and, in an
      // update, write the new bytes BEFORE beforeChange runs, so it must be
      // refused before generateFileData. The Local API has no query string;
      // the request carries uploadEdits as REST would parse it.
      const bytes = await png()
      const row = await payload.create({
        collection: 'media',
        context,
        data: { alt: `${MARKER} crop` },
        file: {
          data: bytes,
          mimetype: 'image/png',
          name: `${MARKER}-crop.png`,
          size: bytes.byteLength,
        },
        overrideAccess: true,
      })
      try {
        const { createLocalReq } = await import('payload')
        const req = await createLocalReq({ context }, payload)
        ;(req as { query: Record<string, unknown> }).query = {
          uploadEdits: {
            crop: { x: 0, y: 0, width: 50, height: 50, unit: '%' },
            heightInPixels: 1,
            widthInPixels: 2,
          },
        }
        await withReadOnlyOrigin(async () => {
          const { createdAt, id, updatedAt, ...asRead } =
            await payload.findByID({
              collection: 'media',
              id: row.id,
              overrideAccess: true,
            })
          void createdAt
          void id
          void updatedAt
          await expect(
            payload.update({
              collection: 'media',
              context,
              data: asRead as never,
              id: row.id,
              overrideAccess: true,
              req,
            }),
          ).rejects.toMatchObject({
            message: READ_ONLY_MEDIA_UPLOAD_ERROR,
            status: 400,
          })
        })
        const after = await payload.findByID({
          collection: 'media',
          id: row.id,
          overrideAccess: true,
        })
        expect(after).toMatchObject({
          filesize: row.filesize,
          height: row.height,
          width: row.width,
        })
      } finally {
        await payload.delete({
          collection: 'media',
          context,
          id: row.id,
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
