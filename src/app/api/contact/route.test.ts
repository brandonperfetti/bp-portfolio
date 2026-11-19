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

vi.mock('@/lib/security/guardrails', () => ({
  getRequestClientIp: () => CLIENT_IP,
  getSecurityLimits: () => ({ mailingListRatePerMinute: 5 }),
  isAllowedRequestSource: () => true,
  verifyRequestTurnstileToken: async () => ({ required: false, ok: true }),
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
  sendMock.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('POST /api/contact — limiter outage fails closed (#390)', () => {
  it('answers 503 with a clear message, sends no email, and reports once', async () => {
    // The exact staging error, with the limiter key echoed into it the way
    // an upstream message could: the raw IP must still not reach Sentry.
    limitMock.mockRejectedValue(
      new TypeError(`s.map is not a function (contact:${CLIENT_IP})`),
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
    expect(
      JSON.stringify([
        captured.message,
        captured.stack,
        captured.cause?.message,
        captured.cause?.stack,
      ]),
    ).not.toContain(CLIENT_IP)
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
