import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * immediate-expiration profile `{ expire: 0 }`, not `'max'`, for every tag this
 * route revalidates (explicit or fallback). Under cacheComponents `'max'`
 * is stale-while-revalidate with a one-year stale window, so a regression
 * back to `'max'` (or to no second arg) silently reintroduces the ~10-20
 * minute stale-admin-edit bug on this user-facing manual-revalidation path
 * — this test fails loudly instead.
 */
const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}))

import { POST } from '@/app/api/revalidate/route'

const makeRequest = (body: unknown) =>
  new Request('https://example.test/api/revalidate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

const SECRET = 'test-revalidate-secret'

beforeEach(() => {
  vi.stubEnv('CMS_REVALIDATE_SECRET', SECRET)
  mocks.revalidateTag.mockClear()
  mocks.revalidatePath.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/revalidate', () => {
  it('rejects a missing or wrong secret', async () => {
    const res = await POST(makeRequest({ secret: 'nope', tags: ['posts'] }))

    expect(res.status).toBe(401)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('purges each explicit tag with the immediate-expiration expire:0 profile', async () => {
    const res = await POST(
      makeRequest({ secret: SECRET, tags: ['posts', 'pages'] }),
    )

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2)
  })

  it('falls back to the full CMS tag vocabulary, each purged with expire:0', async () => {
    const res = await POST(makeRequest({ secret: SECRET }))

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('global_site-settings', {
      expire: 0,
    })
    // Every call this route makes must use the object form, never 'max'.
    for (const call of mocks.revalidateTag.mock.calls) {
      expect(call[1]).toEqual({ expire: 0 })
    }
  })

  it('also revalidates any explicit paths', async () => {
    await POST(
      makeRequest({ secret: SECRET, tags: ['posts'], paths: ['/articles'] }),
    )

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/articles')
  })
})
