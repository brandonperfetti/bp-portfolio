import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Newsletter Signup → Resend (#367). The real limiter, the real shared guard
 * (`guardPublicForm`) and the real `captureContact` run; only the Upstash
 * client, the Resend SDK, Sentry and the request guardrails' environment
 * reads are faked. So a pass here is the route, its guards and the capture
 * helper the Clerk webhook uses, end to end short of the network.
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

const createContactMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    contacts = { create: (...args: unknown[]) => createContactMock(...args) }
  },
}))

const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

const CLIENT_IP = '198.51.100.9'
const RATE_PER_MINUTE = 3
const TEST_PAYLOAD_SECRET = 'test-payload-secret'
const SEGMENT_ID = 'seg_test'

/** Computed here, not through `anonIpKeyDigest`, so an identity digest fails. */
const EXPECTED_LIMITER_KEY = `newsletter:${createHmac(
  'sha256',
  TEST_PAYLOAD_SECRET,
)
  .update(CLIENT_IP)
  .digest('hex')
  .slice(0, 32)}`

const sourceAllowedMock = vi.fn((_req: Request) => true)
const turnstileMock = vi.fn(async (_args: { token: string; ip: string }) => ({
  required: false,
  ok: true,
}))

vi.mock('@/lib/security/guardrails', () => ({
  getRequestClientIp: () => CLIENT_IP,
  getSecurityLimits: () => ({ mailingListRatePerMinute: RATE_PER_MINUTE }),
  isAllowedRequestSource: (req: Request) => sourceAllowedMock(req),
  verifyRequestTurnstileToken: (args: { token: string; ip: string }) =>
    turnstileMock(args),
}))

const makeRequest = (body: unknown = { email: ' reader@example.test ' }) =>
  new Request('https://example.test/api/newsletter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Import the route fresh, after the env is stubbed. */
const loadPost = async () => (await import('@/app/api/newsletter/route')).POST

/** A healthy limiter that counts each key and refuses past the rate. */
const countingLimiter = () => {
  const counts = new Map<string, number>()
  limitMock.mockImplementation(async (key: string) => {
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    return {
      success: count <= RATE_PER_MINUTE,
      limit: RATE_PER_MINUTE,
      remaining: Math.max(0, RATE_PER_MINUTE - count),
      reset: Date.now() + 30_000,
    }
  })
}

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
  vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', SEGMENT_ID)
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubEnv('PAYLOAD_SECRET', TEST_PAYLOAD_SECRET)
  createContactMock.mockResolvedValue({ data: { id: 'c_1' }, error: null })
  countingLimiter()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('POST /api/newsletter (#367)', () => {
  it('adds the trimmed address to the Resend list and segment', async () => {
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(createContactMock).toHaveBeenCalledTimes(1)
    expect(createContactMock.mock.calls[0]?.[0]).toMatchObject({
      email: 'reader@example.test',
      segments: [{ id: SEGMENT_ID }],
    })
  })

  it('answers an address already on the list exactly as a new one', async () => {
    const POST = await loadPost()
    const fresh = await POST(makeRequest())

    createContactMock.mockResolvedValue({
      data: null,
      error: { name: 'conflict', message: 'Contact already exists' },
    })
    const duplicate = await POST(makeRequest())

    expect(duplicate.status).toBe(fresh.status)
    expect(await duplicate.json()).toEqual(await fresh.json())
  })

  it('answers a Resend failure as a success too, so no answer differs', async () => {
    const POST = await loadPost()
    const fresh = await POST(makeRequest())

    createContactMock.mockRejectedValue(new Error('network down'))
    const failed = await POST(makeRequest())

    expect(failed.status).toBe(200)
    expect(await failed.json()).toEqual(await fresh.json())
  })

  it.each([
    ['not an email', { email: 'not-an-email' }],
    ['missing', {}],
    ['not JSON-shaped', 'just a string'],
  ])(
    'rejects a bad email (%s) with 400 and captures nothing',
    async (_, body) => {
      const POST = await loadPost()

      const res = await POST(makeRequest(body))

      expect(res.status).toBe(400)
      expect(((await res.json()) as { message: string }).message).toMatch(
        /valid email/i,
      )
      expect(createContactMock).not.toHaveBeenCalled()
    },
  )

  it('refuses a cross-origin request with 403 before the limiter runs', async () => {
    sourceAllowedMock.mockReturnValueOnce(false)
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(limitMock).not.toHaveBeenCalled()
    expect(createContactMock).not.toHaveBeenCalled()
  })

  it('refuses a failed Turnstile check with 403, passing the raw IP to Cloudflare', async () => {
    turnstileMock.mockResolvedValueOnce({ required: true, ok: false })
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ email: 'reader@example.test', turnstileToken: 'tok' }),
    )

    expect(res.status).toBe(403)
    expect(((await res.json()) as { message: string }).message).toMatch(
      /verification failed/i,
    )
    expect(turnstileMock).toHaveBeenCalledWith({ token: 'tok', ip: CLIENT_IP })
    expect(createContactMock).not.toHaveBeenCalled()
  })

  it('keys the limiter on the HMAC digest of the IP in its own bucket', async () => {
    const POST = await loadPost()

    await POST(makeRequest())

    const [key] = limitMock.mock.calls[0] as [string]
    expect(key).toBe(EXPECTED_LIMITER_KEY)
    expect(key).not.toContain(CLIENT_IP)
  })

  it('trips at the configured rate: the request past it gets 429 and captures nothing', async () => {
    const POST = await loadPost()

    for (let i = 0; i < RATE_PER_MINUTE; i += 1) {
      expect((await POST(makeRequest())).status).toBe(200)
    }
    const over = await POST(makeRequest())

    expect(over.status).toBe(429)
    expect(Number(over.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(createContactMock).toHaveBeenCalledTimes(RATE_PER_MINUTE)
  })

  it('fails closed on a limiter outage: 503, no capture, one redacted report', async () => {
    limitMock.mockRejectedValue(
      new TypeError(
        `s.map is not a function (${EXPECTED_LIMITER_KEY}, ${CLIENT_IP})`,
      ),
    )
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    expect(((await res.json()) as { message: string }).message).toMatch(
      /temporarily unavailable/i,
    )
    expect(createContactMock).not.toHaveBeenCalled()
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [captured, hint] = captureExceptionMock.mock.calls[0] as [
      Error & { cause?: Error },
      { tags: Record<string, string> },
    ]
    expect(hint.tags).toMatchObject({ 'limiter.surface': 'newsletter' })
    const reported = JSON.stringify([
      captured.message,
      captured.stack,
      captured.cause?.message,
      captured.cause?.stack,
    ])
    expect(reported).not.toContain(CLIENT_IP)
    expect(reported).not.toContain(
      EXPECTED_LIMITER_KEY.slice('newsletter:'.length),
    )
  })

  it('answers 503 without RESEND_API_KEY rather than claim a subscription', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    expect(limitMock).not.toHaveBeenCalled()
    expect(createContactMock).not.toHaveBeenCalled()
  })
})
