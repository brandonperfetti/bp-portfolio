import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `getViewer()` extended for #74: the Hermes chat gate needs a userId to key
 * signed-in abuse limits (`user:${userId}`) instead of sharing an IP-keyed
 * bucket. This pins the shape addition without regressing the pre-existing
 * Clerk-disabled behavior gated content already relies on.
 */

const authMock = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  authMock.mockReset()
})

describe('getViewer', () => {
  it('returns unauthenticated with a null userId when Clerk is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')
    const { getViewer } = await import('@/lib/auth/getViewer')

    await expect(getViewer()).resolves.toEqual({
      isAuthenticated: false,
      userId: null,
    })
    expect(authMock).not.toHaveBeenCalled()
  })

  it('returns the Clerk userId when a session exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')
    authMock.mockResolvedValue({ userId: 'user_abc123' })
    const { getViewer } = await import('@/lib/auth/getViewer')

    await expect(getViewer()).resolves.toEqual({
      isAuthenticated: true,
      userId: 'user_abc123',
    })
  })

  it('returns unauthenticated with a null userId when Clerk is configured but there is no session', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')
    authMock.mockResolvedValue({ userId: null })
    const { getViewer } = await import('@/lib/auth/getViewer')

    await expect(getViewer()).resolves.toEqual({
      isAuthenticated: false,
      userId: null,
    })
  })
})
