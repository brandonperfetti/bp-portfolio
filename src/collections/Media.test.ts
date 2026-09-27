// @vitest-environment node
import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/revalidateCollection', () => ({
  revalidateCollectionTag: () => () => undefined,
  revalidateCollectionTagDelete: () => () => undefined,
}))

import {
  MEDIA_CREATE_WITHOUT_UPLOAD_ERROR,
  MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
  Media,
  refuseCreateWithoutUpload,
  refuseFilelessFileRewrite,
  refuseUploadEditsRefetch,
} from '@/collections/Media'

/**
 * The Media create and update guards (#242) at the hook boundary.
 *
 * @remarks This pins the decision table — which operation, which `req.file`,
 * which `data` — and that the hook is wired where it runs before Payload's
 * `generateFileData`. Whether a real create with a real file still succeeds,
 * and whether the refusal reaches a caller of the real Local API, is pinned one
 * tier down, against Postgres: `evals/media-create-guard-integration.test.ts`.
 */

type HookArgs = Parameters<typeof refuseCreateWithoutUpload>[0]

const METADATA = {
  alt: 'cover',
  url: 'https://store.public.blob.vercel-storage.com/cover-ds-A.png',
  filename: 'cover-ds-A.png',
  mimeType: 'image/png',
  width: 2048,
  height: 1152,
  filesize: 2326456,
}

const run = (
  operation: string,
  data: Record<string, unknown>,
  file?: PayloadRequest['file'],
) =>
  refuseCreateWithoutUpload({
    args: { data },
    operation,
    req: { file } as PayloadRequest,
  } as unknown as HookArgs)

const aFile = {
  data: Buffer.from([137, 80, 78, 71]),
  mimetype: 'image/png',
  name: 'cover.png',
  size: 4,
} as PayloadRequest['file']

describe('refuseCreateWithoutUpload (#242)', () => {
  it('refuses a create carrying the full metadata shape with no file — the staging-176 call', () => {
    expect(() => run('create', METADATA)).toThrow(
      MEDIA_CREATE_WITHOUT_UPLOAD_ERROR,
    )
  })

  it.each(['url', 'filename', 'mimeType', 'filesize', 'width', 'height'])(
    'refuses a fileless create carrying only `%s`',
    (field) => {
      expect(() =>
        run('create', {
          alt: 'x',
          [field]: METADATA[field as keyof typeof METADATA],
        }),
      ).toThrow(expect.objectContaining({ status: 400, isPublic: true }))
    },
  )

  it('names the ingest route, so an MCP caller relaying error.message learns the supported path', () => {
    expect(MEDIA_CREATE_WITHOUT_UPLOAD_ERROR).toContain(
      'POST /api/media/ingest',
    )
  })

  it('lets a create with a file through, whatever metadata it carries', () => {
    const args = run('create', METADATA, aFile)
    expect(args).toEqual({ data: METADATA })
  })

  it('lets a fileless create with no file metadata through (Payload then reports the missing file itself)', () => {
    expect(run('create', { alt: 'x' })).toEqual({ data: { alt: 'x' } })
    // The admin's Duplicate posts `{}`.
    expect(run('create', {})).toEqual({ data: {} })
  })

  it('never fires on an update, even one carrying file metadata', () => {
    expect(run('update', { alt: 'new alt', filename: 'x.png' })).toEqual({
      data: { alt: 'new alt', filename: 'x.png' },
    })
  })

  it('treats null metadata as absent', () => {
    expect(run('create', { alt: 'x', url: null })).toEqual({
      data: { alt: 'x', url: null },
    })
  })

  it('is wired as a beforeOperation hook, which runs before generateFileData', () => {
    // `includes` + `toBe(true)`, not `toContain`: `expect(undefined)
    // .toContain(fn)` PASSES on vitest 4.1 (measured while proving this test
    // fails without the wiring), so it cannot catch the hook being dropped.
    expect(
      Media.hooks?.beforeOperation?.includes(refuseCreateWithoutUpload),
    ).toBe(true)
  })
})

type UpdateHookArgs = Parameters<typeof refuseFilelessFileRewrite>[0]

