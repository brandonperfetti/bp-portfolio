import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The anon free-message gate (#74, folds #18). Two backends under test:
 *
 * - The Upstash path (`@upstash/redis` mocked) — proves the counter is
 *   distributed (INCR + a TTL set once, on the first write) rather than an
 *   in-memory bucket.
 * - The dev-only in-memory fallback (module reimported with Upstash env
 *   unset) — proves the pre-Upstash local-dev path still works, mirroring
 *   `@/lib/security/guardrails`' `applyRateLimit`/`applyDailyQuota` fallback.
 *
 * `hasUpstash` is computed once at module scope, so switching between the
 * two requires `vi.resetModules()` + a fresh dynamic import after
 * `vi.stubEnv`, the same pattern `guardrails.test.ts` uses for
 * `TURNSTILE_SECRET_KEY`.
 */

import { createHmac } from 'node:crypto'

/**
 * Mirrors chatGate's anonIpKeyDigest with the dev pepper (PAYLOAD_SECRET is
 * unset under vitest) so tests can assert the exact stored key while proving
 * it contains no raw IP.
 */
const digestOf = (ip: string) =>
  createHmac('sha256', 'bp-anon-ip-dev-pepper')
    .update(ip)
    .digest('hex')
    .slice(0, 32)

const redisGet = vi.fn()
const redisIncr = vi.fn()
const redisExpire = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      get: redisGet,
      incr: redisIncr,
      expire: redisExpire,
    })),
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  redisGet.mockReset()
  redisIncr.mockReset()
  redisExpire.mockReset()
})

describe('chatGate — Upstash-backed (distributed)', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  })

  it('peeks 0 for a key that has never incremented', async () => {
    redisGet.mockResolvedValue(null)
    const { peekAnonFreeMessageCount } = await import('@/lib/security/chatGate')
    await expect(peekAnonFreeMessageCount('203.0.113.1')).resolves.toBe(0)
    expect(redisGet).toHaveBeenCalledWith(
      `chat:anon-free:${digestOf('203.0.113.1')}`,
    )
  })

  it('increments via Redis INCR and sets a TTL only on the first write', async () => {
    redisIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    const { incrementAnonFreeMessageCount } =
      await import('@/lib/security/chatGate')

    await expect(incrementAnonFreeMessageCount('203.0.113.1')).resolves.toBe(1)
    expect(redisExpire).toHaveBeenCalledWith(
      `chat:anon-free:${digestOf('203.0.113.1')}`,
      30 * 24 * 60 * 60,
    )

    redisExpire.mockClear()
    await expect(incrementAnonFreeMessageCount('203.0.113.1')).resolves.toBe(2)
    expect(redisExpire).not.toHaveBeenCalled()
  })

  it('never sends a raw client IP to Redis — keys carry only the HMAC digest', async () => {
    redisGet.mockResolvedValue(null)
    redisIncr.mockResolvedValue(1)
    const { peekAnonFreeMessageCount, incrementAnonFreeMessageCount } =
      await import('@/lib/security/chatGate')

    await peekAnonFreeMessageCount('203.0.113.1')
    await incrementAnonFreeMessageCount('203.0.113.1')

    const allKeys = [
      ...redisGet.mock.calls,
      ...redisIncr.mock.calls,
      ...redisExpire.mock.calls,
    ].map((call) => String(call[0]))
    expect(allKeys.length).toBeGreaterThan(0)
    for (const key of allKeys) {
      expect(key).not.toContain('203.0.113.1')
    }
    // Same IP → same digest → same key (the counter still accumulates).
    expect(new Set(allKeys).size).toBe(1)
  })

  it('keys distinct IPs to distinct Redis keys (no cross-visitor bleed)', async () => {
    redisGet.mockImplementation(async (key: string) =>
      key.endsWith(digestOf('203.0.113.1')) ? 3 : 0,
    )
    const { peekAnonFreeMessageCount } = await import('@/lib/security/chatGate')
    await expect(peekAnonFreeMessageCount('203.0.113.1')).resolves.toBe(3)
    await expect(peekAnonFreeMessageCount('203.0.113.2')).resolves.toBe(0)
  })
})

