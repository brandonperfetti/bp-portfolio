import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Newsletter Signup → a confirmation email (#367, double opt-in #407). The
 * real limiter, the real shared guard (`guardPublicForm`) and the real token
 * module run; only the Upstash client, the Resend SDK, Sentry and the request
 * guardrails' environment reads are faked. The contact mocks stay so a test
 * can prove a submit makes no contact call at all.
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
const createContactMock = vi.fn()
const getContactMock = vi.fn()
const updateContactMock = vi.fn()
const listSegmentsMock = vi.fn()
const addSegmentMock = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) }
    contacts = {
      create: (...args: unknown[]) => createContactMock(...args),
      get: (...args: unknown[]) => getContactMock(...args),
      update: (...args: unknown[]) => updateContactMock(...args),
      segments: {
        list: (...args: unknown[]) => listSegmentsMock(...args),
        add: (...args: unknown[]) => addSegmentMock(...args),
      },
    }
  },
}))

/** Resend's answer to a lookup of an absent contact (measured 2026-11-21). */
const NOT_FOUND = {
  data: null,
  error: { statusCode: 404, message: 'Contact not found', name: 'not_found' },
}

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
  sendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  createContactMock.mockResolvedValue({ data: { id: 'c_1' }, error: null })
  getContactMock.mockResolvedValue(NOT_FOUND)
  updateContactMock.mockResolvedValue({
    data: { id: 'c_existing' },
    error: null,
  })
  listSegmentsMock.mockResolvedValue({
    data: { object: 'list', has_more: false, data: [] },
    error: null,
  })
  addSegmentMock.mockResolvedValue({ data: { id: SEGMENT_ID }, error: null })
  countingLimiter()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('POST /api/newsletter (#367, double opt-in #407)', () => {
  /** Every Resend contact call: a submit must make none. */
  const contactCalls = () => [
    ...createContactMock.mock.calls,
    ...getContactMock.mock.calls,
    ...updateContactMock.mock.calls,
    ...listSegmentsMock.mock.calls,
    ...addSegmentMock.mock.calls,
  ]

  it('sends one confirmation email to the trimmed address, and changes nothing on the list', async () => {
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      message: 'Thanks. Check your inbox for a link to confirm.',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [sent] = sendMock.mock.calls[0] as [
      { to: string; subject: string; text: string; html: string },
    ]
    expect(sent.to).toBe('reader@example.test')
    expect(sent.subject).toBe('Confirm your subscription')
    expect(sent.text).toMatch(/ignore this email\. Nothing happens/)
    expect(contactCalls()).toEqual([])
  })

  it('links to the confirm page with a token that confirms only that address', async () => {
    const POST = await loadPost()
    await POST(makeRequest())

    const [sent] = sendMock.mock.calls[0] as [{ text: string; html: string }]
    const link = /https?:\/\/\S+\/newsletter\/confirm\?token=([\w.-]+)/.exec(
      sent.text,
    )
    expect(link).not.toBeNull()
    expect(sent.html).toContain(link![0])

    const { getConfirmTokenKey, verifyConfirmToken } =
      await import('@/lib/email/newsletterConfirmToken')
    expect(verifyConfirmToken(link![1], getConfirmTokenKey()!)).toEqual({
      ok: true,
      email: 'reader@example.test',
    })
  })

  it('answers every address with one byte-identical success, and one byte-identical failure (#409)', async () => {
    const POST = await loadPost()
    const bodyOf = async (email: string) => {
      const res = await POST(makeRequest({ email }))
      return { status: res.status, body: await res.text() }
    }

    const first = await bodyOf('new@example.test')
    const second = await bodyOf('subscribed@example.test')
    expect(first.status).toBe(200)
    expect(second).toEqual(first)

    countingLimiter()
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 500, name: 'internal_server_error', message: 'x' },
    })
    const refused = await bodyOf('new@example.test')
    sendMock.mockRejectedValueOnce(new Error('network down'))
    const unreachable = await bodyOf('subscribed@example.test')

    expect(refused.status).toBe(503)
    expect(JSON.parse(refused.body)).toEqual({
      message: "Couldn't sign you up right now. Please try again later.",
    })
    expect(unreachable).toEqual(refused)
    expect(contactCalls()).toEqual([])
  })

  it('reports a failed send to Sentry by stage, with no address in it (#409)', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        statusCode: 422,
        name: 'validation_error',
        message: 'reader@example.test is invalid',
      },
    })
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [captured, hint] = captureExceptionMock.mock.calls[0] as [
      Error,
      { tags: Record<string, string> },
    ]
    expect(hint.tags).toEqual({
      'newsletter.capture_stage': 'send',
      'resend.error_name': 'validation_error',
      'resend.status_code': '422',
    })
    expect(
      JSON.stringify([captured.message, captured.stack, hint]),
    ).not.toContain('reader@example.test')
  })

  it('answers 503 and sends nothing without PAYLOAD_SECRET to sign the link', async () => {
    vi.stubEnv('PAYLOAD_SECRET', '')
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    expect(limitMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    expect(contactCalls()).toEqual([])
  })

  it.each([
    ['not an email', { email: 'not-an-email' }],
    ['missing', {}],
    ['not JSON-shaped', 'just a string'],
  ])('rejects a bad email (%s) with 400 and sends nothing', async (_, body) => {
    const POST = await loadPost()

    const res = await POST(makeRequest(body))

    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toMatch(
      /valid email/i,
    )
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request with 403 before the limiter runs', async () => {
    sourceAllowedMock.mockReturnValueOnce(false)
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(limitMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
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
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('keys the limiter on the HMAC digest of the IP in its own bucket', async () => {
    const POST = await loadPost()

    await POST(makeRequest())

    const [key] = limitMock.mock.calls[0] as [string]
    expect(key).toBe(EXPECTED_LIMITER_KEY)
    expect(key).not.toContain(CLIENT_IP)
  })

  it('trips at the configured rate: the request past it gets 429 and sends nothing', async () => {
    const POST = await loadPost()

    for (let i = 0; i < RATE_PER_MINUTE; i += 1) {
      expect((await POST(makeRequest())).status).toBe(200)
    }
    const over = await POST(makeRequest())

    expect(over.status).toBe(429)
    expect(Number(over.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(sendMock).toHaveBeenCalledTimes(RATE_PER_MINUTE)
  })

  it('fails closed on a limiter outage: 503, nothing sent, one redacted report', async () => {
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
    expect(sendMock).not.toHaveBeenCalled()
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

  it('answers 503 without RESEND_API_KEY and sends nothing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const POST = await loadPost()

    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    expect(limitMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
