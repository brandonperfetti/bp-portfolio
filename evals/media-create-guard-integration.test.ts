// @vitest-environment node
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MEDIA_CREATE_WITHOUT_UPLOAD_ERROR } from '../src/collections/Media'

/**
 * The Media create guard (#242) through the REAL Local API on REAL Postgres.
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
  },
)