const STORED = {
  id: 7,
  alt: 'cover',
  filename: 'my-post-cover-A.png',
  mimeType: 'image/png',
  filesize: 2326456,
  width: 2048,
  height: 1152,
  focalX: 50,
  focalY: 50,
}

const runUpdate = (
  data: Record<string, unknown>,
  {
    file,
    operation = 'update',
    context = {},
  }: {
    file?: PayloadRequest['file']
    operation?: string
    context?: Record<string, unknown>
  } = {},
) =>
  refuseFilelessFileRewrite({
    context,
    data,
    operation,
    originalDoc: STORED,
    req: { file } as PayloadRequest,
  } as unknown as UpdateHookArgs)

describe('refuseFilelessFileRewrite (#242, update path)', () => {
  it('refuses a fileless update that re-points filename away from the stored one', () => {
    expect(() => runUpdate({ filename: 'other-post-cover-A.png' })).toThrow(
      MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
    )
  })

  it('refuses the addendum-2 shape: url + new filename, no file', () => {
    expect(() =>
      runUpdate({
        url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        filename: 'zz-new.jpg',
      }),
    ).toThrow(expect.objectContaining({ status: 400, isPublic: true }))
  })

  it.each([
    ['mimeType', 'image/jpeg'],
    ['filesize', 999],
    ['width', 4096],
    ['height', 1],
  ])('refuses a fileless metadata-only rewrite of `%s`', (field, value) => {
    expect(() => runUpdate({ [field]: value })).toThrow(
      MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
    )
  })

  it('names the ingest route', () => {
    expect(MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR).toContain(
      'POST /api/media/ingest',
    )
  })

  it('passes alt and focal-point edits', () => {
    expect(runUpdate({ alt: 'new alt' })).toEqual({ alt: 'new alt' })
    expect(runUpdate({ focalX: 30, focalY: 70 })).toEqual({
      focalX: 30,
      focalY: 70,
    })
  })

  it('passes the file fields sent back unchanged (a client round-tripping the doc)', () => {
    const { id: _id, ...roundTrip } = STORED
    expect(runUpdate({ ...roundTrip, alt: 'edited' })).toEqual({
      ...roundTrip,
      alt: 'edited',
    })
    // A form may stringify numbers; the stored value is what counts.
    expect(runUpdate({ filesize: '2326456', width: '2048' })).toEqual({
      filesize: '2326456',
      width: '2048',
    })
  })

  it('passes a url-only update (Payload recomputes the stored url from filename; pinned on the pg tier)', () => {
    expect(runUpdate({ url: 'https://elsewhere.test/x.png' })).toEqual({
      url: 'https://elsewhere.test/x.png',
    })
  })

  it('passes any update that carries a file (a real re-upload)', () => {
    expect(
      runUpdate({ filename: 'replacement.png', filesize: 10 }, { file: aFile }),
    ).toEqual({ filename: 'replacement.png', filesize: 10 })
  })

  it("passes the storage adapter's own write-back (context.skipCloudStorage)", () => {
    expect(
      runUpdate(
        { filename: 'my-post-cover-A-x7Yz.png' },
        { context: { skipCloudStorage: true } },
      ),
    ).toEqual({ filename: 'my-post-cover-A-x7Yz.png' })
  })

  it('never fires on a create (the create guard owns that)', () => {
    expect(
      runUpdate({ filename: 'other.png' }, { operation: 'create' }),
    ).toEqual({ filename: 'other.png' })
  })

  it('is wired as a beforeValidate hook, where Payload hands it the stored doc', () => {
    expect(
      Media.hooks?.beforeValidate?.includes(refuseFilelessFileRewrite),
    ).toBe(true)
  })
})

type RefetchHookArgs = Parameters<typeof refuseUploadEditsRefetch>[0]

/** The row as `findByID` returns it — `url` already through `afterRead`. */
const AS_READ = {
  ...STORED,
  url: '/api/media/file/my-post-cover-A.png',
}

const CROP = {
  crop: { x: 0, y: 0, width: 50, height: 50, unit: '%' },
  widthInPixels: 1024,
  heightInPixels: 576,
}

