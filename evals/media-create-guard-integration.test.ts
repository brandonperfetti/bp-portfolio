// @vitest-environment node
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  MEDIA_CREATE_WITHOUT_UPLOAD_ERROR,
  MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
  MEDIA_UPLOAD_EDITS_REFETCH_ERROR,
} from '../src/collections/Media'

/**
 * The Media create and update guards (#242) through the REAL Local API on
 * REAL Postgres.
 *
 * @remarks **Why this tier and not only the unit test.** The unit suite
 * (`src/collections/Media.test.ts`) pins the hook's decision table, but can
 * only fake `req.file`. What matters is that the Local API a real caller uses
 * — the same `payload.create` the MCP `createMedia` tool, the ingest route and
 * the scripts call — reaches the hook with `req.file` set when a `file` is
 * passed and unset when it is not, and that the refusal arrives before
 * Payload's `generateFileData` (which, given a `filename` + `url` and no file,
 * would otherwise fetch that URL itself). The three cases are the ticket's
 * AC-1: metadata-only create refused, create with a file accepted, `alt`
 * update of an existing row accepted.
 *
 * The update cases (added 2026-09-27) pin `refuseFilelessFileRewrite`: a
 * fileless update that re-points `filename` — by id and by `where`, the two
 * shapes the MCP `updateMedia` tool sends — or rewrites a file-metadata field
 * is refused and leaves the row as it was; `alt`, focal-point and
 * same-values updates pass. Only this tier shows Payload hands the hook the
 * stored doc as `originalDoc` for both shapes.
 *
 * The `url`-column case (added 2026-09-27, CodeRabbit round 1 on #271) pins
 * why `url` is not one of the update guard's fields: a fileless update that
 * sends only a new `url`, by id or by `where`, leaves the STORED column at the
 * filename-derived path — read with SQL, because `afterRead` recomputes the
 * returned `url` and so cannot show what was written.
 *
 * The `uploadEdits` cases (added 2026-09-27, #270, CodeRabbit round 1 on
 * #271) pin `refuseUploadEditsRefetch`: under an `uploadEdits` query Payload
 * re-fetches the file from the body's `url`/`filename` and sets `req.file`,
 * which walks past the guard above. The Local API has no query string, so
 * each case hands Payload a `req` whose `query` carries `uploadEdits` — what
 * `generateFileData` reads, and what REST's `?uploadEdits[...]` parses to.
 * The foreign `url` is `http://127.0.0.1:9/…`: without the guard Payload's
 * `safeFetch` refuses the loopback address before any socket opens, so the
 * run touches no network and the guard's own text is what tells "refused by
 * the guard" from "refused by the fetch". The foreign-`filename` case reads
 * the other row's bytes from local disk, so it assumes the tier's local-disk
 * storage (below).
 *
 * The refused case's `url` is on the reserved `.invalid` TLD: with the hook
 * removed, Payload tries to fetch it and fails with a `FileRetrievalError`,
 * so the assertion on the guard's own text is what distinguishes "refused by
 * the guard" from "refused because the fetch failed". (Without the guard, a
 * FETCHABLE url is stored under the caller's `filename` — measured on local
 * disk 2026-09-27; see the hook's remarks.)
 *
 * **Storage is wherever `BLOB_READ_WRITE_TOKEN` points.** The gate unsets it
 * and CI has none, so uploads land on local disk (`media/`). But
 * `docs/WORKFLOW.md` § Local database asks for that token to be set locally,
 * and if it is exported when this file runs, the with-file case uploads to
 * (and its cleanup deletes from) the shared Blob store that staging and
 * production use. Run this tier without it.
 *
 * Runs in the pg tier (`vitest run --root evals`) with `DATABASE_URI` set.
 * Each case unwinds its own row in `try/finally` (deleting a Media row also
 * removes its upload); the `afterAll` sweep by `MARKER` in `alt` is only the
 * backstop for a run that died mid-case.
 */

