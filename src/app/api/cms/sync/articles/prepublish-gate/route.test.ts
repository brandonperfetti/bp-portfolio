import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  evaluateSourceArticlePublishGate: vi.fn(),
}))

vi.mock('@/lib/cms/notion/projectionSync', () => ({
  evaluateSourceArticlePublishGate: mocks.evaluateSourceArticlePublishGate,
}))

import { POST } from './route'

describe('POST /api/cms/sync/articles/prepublish-gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CMS_REVALIDATE_SECRET = 'test-secret'
  })

  it('returns 401 when secret is invalid', async () => {
    const request = new Request(
      'http://localhost/api/cms/sync/articles/prepublish-gate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'wrong-secret',
          sourcePageId: 'source-123',
        }),
      },
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ ok: false, error: 'Unauthorized' })
    expect(mocks.evaluateSourceArticlePublishGate).not.toHaveBeenCalled()
  })

  it('returns 400 when sourcePageId is missing', async () => {
    const request = new Request(
      'http://localhost/api/cms/sync/articles/prepublish-gate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'test-secret',
        }),
      },
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ ok: false, error: 'sourcePageId is required' })
    expect(mocks.evaluateSourceArticlePublishGate).not.toHaveBeenCalled()
  })

  it('returns 200 when gate passes and includes persistence metadata', async () => {
    mocks.evaluateSourceArticlePublishGate.mockResolvedValue({
      ok: true,
      sourcePageId: 'source-123',
      sourceStatus: 'Ready to Publish',
      reasons: [],
      seoGatePersisted: true,
    })

    const request = new Request(
      'http://localhost/api/cms/sync/articles/prepublish-gate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'test-secret',
          sourcePageId: ' source-123 ',
        }),
      },
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.evaluateSourceArticlePublishGate).toHaveBeenCalledWith(
      'source-123',
    )
    expect(body).toMatchObject({
      ok: true,
      sourcePageId: 'source-123',
      seoGatePersisted: true,
    })
  })

  it('returns 409 when gate fails and surfaces persistence errors', async () => {
    mocks.evaluateSourceArticlePublishGate.mockResolvedValue({
      ok: false,
      sourcePageId: 'source-123',
      reasons: ['Missing required Keywords'],
      seoGatePersisted: false,
      seoGatePersistError: 'Notion API rate limited',
    })

    const request = new Request(
      'http://localhost/api/cms/sync/articles/prepublish-gate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'test-secret',
          sourcePageId: 'source-123',
        }),
      },
    )

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      ok: false,
      sourcePageId: 'source-123',
      seoGatePersisted: false,
      seoGatePersistError: 'Notion API rate limited',
    })
  })
})