describe('chatGate — in-memory fallback (Upstash unconfigured)', () => {
  beforeEach(async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    // The fallback store lives on globalThis, not module scope, so it
    // survives vi.resetModules() between tests — reset it explicitly.
    const { __resetAnonFreeMessageMemoryStoreForTests } =
      await import('@/lib/security/chatGate')
    __resetAnonFreeMessageMemoryStoreForTests()
  })

  it('counts up per key without ever touching Redis', async () => {
    const { peekAnonFreeMessageCount, incrementAnonFreeMessageCount } =
      await import('@/lib/security/chatGate')

    await expect(peekAnonFreeMessageCount('198.51.100.7')).resolves.toBe(0)
    await expect(incrementAnonFreeMessageCount('198.51.100.7')).resolves.toBe(1)
    await expect(incrementAnonFreeMessageCount('198.51.100.7')).resolves.toBe(2)
    await expect(peekAnonFreeMessageCount('198.51.100.7')).resolves.toBe(2)
    expect(redisIncr).not.toHaveBeenCalled()
  })

  it('tracks separate keys independently', async () => {
    const { incrementAnonFreeMessageCount, peekAnonFreeMessageCount } =
      await import('@/lib/security/chatGate')

    await incrementAnonFreeMessageCount('198.51.100.8')
    await incrementAnonFreeMessageCount('198.51.100.8')
    await incrementAnonFreeMessageCount('198.51.100.9')

    await expect(peekAnonFreeMessageCount('198.51.100.8')).resolves.toBe(2)
    await expect(peekAnonFreeMessageCount('198.51.100.9')).resolves.toBe(1)
  })
})

describe('getAnonFreeMessageLimit / getAuthedChat* env knobs', () => {
  it('defaults to 3 free anon messages when unset', async () => {
    vi.stubEnv('CORVUS_ANON_FREE_MESSAGES', '')
    const { getAnonFreeMessageLimit } = await import('@/lib/security/chatGate')
    expect(getAnonFreeMessageLimit()).toBe(3)
  })

  it('honors CORVUS_ANON_FREE_MESSAGES when set to a positive integer', async () => {
    vi.stubEnv('CORVUS_ANON_FREE_MESSAGES', '5')
    const { getAnonFreeMessageLimit } = await import('@/lib/security/chatGate')
    expect(getAnonFreeMessageLimit()).toBe(5)
  })

  it('falls back to the default on a non-positive or non-numeric override', async () => {
    vi.stubEnv('CORVUS_ANON_FREE_MESSAGES', '0')
    const { getAnonFreeMessageLimit } = await import('@/lib/security/chatGate')
    expect(getAnonFreeMessageLimit()).toBe(3)
  })

  it('defaults the authed per-minute ceiling above the anon default (10)', async () => {
    vi.stubEnv('CORVUS_CHAT_RATE_LIMIT_PER_MINUTE_AUTHED', '')
    const { getAuthedChatRatePerMinute } =
      await import('@/lib/security/chatGate')
    expect(getAuthedChatRatePerMinute()).toBe(30)
  })

  it('defaults the authed daily quota well above the anon default (200)', async () => {
    vi.stubEnv('CORVUS_CHAT_DAILY_QUOTA_AUTHED', '')
    const { getAuthedChatDailyQuota } = await import('@/lib/security/chatGate')
    expect(getAuthedChatDailyQuota()).toBe(1000)
  })

  describe('getAuthedChatDailyQuota — explicit 0 disables (orchestrator finding 1)', () => {
    it('defaults to 1000 when unset', async () => {
      vi.stubEnv('CORVUS_CHAT_DAILY_QUOTA_AUTHED', '')
      const { getAuthedChatDailyQuota } =
        await import('@/lib/security/chatGate')
      expect(getAuthedChatDailyQuota()).toBe(1000)
    })

    it('honors an explicit "0" as disabled, not the default (0 is falsy, not "unset")', async () => {
      vi.stubEnv('CORVUS_CHAT_DAILY_QUOTA_AUTHED', '0')
      const { getAuthedChatDailyQuota } =
        await import('@/lib/security/chatGate')
      expect(getAuthedChatDailyQuota()).toBe(0)
    })

    it('passes through a positive override', async () => {
      vi.stubEnv('CORVUS_CHAT_DAILY_QUOTA_AUTHED', '2000')
      const { getAuthedChatDailyQuota } =
        await import('@/lib/security/chatGate')
      expect(getAuthedChatDailyQuota()).toBe(2000)
    })

    it('falls back to the default on a non-numeric override', async () => {
      vi.stubEnv('CORVUS_CHAT_DAILY_QUOTA_AUTHED', 'abc')
      const { getAuthedChatDailyQuota } =
        await import('@/lib/security/chatGate')
      expect(getAuthedChatDailyQuota()).toBe(1000)
    })
  })
})