const connectionString = process.env.DATABASE_URI

/** Marks every row this file writes, for exact cleanup. */
const MARKER = 'zz-media-create-guard-integration'

/** Skip the Media afterChange revalidation: there is no Next request store. */
const context = { disableRevalidate: true }

describe('media create guard integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'Media create guard (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let createLocalReq: typeof import('payload').createLocalReq

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

    beforeAll(async () => {
      const payloadModule = await import('payload')
      createLocalReq = payloadModule.createLocalReq
      const { default: config } = await import('../src/payload.config')
      payload = await payloadModule.getPayload({ config })
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

    it('refuses the metadata-only create that minted staging media 176, and writes no row', async () => {
      const before = await countMarked()
      await expect(
        payload.create({
          collection: 'media',
          context,
          data: {
            alt: `${MARKER} metadata-only`,
            url: 'https://store.invalid/cover-ds-A.png',
            filename: `${MARKER}-cover-ds-A.png`,
            mimeType: 'image/png',
            width: 2048,
            height: 1152,
            filesize: 2326456,
          } as never,
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({
        message: MEDIA_CREATE_WITHOUT_UPLOAD_ERROR,
        status: 400,
      })
      expect(await countMarked()).toBe(before)
    })

    it('accepts a create with a file, then an alt update of that row', async () => {
      const png = await sharp({
        create: {
          width: 4,
          height: 3,
          channels: 3,
          background: { r: 20, g: 40, b: 60 },
        },
      })
        .png()
        .toBuffer()

      const created = await payload.create({
        collection: 'media',
        context,
        data: { alt: `${MARKER} with-file` },
        file: {
          data: png,
          mimetype: 'image/png',
          name: `${MARKER}-real.png`,
          size: png.byteLength,
        },
        overrideAccess: true,
      })
      try {
        expect(created).toMatchObject({
          mimeType: 'image/png',
          width: 4,
          height: 3,
          filesize: png.byteLength,
        })
        expect(created.filename).toContain(MARKER)

        const updated = await payload.update({
          collection: 'media',
          context,
          id: created.id,
          data: { alt: `${MARKER} with-file, alt edited` },
          overrideAccess: true,
        })
        expect(updated.alt).toBe(`${MARKER} with-file, alt edited`)
        expect(updated.filename).toBe(created.filename)
      } finally {
        await payload.delete({
          collection: 'media',
          context,
          id: created.id,
          overrideAccess: true,
        })
      }
    })

    /** A file-backed row for one case; the caller deletes it in `finally`. */
    const createRow = async (tag: string) => {
      const png = await sharp({
        create: {
          width: 6,
          height: 4,
          channels: 3,
          background: { r: 90, g: 30, b: 30 },
        },
      })
        .png()
        .toBuffer()
      return payload.create({
        collection: 'media',
        context,
        data: { alt: `${MARKER} ${tag}` },
        file: {
          data: png,
          mimetype: 'image/png',
          name: `${MARKER}-${tag}.png`,
          size: png.byteLength,
        },
        overrideAccess: true,
      })
    }

    const deleteRow = (id: number | string) =>
      payload.delete({ collection: 'media', context, id, overrideAccess: true })

    const reread = (id: number | string) =>
      payload.findByID({
        collection: 'media',
        depth: 0,
        id,
        overrideAccess: true,
      })

    it('refuses a fileless update that re-points filename (the updateMedia shape), and leaves the row as it was', async () => {
      const row = await createRow('repoint')
      try {
        await expect(
          payload.update({
            collection: 'media',
            context,
            id: row.id,
            data: {
              url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
              filename: `${MARKER}-repointed.jpg`,
            } as never,
            overrideAccess: true,
          }),
        ).rejects.toMatchObject({
          message: MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
          status: 400,
        })
        expect(await reread(row.id)).toMatchObject({
          filename: row.filename,
          mimeType: 'image/png',
          width: 6,
          height: 4,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it('refuses the same re-point sent as a where-update, per document', async () => {
      const row = await createRow('repoint-where')
      try {
        const result = await payload.update({
          collection: 'media',
          context,
          where: { id: { equals: row.id } },
          data: { filename: `${MARKER}-repointed-where.png` } as never,
          overrideAccess: true,
        })
        expect(result.docs).toEqual([])
        expect(result.errors).toEqual([
          expect.objectContaining({
            id: row.id,
            message: MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
          }),
        ])
        expect((await reread(row.id)).filename).toBe(row.filename)
      } finally {
        await deleteRow(row.id)
      }
    })

    it('refuses a fileless metadata-only rewrite', async () => {
      const row = await createRow('metadata')
      try {
        await expect(
          payload.update({
            collection: 'media',
            context,
            id: row.id,
            data: {
              mimeType: 'image/jpeg',
              width: 2048,
              height: 1152,
            } as never,
            overrideAccess: true,
          }),
        ).rejects.toMatchObject({ message: MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR })
        expect(await reread(row.id)).toMatchObject({
          mimeType: 'image/png',
          width: 6,
          height: 4,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it('passes a focal-point update', async () => {
      const row = await createRow('focal')
      try {
        const updated = await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: { focalX: 30, focalY: 70 },
          overrideAccess: true,
        })
        expect(updated).toMatchObject({
          focalX: 30,
          focalY: 70,
          filename: row.filename,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it('passes an update that sends the stored file fields back unchanged, with an alt edit', async () => {
      const row = await createRow('same-values')
      try {
        const updated = await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: {
            alt: `${MARKER} same-values, alt edited`,
            filename: row.filename,
            mimeType: row.mimeType,
            filesize: row.filesize,
            width: row.width,
            height: row.height,
          } as never,
          overrideAccess: true,
        })
        expect(updated).toMatchObject({
          alt: `${MARKER} same-values, alt edited`,
          filename: row.filename,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    /** A request whose query carries `uploadEdits`, as REST would parse it. */
    const reqWithUploadEdits = async (uploadEdits: Record<string, unknown>) => {
      const req = await createLocalReq({ context }, payload)
      ;(req as { query: Record<string, unknown> }).query = { uploadEdits }
      return req
    }

    /** Crop the 6×4 fixture to its top-left 3×2. */
    const CROP = {
      crop: { x: 0, y: 0, width: 50, height: 50, unit: '%' },
      widthInPixels: 3,
      heightInPixels: 2,
    }

    /** The doc as the admin's edit view holds it, minus what it never posts. */
    const asRead = async (id: number | string) => {
      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...body
      } = await reread(id)
      return body
    }

    it("refuses an uploadEdits crop whose body url is not the row's own, before Payload fetches it", async () => {
      const row = await createRow('refetch-url')
      try {
        await expect(
          payload.update({
            collection: 'media',
            context,
            id: row.id,
            data: {
              url: 'http://127.0.0.1:9/zz-refetch.png',
              filename: row.filename,
            } as never,
            overrideAccess: true,
            req: await reqWithUploadEdits(CROP),
          }),
        ).rejects.toMatchObject({
          message: MEDIA_UPLOAD_EDITS_REFETCH_ERROR,
          status: 400,
        })
        expect(await reread(row.id)).toMatchObject({
          filename: row.filename,
          width: 6,
          height: 4,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it("refuses an uploadEdits crop whose body filename names another row's file, and leaves that file's bytes alone", async () => {
      const victim = await createRow('refetch-victim')
      const attacker = await createRow('refetch-attacker')
      try {
        const upload = payload.collections.media.config.upload as {
          staticDir: string
        }
        const victimPath = path.resolve(upload.staticDir, victim.filename!)
        const before = await fs.readFile(victimPath)
        const refusal = await payload
          .update({
            collection: 'media',
            context,
            id: attacker.id,
            data: {
              url: `/api/media/file/${victim.filename}`,
              filename: victim.filename,
            } as never,
            overrideAccess: true,
            req: await reqWithUploadEdits(CROP),
          })
          .catch((error: unknown) => error)
        // First, because it is the harm: without the guard this file is
        // overwritten with the 3×2 crop even though the update then fails
        // `filename`'s unique check (measured 2026-09-27).
        expect(Buffer.compare(await fs.readFile(victimPath), before)).toBe(0)
        expect(refusal).toMatchObject({
          message: MEDIA_UPLOAD_EDITS_REFETCH_ERROR,
          status: 400,
        })
        expect((await reread(attacker.id)).filename).toBe(attacker.filename)
      } finally {
        await deleteRow(victim.id)
        await deleteRow(attacker.id)
      }
    })

    it('refuses a where-update carrying url and filename under uploadEdits', async () => {
      const row = await createRow('refetch-where')
      try {
        await expect(
          payload.update({
            collection: 'media',
            context,
            where: { id: { equals: row.id } },
            data: {
              url: 'http://127.0.0.1:9/zz-refetch-where.png',
              filename: row.filename,
            } as never,
            overrideAccess: true,
            req: await reqWithUploadEdits(CROP),
          }),
        ).rejects.toMatchObject({ message: MEDIA_UPLOAD_EDITS_REFETCH_ERROR })
        expect(await reread(row.id)).toMatchObject({ width: 6, height: 4 })
      } finally {
        await deleteRow(row.id)
      }
    })

    it("passes the admin's crop: the doc as read, posted with uploadEdits", async () => {
      const row = await createRow('admin-crop')
      try {
        const updated = await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: (await asRead(row.id)) as never,
          overrideAccess: true,
          req: await reqWithUploadEdits(CROP),
        })
        expect(updated).toMatchObject({
          filename: row.filename,
          width: 3,
          height: 2,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it("passes the admin's focal-point edit: the doc as read, posted with uploadEdits", async () => {
      const row = await createRow('admin-focal')
      try {
        const updated = await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: (await asRead(row.id)) as never,
          overrideAccess: true,
          req: await reqWithUploadEdits({ focalPoint: { x: 20, y: 80 } }),
        })
        expect(updated).toMatchObject({
          filename: row.filename,
          focalX: 20,
          focalY: 80,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it("passes the admin's alt edit: the doc as read, url included, no uploadEdits", async () => {
      const row = await createRow('admin-alt')
      try {
        const updated = await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: {
            ...(await asRead(row.id)),
            alt: `${MARKER} admin-alt, edited`,
          } as never,
          overrideAccess: true,
        })
        expect(updated).toMatchObject({
          alt: `${MARKER} admin-alt, edited`,
          filename: row.filename,
          url: row.url,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it('stores no caller-sent url: a fileless url-only update, by id and by where, leaves the url column filename-derived', async () => {
      const row = await createRow('url-column')
      const storedUrl = async () => {
        const { pool } = payload.db as unknown as {
          pool: {
            query: (
              text: string,
              values: unknown[],
            ) => Promise<{ rows: { url: string }[] }>
          }
        }
        const result = await pool.query('SELECT url FROM media WHERE id = $1', [
          row.id,
        ])
        return result.rows[0]?.url
      }
      try {
        const expected = `/api/media/file/${row.filename}`
        expect(await storedUrl()).toBe(expected)
        await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: { url: 'https://attacker.example/by-id.png' } as never,
          overrideAccess: true,
        })
        expect(await storedUrl()).toBe(expected)
        const byWhere = await payload.update({
          collection: 'media',
          context,
          where: { id: { equals: row.id } },
          data: { url: 'https://attacker.example/by-where.png' } as never,
          overrideAccess: true,
        })
        expect(byWhere.errors).toEqual([])
        expect(await storedUrl()).toBe(expected)
      } finally {
        await deleteRow(row.id)
      }
    })
  },
)
