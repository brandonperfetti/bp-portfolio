// @vitest-environment node
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseReferences } from '../scripts/media-backup'
import { MEDIA_STORAGE_COORDINATES_ERROR } from '../src/collections/Media'

/**
 * Media stays flat, and the backup fails closed when it is not (#339),
 * through the REAL Local API and the REAL references query on REAL Postgres.
 *
 * @remarks **Why this tier.** The unit suites pin the guard's decision table
 * (`src/collections/Media.test.ts`) and the parser's refusal
 * (`scripts/media-backup.test.ts`). Only here does Payload hand the guard the
 * stored doc for id and `where` updates, apply `prefix`'s default on a real
 * upload, and run the query in `scripts/media-backup-references.sql` against
 * the schema the committed migrations build — the `prefix` and `_objectkey`
 * columns #334 added.
 *
 * The release review (2026-11-15) measured both findings with the real
 * adapter hooks in memory: F1, a fileless `prefix` or `_objectKey` update
 * passed the guards and moved the row's URL; F2, the query projected only
 * `filename`, so a row stored at `prefix/_objectKey/filename` was checked at
 * the wrong key and could pass. These cases are those shapes.
 *
 * **Storage is local disk.** Like `media-create-guard-integration.test.ts`,
 * this file uploads fixtures and must run without `BLOB_READ_WRITE_TOKEN`;
 * the token-enabled schema case lives in
 * `media-storage-schema-integration.test.ts`, which writes no bytes.
 *
 * The query is run through Payload's own pool, not psql: the file's statement
 * from `with refs as (` to `order by ord;`, inside a `READ ONLY` transaction
 * as the file itself opens one. The psql meta-command and the transaction
 * wrapper are pinned by `scripts/media-backup-workflow.test.ts`.
 *
 * Other workers write flat Media rows in parallel; the query reads the whole
 * table, so these cases assert on the coordinates rows only, which no other
 * file ever writes. Each case unwinds its row in `try/finally`; the
 * `afterAll` sweep by `MARKER` is the backstop.
 */

const connectionString = process.env.DATABASE_URI

const MARKER = 'zz-media-storage-coordinates-integration'

/** Skip the Media afterChange revalidation: there is no Next request store. */
const context = { disableRevalidate: true }

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** The references query itself, without psql's meta-commands. */
const referencesQuery = (() => {
  const sql = readFileSync(
    path.join(repoRoot, 'scripts/media-backup-references.sql'),
    'utf8',
  )
  const start = sql.indexOf('with refs as (')
  const end = sql.indexOf('order by ord;')
  if (start < 0 || end < 0) throw new Error('references query not found')
  return sql.slice(start, end + 'order by ord'.length)
})()

