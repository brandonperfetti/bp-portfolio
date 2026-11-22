import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The single-use claim for newsletter confirmation links (#411). Upstash
 * holds it across instances; without Upstash, a per-instance map is used
 * outside production only, and production fails closed.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const load = () => import('@/lib/email/newsletterTokenUse')

describe('claimConfirmToken without Upstash', () => {
  it('claims once, then reports used, outside production', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('NODE_ENV', 'development')
    const { claimConfirmToken, releaseConfirmToken } = await load()

    expect(await claimConfirmToken('tok')).toBe('claimed')
    expect(await claimConfirmToken('tok')).toBe('used')
    await releaseConfirmToken('tok')
    expect(await claimConfirmToken('tok')).toBe('claimed')
  })

  it('refuses to claim in production, so no link confirms on a per-instance store', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    const { claimConfirmToken } = await load()

    await expect(claimConfirmToken('tok')).rejects.toThrow(/Upstash/)
  })
})
