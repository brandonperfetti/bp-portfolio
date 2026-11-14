// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const loggerError = vi.fn()
const enableMock = vi.fn()
const disableMock = vi.fn()

/** What Next's `redirect()` throws, so the test can read where it went. */
class RedirectSignal extends Error {
  readonly to: string
  constructor(to: string) {
    super(`NEXT_REDIRECT ${to}`)
    this.to = to
  }
}

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: authMock,
    logger: { error: loggerError },
  })),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/headers', () => ({
  draftMode: vi.fn(async () => ({
    enable: enableMock,
    disable: disableMock,
  })),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new RedirectSignal(to)
  }),
}))

import { GET, isSameOriginPath } from '@/app/(frontend)/next/preview/route'

/**
 * `/next/preview` authenticates on the admin's Payload session alone (#275):
 * no request is refused or accepted on a `previewSecret` any more, and the
 * redirect stays on this site.
 */

const SECRET = 'fixture-preview-secret-0123456789'

const request = (query: string, cookie?: string) =>
  new Request(`https://staging.example.test/next/preview?${query}`, {
    headers: cookie ? { cookie } : {},
  }) as never

const signedIn = () =>
  authMock.mockResolvedValue({
    user: { id: 1, collection: 'users' },
    permissions: {},
  })
const anonymous = () =>
  authMock.mockResolvedValue({ user: null, permissions: {} })

/** Run the handler, returning either its Response or where it redirected. */
const run = async (req: never) => {
  try {
    return { response: await GET(req) }
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirectedTo: error.to }
    throw error
  }
}

beforeEach(() => {
  vi.stubEnv('PREVIEW_SECRET', SECRET)
  authMock.mockReset()
  loggerError.mockReset()
  enableMock.mockReset()
  disableMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /next/preview', () => {
  it("accepts the admin's own live preview: session, path, no secret", async () => {
    signedIn()
    const result = await run(
      request('path=%2Fwork%2Fbrytecore', 'payload-token=session'),
    )
    expect(result).toEqual({ redirectedTo: '/work/brytecore' })
    expect(enableMock).toHaveBeenCalledOnce()
    expect(disableMock).not.toHaveBeenCalled()
  })

  it('refuses a request with no Payload session', async () => {
    anonymous()
    const result = await run(request('path=%2Fnow'))
    expect(result.response?.status).toBe(403)
    expect(enableMock).not.toHaveBeenCalled()
    expect(disableMock).toHaveBeenCalledOnce()
  })

  it('refuses the old URL secret without a session: the secret grants nothing', async () => {
    // A leaked PREVIEW_SECRET value is what #275 is about. Presenting it
    // must not turn draft mode on.
    anonymous()
    const result = await run(
      request(`path=%2Fnow&previewSecret=${encodeURIComponent(SECRET)}`),
    )
    expect(result.response?.status).toBe(403)
    expect(enableMock).not.toHaveBeenCalled()
  })

  it('refuses when the session check throws, and logs no secret', async () => {
    authMock.mockRejectedValue(new Error('jwt malformed'))
    const result = await run(request('path=%2Fnow', 'payload-token=garbage'))
    expect(result.response?.status).toBe(403)
    expect(enableMock).not.toHaveBeenCalled()
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(SECRET)
  })

  it('needs no PREVIEW_SECRET in the environment', async () => {
    vi.stubEnv('PREVIEW_SECRET', undefined)
    signedIn()
    expect(await run(request('path=%2Fnow'))).toEqual({ redirectedTo: '/now' })
  })

  it('answers 404 with no path', async () => {
    signedIn()
    const result = await run(request(''))
    expect(result.response?.status).toBe(404)
  })

  it.each([
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil.example/x',
    'now',
  ])(
    'refuses %s before any session check: same-origin paths only',
    async (path) => {
      signedIn()
      const result = await run(request(`path=${encodeURIComponent(path)}`))
      expect(result.response?.status).toBe(400)
      expect(authMock).not.toHaveBeenCalled()
      expect(enableMock).not.toHaveBeenCalled()
    },
  )
})

describe('isSameOriginPath', () => {
  it('accepts paths on this site', () => {
    for (const path of ['/', '/now', '/work/a%20b', '/articles/x?draft=true']) {
      expect(isSameOriginPath(path), path).toBe(true)
    }
  })

  it('refuses anything a browser would resolve to another host', () => {
    for (const path of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example/',
      'javascript:alert(1)',
      '',
    ]) {
      expect(isSameOriginPath(path), path).toBe(false)
    }
  })
})
