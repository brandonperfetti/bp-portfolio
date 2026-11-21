import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contact form against a limiter outage (#390). Unlike the chat route's
 * suite, the real `@/lib/security/limiter` runs here: only the Upstash
 * client, Resend, Sentry and the request guardrails are faked, so the
 * `s.map is not a function` TypeError travels the same path it did on
 * staging — out of `Ratelimit.limit`, through `checkChatLimits`, into the
 * route.
 */

const limitMock = vi.fn()
vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => 'sliding')
    static fixedWindow = vi.fn(() => 'fixed')
    limit = (...args: unknown[]) => limitMock(...args)
  }
  return { Ratelimit }
})
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn(() => ({})) },
}))

const sendMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) }
  },
}))

vi.mock('@/lib/email/captureContact', () => ({
  captureContact: vi.fn(),
}))

const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

const CLIENT_IP = '198.51.100.7'
const RATE_PER_MINUTE = 5
const TEST_PAYLOAD_SECRET = 'test-payload-secret'

/**
 * The key the route must use, computed here rather than through
 * `anonIpKeyDigest`, so a digest that quietly became the identity would fail.
 */
const EXPECTED_LIMITER_KEY = `contact:${createHmac(
  'sha256',
  TEST_PAYLOAD_SECRET,
)
  .update(CLIENT_IP)
  .digest('hex')
  .slice(0, 32)}`

const turnstileMock = vi.fn(async (_args: { token: string; ip: string }) => ({
  required: false,
  ok: true,
}))

vi.mock('@/lib/security/guardrails', () => ({
  getRequestClientIp: () => CLIENT_IP,
  getSecurityLimits: () => ({ mailingListRatePerMinute: RATE_PER_MINUTE }),
  isAllowedRequestSource: () => true,
  verifyRequestTurnstileToken: (args: { token: string; ip: string }) =>
    turnstileMock(args),
  applyRateLimit: vi.fn(),
  applyDailyQuota: vi.fn(),
}))

const validBody = {
  fullname: 'Ada Lovelace',
  email: 'ada@example.test',
  subject: 'Hello',
  message: 'A note.',
}

const makeRequest = () =>
  new Request('https://example.test/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  })

/** Import the route fresh, after the Upstash env is stubbed. */
const loadPost = async () => (await import('@/app/api/contact/route')).POST

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubEnv('PAYLOAD_SECRET', TEST_PAYLOAD_SECRET)
  sendMock.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('POST /api/contact — limiter outage fails closed (#390)', () => {
  it('answers 503 with a clear message, sends no email, and reports once', async () => {
    // The exact staging error, with the limiter key and the raw IP echoed
    // into it the way an upstream message could: neither may reach Sentry.
    limitMock.mockRejectedValue(
      new TypeError(
        `s.map is not a function (${EXPECTED_LIMITER_KEY}, ${CLIENT_IP})`,
      ),
    )
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    const body = (await res.json()) as { message: string }
    expect(body.message).toMatch(/temporarily unavailable/i)
    expect(body.message).toMatch(/email me directly/i)
    expect(sendMock).not.toHaveBeenCalled()

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [captured, hint] = captureExceptionMock.mock.calls[0] as [
      Error & { cause?: Error },
      { tags: Record<string, string> },
    ]
    expect(captured.name).toBe('LimiterUnavailableError')
    expect(captured.message).toContain('TypeError: s.map is not a function')
    expect(hint.tags).toMatchObject({
      'limiter.surface': 'contact',
      'limiter.operation': 'checkChatLimits',
    })
    const reported = JSON.stringify([
      captured.message,
      captured.stack,
      captured.cause?.message,
      captured.cause?.stack,
    ])
    expect(reported).not.toContain(CLIENT_IP)
    expect(reported).not.toContain(
      EXPECTED_LIMITER_KEY.slice('contact:'.length),
    )
  })

  it('answers 503 when the store stalls and Ratelimit resolves a timeout as success', async () => {
    // @upstash/ratelimit's own timeout answer: success, with reason 'timeout'.
    limitMock.mockResolvedValue({
      success: true,
      limit: 0,
      remaining: 0,
      reset: 0,
      reason: 'timeout',
    })
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    expect(sendMock).not.toHaveBeenCalled()
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    expect(
      (captureExceptionMock.mock.calls[0]?.[0] as Error).message,
    ).toContain('timed out (minute window)')
  })

  it('still sends when the limiter is healthy, reporting nothing', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 4, reset: 0 })
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/contact — limiter key and rate (#364)', () => {
  /**
   * A sliding-window stand-in: counts each key's calls and refuses the ones
   * past the configured rate, the way Upstash would within one window.
   */
  const countingLimiter = () => {
    const counts = new Map<string, number>()
    limitMock.mockImplementation(async (key: string) => {
      const count = (counts.get(key) ?? 0) + 1
      counts.set(key, count)
      const success = count <= RATE_PER_MINUTE
      return {
        success,
        limit: RATE_PER_MINUTE,
        remaining: Math.max(0, RATE_PER_MINUTE - count),
        reset: Date.now() + 30_000,
      }
    })
  }

  it('keys the limiter on the HMAC digest of the IP, never the raw address', async () => {
    countingLimiter()
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(limitMock).toHaveBeenCalledTimes(1)
    const [key] = limitMock.mock.calls[0] as [string]
    expect(key).toBe(EXPECTED_LIMITER_KEY)
    expect(key).not.toContain(CLIENT_IP)
    // The digest is the same helper chat's limiter keys use.
    const { anonIpKeyDigest } = await import('@/lib/security/chatGate')
    expect(key).toBe(`contact:${anonIpKeyDigest(CLIENT_IP)}`)
  })

  it('still passes the raw IP to Turnstile, which is a separate question', async () => {
    countingLimiter()
    const POST = await loadPost()

    await POST(makeRequest())

    expect(turnstileMock).toHaveBeenCalledTimes(1)
    expect(turnstileMock.mock.calls[0]?.[0]).toMatchObject({ ip: CLIENT_IP })
  })

  it('trips at the configured rate: the request past it gets 429 and sends nothing', async () => {
    countingLimiter()
    const POST = await loadPost()
    const { Ratelimit } = await import('@upstash/ratelimit')

    for (let i = 0; i < RATE_PER_MINUTE; i += 1) {
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
    }
    const over = await POST(makeRequest())

    expect(Ratelimit.slidingWindow).toHaveBeenCalledWith(
      RATE_PER_MINUTE,
      '60 s',
    )
    expect(over.status).toBe(429)
    expect(Number(over.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(sendMock).toHaveBeenCalledTimes(RATE_PER_MINUTE)
    // Every call went to the one digest bucket.
    expect(new Set(limitMock.mock.calls.map(([key]) => key))).toEqual(
      new Set([EXPECTED_LIMITER_KEY]),
    )
  })
})
