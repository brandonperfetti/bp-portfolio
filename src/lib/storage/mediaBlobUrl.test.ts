import { describe, expect, it } from 'vitest'

import { buildMediaBlobUrl, getMediaBlobBaseUrl } from './mediaBlobUrl'

const TOKEN = 'vercel_blob_rw_AbCd1234_secretsecret'
const BASE = 'https://abcd1234.public.blob.vercel-storage.com'

describe('getMediaBlobBaseUrl', () => {
  it('derives the lowercased public store origin from the token', () => {
    expect(getMediaBlobBaseUrl(TOKEN, undefined)).toBe(BASE)
  })

  it('honors the emulator override and strips a trailing slash', () => {
    expect(getMediaBlobBaseUrl(TOKEN, 'http://127.0.0.1:9966/')).toBe(
      'http://127.0.0.1:9966',
    )
  })

  it('returns null for a missing or malformed token', () => {
    expect(getMediaBlobBaseUrl(undefined, undefined)).toBeNull()
    expect(getMediaBlobBaseUrl('not-a-token', undefined)).toBeNull()
  })
})

describe('buildMediaBlobUrl', () => {
  it('builds an absolute public blob URL, encoding only the filename', () => {
    expect(
      buildMediaBlobUrl({ filename: 'og-default-2048.png', baseUrl: BASE }),
    ).toBe(`${BASE}/og-default-2048.png`)
  })

  it('percent-encodes spaces in the filename', () => {
    expect(buildMediaBlobUrl({ filename: 'my file.jpg', baseUrl: BASE })).toBe(
      `${BASE}/my%20file.jpg`,
    )
  })

  it('keeps a prefix segment unencoded and encodes only the basename', () => {
    expect(
      buildMediaBlobUrl({
        filename: 'a b.jpg',
        prefix: 'covers',
        baseUrl: BASE,
      }),
    ).toBe(`${BASE}/covers/a%20b.jpg`)
  })

  it('falls back to the Payload-served route when no origin resolves', () => {
    expect(buildMediaBlobUrl({ filename: 'x y.png', baseUrl: null })).toBe(
      '/api/media/file/x%20y.png',
    )
  })
})
