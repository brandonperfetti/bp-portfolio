import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ create: createMock })),
}))
vi.mock('@payload-config', () => ({ default: {} }))

import { POST } from '@/app/api/media/ingest/route'

/**
 * Validation-path suite for the agent media-ingest route. The happy path
 * (Blob write) is exercised against staging post-deploy; these tests pin
 * the guard rails: secret, alt, URL shape, host allowlist, content type.
 */

const makeRequest = (body: unknown) =>
  new Request('https://example.test/api/media/ingest', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

const SECRET = 'test-ingest-secret'

beforeEach(() => {
  vi.stubEnv('CMS_REVALIDATE_SECRET', SECRET)
  createMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/media/ingest', () => {
  it('rejects a missing or wrong secret', async () => {
    const res = await POST(makeRequest({ secret: 'nope', url: 'x', alt: 'y' }))
    expect(res.status).toBe(401)
  })

  it('rejects a missing alt', async () => {
    const res = await POST(
      makeRequest({
        secret: SECRET,
        url: 'https://res.cloudinary.com/demo/image/upload/a.png',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects an unparseable url', async () => {
    const res = await POST(
      makeRequest({ secret: SECRET, url: 'not a url', alt: 'cover' }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects hosts outside the allowlist (SSRF guard)', async () => {
    const res = await POST(
      makeRequest({
        secret: SECRET,
        url: 'https://evil.example/image.png',
        alt: 'cover',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects non-image content types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html></html>', {
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    const res = await POST(
      makeRequest({
        secret: SECRET,
        url: 'https://res.cloudinary.com/demo/raw/upload/page.html',
        alt: 'cover',
      }),
    )
    expect(res.status).toBe(415)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('creates a media doc from an allowlisted image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'content-type': 'image/png' },
          }),
      ),
    )
    createMock.mockResolvedValue({
      id: 99,
      url: 'https://examplestore.public.blob.vercel-storage.com/my-post-cover-A.png',
      filename: 'my-post-cover-A.png',
    })

    const res = await POST(
      makeRequest({
        secret: SECRET,
        url: 'https://res.cloudinary.com/demo/image/upload/v1/bp-portfolio/images/articles/my-post/cover-A.png',
        alt: 'Cover for my post',
      }),
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      ok: boolean
      media: { id: number; filename: string }
    }
    expect(json.ok).toBe(true)
    expect(json.media.id).toBe(99)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        data: { alt: 'Cover for my post' },
        file: expect.objectContaining({
          name: 'my-post-cover-A.png',
          mimetype: 'image/png',
        }),
      }),
    )
  })
})