type Pool = {
  connect: () => Promise<{
    query: (
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>
    release: () => void
  }>
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>
}

describe('media storage coordinates integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'Media storage coordinates (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let createLocalReq: typeof import('payload').createLocalReq
    let ambientOrigin: string | undefined
    const pool = () => (payload.db as unknown as { pool: Pool }).pool

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'media',
        context,
        overrideAccess: true,
        where: { alt: { like: `%${MARKER}%` } },
      })
    }

    beforeAll(async () => {
      ambientOrigin = process.env.STORAGE_VERCEL_BLOB_BASE_URL
      delete process.env.STORAGE_VERCEL_BLOB_BASE_URL
      const payloadModule = await import('payload')
      const { getPayload } = payloadModule
      createLocalReq = payloadModule.createLocalReq
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
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

    const png = () =>
      sharp({
        create: {
          width: 5,
          height: 3,
          channels: 3,
          background: { r: 10, g: 80, b: 40 },
        },
      })
        .png()
        .toBuffer()

    const upload = async (tag: string, extra: Record<string, unknown> = {}) => {
      const data = await png()
      return payload.create({
        collection: 'media',
        context,
        data: { alt: `${MARKER} ${tag}`, ...extra } as never,
        file: {
          data,
          mimetype: 'image/png',
          name: `${MARKER}-${tag}.png`,
          size: data.byteLength,
        },
        overrideAccess: true,
      })
    }

    const deleteRow = (id: number | string) =>
      payload.delete({ collection: 'media', context, id, overrideAccess: true })

    /** The stored columns, read with SQL so no hook reshapes them. */
    const storedCoordinates = async (id: number | string) => {
      const { rows } = await pool().query(
        'select filename, prefix, _objectkey from media where id = $1',
        [id],
      )
      return rows[0]
    }

    const countMarked = async () =>
      (
        await payload.count({
          collection: 'media',
          overrideAccess: true,
          where: { alt: { like: `%${MARKER}%` } },
        })
      ).totalDocs

    /** The references query's output, as psql -At would print it. */
    const runReferencesQuery = async () => {
      const client = await pool().connect()
      try {
        await client.query('begin transaction read only')
        const { rows } = await client.query(referencesQuery)
        await client.query('commit')
        return rows.map((row) => String(row.line)).join('\n')
      } finally {
        client.release()
      }
    }

    it('stores a normal upload flat: empty prefix, no object key', async () => {
      const row = await upload('flat')
      try {
        expect(await storedCoordinates(row.id)).toEqual({
          filename: row.filename,
          prefix: '',
          _objectkey: null,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it.each([
      ['prefix', 'zz-folder'],
      ['_objectKey', 'zz-key'],
    ])(
      'refuses an upload that supplies a non-empty `%s`, and writes no row',
      async (field, value) => {
        const before = await countMarked()
        await expect(
          upload(`create-${field}`, { [field]: value }),
        ).rejects.toMatchObject({
          message: MEDIA_STORAGE_COORDINATES_ERROR,
          status: 400,
        })
        expect(await countMarked()).toBe(before)
      },
    )

    it.each([
      ['prefix', 'other-folder'],
      ['_objectKey', 'other-key'],
    ])(
      'refuses a fileless `%s` update by id and by where, and leaves the row flat',
      async (field, value) => {
        const row = await upload(`update-${field}`)
        try {
          await expect(
            payload.update({
              collection: 'media',
              context,
              id: row.id,
              data: { [field]: value } as never,
              overrideAccess: true,
            }),
          ).rejects.toMatchObject({
            message: MEDIA_STORAGE_COORDINATES_ERROR,
            status: 400,
          })
          const bulk = await payload.update({
            collection: 'media',
            context,
            where: { id: { equals: row.id } },
            data: { [field]: value } as never,
            overrideAccess: true,
          })
          expect(bulk.docs).toEqual([])
          expect(bulk.errors).toEqual([
            expect.objectContaining({
              id: row.id,
              message: MEDIA_STORAGE_COORDINATES_ERROR,
            }),
          ])
          expect(await storedCoordinates(row.id)).toEqual({
            filename: row.filename,
            prefix: '',
            _objectkey: null,
          })
        } finally {
          await deleteRow(row.id)
        }
      },
    )

    /** The stored file on local disk, where this tier uploads. */
    const storedFile = (filename: string) =>
      path.resolve(
        (payload.collections.media.config.upload as { staticDir: string })
          .staticDir,
        filename,
      )

    const replacement = async () => {
      const data = await png()
      return {
        data,
        mimetype: 'image/png',
        name: `${MARKER}-replacement.png`,
        size: data.byteLength,
      }
    }

    // CodeRabbit round 1 on #340: Payload unlinks the stored file
    // (`deleteAssociatedFiles`) before collection beforeValidate hooks run
    // whenever an update carries a file, so a refusal made there would leave
    // the row naming a deleted file on local disk.
    it('refuses a replacement upload that sets a prefix, by id and by where, and keeps the original file', async () => {
      const row = await upload('replace-prefix')
      const file = storedFile(row.filename!)
      const before = await fs.readFile(file)
      try {
        await expect(
          payload.update({
            collection: 'media',
            context,
            id: row.id,
            data: { prefix: 'folder' } as never,
            file: await replacement(),
            overrideAccess: true,
          }),
        ).rejects.toMatchObject({
          message: MEDIA_STORAGE_COORDINATES_ERROR,
          status: 400,
        })
        expect(Buffer.compare(await fs.readFile(file), before)).toBe(0)
        await expect(
          payload.update({
            collection: 'media',
            context,
            where: { id: { equals: row.id } },
            data: { _objectKey: 'key' } as never,
            file: await replacement(),
            overrideAccess: true,
          }),
        ).rejects.toMatchObject({ message: MEDIA_STORAGE_COORDINATES_ERROR })
        expect(Buffer.compare(await fs.readFile(file), before)).toBe(0)
        expect(await storedCoordinates(row.id)).toEqual({
          filename: row.filename,
          prefix: '',
          _objectkey: null,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it('refuses an uploadEdits crop that sets a prefix, and keeps the original file', async () => {
      const row = await upload('crop-prefix')
      const file = storedFile(row.filename!)
      const before = await fs.readFile(file)
      try {
        const asRead = await payload.findByID({
          collection: 'media',
          depth: 0,
          id: row.id,
          overrideAccess: true,
        })
        const req = await createLocalReq({ context }, payload)
        ;(req as { query: Record<string, unknown> }).query = {
          uploadEdits: {
            crop: { x: 0, y: 0, width: 50, height: 50, unit: '%' },
            widthInPixels: 2,
            heightInPixels: 1,
          },
        }
        await expect(
          payload.update({
            collection: 'media',
            context,
            id: row.id,
            data: { ...asRead, prefix: 'folder' } as never,
            overrideAccess: true,
            req,
          }),
        ).rejects.toMatchObject({ message: MEDIA_STORAGE_COORDINATES_ERROR })
        expect(Buffer.compare(await fs.readFile(file), before)).toBe(0)
      } finally {
        await deleteRow(row.id)
      }
    })

    it('passes an alt edit and the doc round-tripped as read', async () => {
      const row = await upload('round-trip')
      try {
        const asRead = await payload.findByID({
          collection: 'media',
          depth: 0,
          id: row.id,
          overrideAccess: true,
        })
        const updated = await payload.update({
          collection: 'media',
          context,
          id: row.id,
          data: { ...asRead, alt: `${MARKER} round-trip, edited` } as never,
          overrideAccess: true,
        })
        expect(updated.alt).toBe(`${MARKER} round-trip, edited`)
        const altOnly = await payload.update({
          collection: 'media',
          context,
          where: { id: { equals: row.id } },
          data: { alt: `${MARKER} round-trip, bulk alt` },
          overrideAccess: true,
        })
        expect(altOnly.errors).toEqual([])
        expect(await storedCoordinates(row.id)).toMatchObject({
          prefix: '',
          _objectkey: null,
        })
      } finally {
        await deleteRow(row.id)
      }
    })

    it('makes the backup refuse a non-flat row instead of checking its filename', async () => {
      const row = await upload('backup')
      try {
        // Positive control: this row flat projects no coordinates.
        const flat = await runReferencesQuery()
        expect(flat).toContain(JSON.stringify(row.filename))
        expect(flat).not.toContain('"coordinates"')

        // The release review's F2 row: what the guard now refuses, written
        // the only way left, by SQL (a pre-guard write, a restore, a script).
        await pool().query(
          "update media set prefix = 'folder', _objectkey = 'key' where id = $1",
          [row.id],
        )
        const output = await runReferencesQuery()
        const coordinates = output
          .split('\n')
          .filter((line) => line.includes('"coordinates"'))
          .map((line) => JSON.parse(line))
        expect(coordinates).toEqual(
          expect.arrayContaining([
            { kind: 'coordinates', column: 'prefix' },
            { kind: 'coordinates', column: '_objectkey' },
          ]),
        )
        expect(output).not.toContain('"folder"')
        expect(output).not.toContain('"key"')
        expect(() => parseReferences(output)).toThrow(
          /storage coordinates? \(prefix or _objectKey\)/,
        )
      } finally {
        await pool().query(
          "update media set prefix = '', _objectkey = null where id = $1",
          [row.id],
        )
        await deleteRow(row.id)
      }
    })
  },
)