const runRefetch = (
  args: Record<string, unknown>,
  {
    file,
    operation = 'update',
    query = { uploadEdits: CROP },
    stored = AS_READ,
  }: {
    file?: PayloadRequest['file']
    operation?: string
    query?: Record<string, unknown>
    stored?: Record<string, unknown> | null
  } = {},
) => {
  const findByID = vi.fn(async () => stored)
  const result = refuseUploadEditsRefetch({
    args,
    collection: { slug: 'media' },
    operation,
    req: { file, query, payload: { findByID } } as unknown as PayloadRequest,
  } as unknown as RefetchHookArgs)
  return { result, findByID }
}

describe('refuseUploadEditsRefetch (#270, update path under ?uploadEdits)', () => {
  it("refuses a crop whose body url is not the row's own — the re-fetch would pull it server-side", async () => {
    const { result } = runRefetch({
      id: 7,
      data: {
        url: 'https://attacker.example/x.png',
        filename: AS_READ.filename,
      },
    })
    await expect(result).rejects.toMatchObject({
      message: MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
      status: 400,
      isPublic: true,
    })
  })

  it('refuses a crop whose body filename names another file — the bytes would be written there', async () => {
    const { result } = runRefetch({
      id: 7,
      data: {
        url: '/api/media/file/other-post-cover.png',
        filename: 'other-post-cover.png',
      },
    })
    await expect(result).rejects.toThrow(MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR)
  })

  it('refuses a focal-point-only uploadEdits carrying a foreign url (a changed focal point re-fetches too)', async () => {
    const { result } = runRefetch(
      { id: 7, data: { url: 'https://attacker.example/x.png' } },
      { query: { uploadEdits: { focalPoint: { x: 10, y: 90 } } } },
    )
    await expect(result).rejects.toThrow(MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR)
  })

  it('refuses a where (bulk) update carrying url or filename under uploadEdits, without reading any row', async () => {
    const { result, findByID } = runRefetch({
      where: { id: { in: [7, 8] } },
      data: { url: AS_READ.url, filename: AS_READ.filename },
    })
    await expect(result).rejects.toThrow(MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR)
    expect(findByID).not.toHaveBeenCalled()
  })

  it("passes the admin's crop: the doc as read, both fields matching the stored row", async () => {
    const { id: _id, ...asRead } = AS_READ
    const args = { id: 7, data: { ...asRead, alt: 'cover' } }
    const { result, findByID } = runRefetch(args)
    await expect(result).resolves.toBe(args)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media', id: 7, depth: 0 }),
    )
  })

  it("passes the admin's focal-point edit sent with uploadEdits and the doc as read", async () => {
    const { id: _id, ...asRead } = AS_READ
    const args = { id: 7, data: { ...asRead, focalX: 10, focalY: 90 } }
    const { result } = runRefetch(args, {
      query: { uploadEdits: { focalPoint: { x: 10, y: 90 } } },
    })
    await expect(result).resolves.toBe(args)
  })

  it('passes an update with neither url nor filename (Payload has nothing to fetch), without reading the row', async () => {
    const args = { id: 7, data: { alt: 'new alt' } }
    const { result, findByID } = runRefetch(args)
    await expect(result).resolves.toBe(args)
    expect(findByID).not.toHaveBeenCalled()
  })

  it('ignores updates without an uploadEdits object, updates with a file, and creates', async () => {
    const foreign = {
      id: 7,
      data: { url: 'https://attacker.example/x.png', filename: 'x.png' },
    }
    for (const opts of [
      { query: {} },
      { query: { uploadEdits: 'crop' } },
      { file: aFile },
      { operation: 'create' },
    ]) {
      const { result, findByID } = runRefetch(foreign, opts)
      await expect(result).resolves.toBe(foreign)
      expect(findByID).not.toHaveBeenCalled()
    }
  })

  it('leaves an id that finds no row to Payload, which 404s before it would fetch', async () => {
    const args = { id: 999, data: { url: 'https://attacker.example/x.png' } }
    const { result } = runRefetch(args, { stored: null })
    await expect(result).resolves.toBe(args)
  })

  it('is wired as a beforeOperation hook, which runs before generateFileData re-fetches', () => {
    expect(
      Media.hooks?.beforeOperation?.includes(refuseUploadEditsRefetch),
    ).toBe(true)
  })
})
