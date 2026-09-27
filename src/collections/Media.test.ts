// @vitest-environment node
import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/revalidateCollection', () => ({
  revalidateCollectionTag: () => () => undefined,
  revalidateCollectionTagDelete: () => () => undefined,
}))

import {
  MEDIA_CREATE_WITHOUT_UPLOAD_ERROR,
  Media,
  refuseCreateWithoutUpload,
} from '@/collections/Media'

/**
 * The Media create guard (#242) at the hook boundary.
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
