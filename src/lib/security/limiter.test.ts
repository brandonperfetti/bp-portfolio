import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `checkChatLimits` on the Upstash path (#390). `@upstash/ratelimit` is
 * faked; the two limiters it builds per config are told apart by the window
 * factory each was given, so a test can make only the daily one stall.
 */

const minuteLimit = vi.fn()
const dailyLimit = vi.fn()

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => 'minute')
    static fixedWindow = vi.fn(() => 'daily')
    limit: (key: string) => unknown
    constructor(config: { limiter: string }) {
      this.limit =
        config.limiter === 'minute'
          ? (key) => minuteLimit(key)
          : (key) => dailyLimit(key)
    }
  }
  return { Ratelimit }
})
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: vi.fn(() => ({})) } }))

const ok = { success: true, limit: 10, remaining: 9, reset: 1 }
const timedOut = {
  success: true,
  limit: 0,
  remaining: 0,
  reset: 0,
  reason: 'timeout',
}

const load = async () =>
  (await import('@/lib/security/limiter')).checkChatLimits

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  minuteLimit.mockReset()
  dailyLimit.mockReset()
})

describe('checkChatLimits — Upstash timeouts fail closed (#390)', () => {
  it('throws when the minute window times out, instead of allowing', async () => {
    minuteLimit.mockResolvedValue(timedOut)
    const checkChatLimits = await load()

    await expect(checkChatLimits('k', 10, 100)).rejects.toThrow(
      'timed out (minute window)',
    )
    expect(dailyLimit).not.toHaveBeenCalled()
  })

  it('throws when the daily window times out', async () => {
    minuteLimit.mockResolvedValue(ok)
    dailyLimit.mockResolvedValue(timedOut)
    const checkChatLimits = await load()

    await expect(checkChatLimits('k', 10, 100)).rejects.toThrow(
      'timed out (daily window)',
    )
  })

  it('still allows a genuine success and denies an ordinary limit', async () => {
    minuteLimit.mockResolvedValueOnce(ok)
    dailyLimit.mockResolvedValueOnce({ ...ok, remaining: 50 })
    minuteLimit.mockResolvedValueOnce({ ...ok, success: false, remaining: 0 })
    const checkChatLimits = await load()

    await expect(checkChatLimits('k', 10, 100)).resolves.toMatchObject({
      allowed: true,
      remaining: 9,
    })
    await expect(checkChatLimits('k', 10, 100)).resolves.toMatchObject({
      allowed: false,
    })
  })
})
