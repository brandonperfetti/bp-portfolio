// @vitest-environment node
import type { PayloadRequest } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/revalidateCollection', () => ({
  revalidateCollectionTag: () => () => undefined,
  revalidateCollectionTagDelete: () => () => undefined,
}))

import { Media } from '@/collections/Media'

import {
  READ_ONLY_MEDIA_UPLOAD_ERROR,
  getReadOnlyMediaBaseUrl,
  pointMediaUrlAtReadOnlyOrigin,
  refuseFileWriteInReadOnlyMedia,
  refuseUploadInReadOnlyMedia,
} from './readOnlyMedia'

const TOKEN = 'vercel_blob_rw_AbCd1234_secretsecret'
const ORIGIN = 'https://abcd1234.public.blob.vercel-storage.com'

type ReadArgs = Parameters<typeof pointMediaUrlAtReadOnlyOrigin>[0]
type OpArgs = Parameters<typeof refuseUploadInReadOnlyMedia>[0]

const aFile = {
  data: Buffer.from([137, 80, 78, 71]),
  mimetype: 'image/png',
  name: 'cover.png',
  size: 4,
} as PayloadRequest['file']

const read = (doc: Record<string, unknown>) =>
  pointMediaUrlAtReadOnlyOrigin({ doc } as unknown as ReadArgs)

const op = (operation: string, file?: PayloadRequest['file']) =>
  refuseUploadInReadOnlyMedia({
    args: { data: {} },
    operation,
    req: { file } as PayloadRequest,
  } as unknown as OpArgs)

// The hooks read process.env; start every case from a blank blob env so a
// real token in the shell cannot leak in.
beforeEach(() => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')
  vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getReadOnlyMediaBaseUrl (#328)', () => {
  it('is on with an origin and no token, and strips a trailing slash', () => {
    expect(getReadOnlyMediaBaseUrl(undefined, `${ORIGIN}/`)).toBe(ORIGIN)
    expect(getReadOnlyMediaBaseUrl('', ORIGIN)).toBe(ORIGIN)
  })

  it('is off with a token, which hands URLs and uploads to the storage plugin', () => {
    expect(getReadOnlyMediaBaseUrl(TOKEN, ORIGIN)).toBeNull()
  })

  it('is off with no origin (plain local disk)', () => {
    expect(getReadOnlyMediaBaseUrl(undefined, undefined)).toBeNull()
    expect(getReadOnlyMediaBaseUrl('', '')).toBeNull()
  })
})

describe('pointMediaUrlAtReadOnlyOrigin (#328)', () => {
  it('points a restored row at the public store origin', () => {
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(
      read({ filename: 'my post-cover.png', url: '/api/media/file/x' }).url,
    ).toBe(`${ORIGIN}/my%20post-cover.png`)
  })

  it('leaves the url alone when a token is set (the plugin computes it)', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN)
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(read({ filename: 'a.png', url: 'plugin-url' }).url).toBe(
      'plugin-url',
    )
  })

  it('leaves the url alone with no origin (local disk serves it)', () => {
    expect(read({ filename: 'a.png', url: '/api/media/file/a.png' }).url).toBe(
      '/api/media/file/a.png',
    )
  })

  it('leaves a row without a filename alone', () => {
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(read({ url: null })).toEqual({ url: null })
  })
})

describe('refuseUploadInReadOnlyMedia (#328)', () => {
  it('refuses a create or update that carries a file', () => {
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(() => op('create', aFile)).toThrow(READ_ONLY_MEDIA_UPLOAD_ERROR)
    expect(() => op('update', aFile)).toThrow(READ_ONLY_MEDIA_UPLOAD_ERROR)
  })

  it('names the way out, so the admin user knows how to upload locally', () => {
    expect(READ_ONLY_MEDIA_UPLOAD_ERROR).toContain(
      'Clear STORAGE_VERCEL_BLOB_BASE_URL',
    )
  })

  it('lets fileless edits and deletes through', () => {
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(op('update')).toEqual({ data: {} })
    expect(op('delete')).toEqual({ data: {} })
  })

  it('lets uploads through when the mode is off, with or without a token', () => {
    expect(op('create', aFile)).toEqual({ data: {} })
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN)
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(op('create', aFile)).toEqual({ data: {} })
  })
})

type ChangeArgs = Parameters<typeof refuseFileWriteInReadOnlyMedia>[0]

const change = (file?: PayloadRequest['file']) =>
  refuseFileWriteInReadOnlyMedia({
    data: { alt: 'x' },
    operation: 'update',
    req: { file } as PayloadRequest,
  } as unknown as ChangeArgs)

describe('refuseFileWriteInReadOnlyMedia (#328, files Payload makes late)', () => {
  it('refuses a file set after beforeOperation (a crop, focal re-upload or duplicate)', () => {
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(() => change(aFile)).toThrow(READ_ONLY_MEDIA_UPLOAD_ERROR)
  })

  it('lets a fileless change through, and every change when the mode is off', () => {
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', ORIGIN)
    expect(change()).toEqual({ alt: 'x' })
    vi.stubEnv('STORAGE_VERCEL_BLOB_BASE_URL', '')
    expect(change(aFile)).toEqual({ alt: 'x' })
  })
})

describe('Media wiring (#328)', () => {
  it('runs the upload refusal first among beforeOperation hooks', () => {
    expect(Media.hooks?.beforeOperation?.[0]).toBe(refuseUploadInReadOnlyMedia)
  })

  it('guards file writes in beforeChange, after generateFileData', () => {
    expect(
      Media.hooks?.beforeChange?.includes(refuseFileWriteInReadOnlyMedia),
    ).toBe(true)
  })

  it('rewrites the url in a collection afterRead hook, after the field hooks', () => {
    // `includes` + `toBe(true)`: `expect(undefined).toContain(fn)` passes on
    // vitest 4.1 (see Media.test.ts), so it cannot catch a dropped hook.
    expect(
      Media.hooks?.afterRead?.includes(pointMediaUrlAtReadOnlyOrigin),
    ).toBe(true)
  })
})
