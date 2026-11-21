import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Newsletter double opt-in, the confirm step (#407). The real limiter, guard,
 * token module and `captureContact` run; only the Upstash client, the Resend
 * SDK, Sentry and the request guardrails' environment reads are faked. So a
 * pass here is the confirmation joining the list through the same rejoin path
 * the sign-up webhook's helper uses, end to end short of the network.
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
/** The single-use store (`newsletterTokenUse.ts`): Redis `SET NX` / `DEL`. */
const usedKeys = new Set<string>()
const redisSetMock = vi.fn(
  async (key: string, _v: unknown, opts?: { nx?: boolean }) => {
    if (opts?.nx && usedKeys.has(key)) return null
    usedKeys.add(key)
    return 'OK'
  },
)
const redisDelMock = vi.fn(async (key: string) =>
  usedKeys.delete(key) ? 1 : 0,
)
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      set: (...args: Parameters<typeof redisSetMock>) => redisSetMock(...args),
      del: (...args: Parameters<typeof redisDelMock>) => redisDelMock(...args),
    })),
  },
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

/** A lookup that finds the address, opted in or out. */
const existingContact = (unsubscribed: boolean) => ({
  data: {
    id: 'c_existing',
    email: 'reader@example.test',
    unsubscribed,
    first_name: null,
    last_name: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  error: null,
})

const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

const CLIENT_IP = '198.51.100.9'
const RATE_PER_MINUTE = 3
const TEST_PAYLOAD_SECRET = 'test-payload-secret'
const SEGMENT_ID = 'seg_test'

/** Computed here, not through `anonIpKeyDigest`, so an identity digest fails. */
const EXPECTED_LIMITER_KEY = `newsletter-confirm:${createHmac(
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

const makeRequest = (body: unknown) =>
  new Request('https://example.test/api/newsletter/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0)

/** A token sealed with the test secret, as the sign-up email carries. */
const tokenFor = async (email: string, nowMs = Date.now()) => {
  const { createConfirmToken, getConfirmTokenKey } =
    await import('@/lib/email/newsletterConfirmToken')
  return createConfirmToken(email, getConfirmTokenKey()!, nowMs)
}

/** Import the route fresh, after the env is stubbed. */
const loadPost = async () =>
  (await import('@/app/api/newsletter/confirm/route')).POST

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
  usedKeys.clear()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('POST /api/newsletter/confirm (#407)', () => {
  const contactCalls = () => [
    ...createContactMock.mock.calls,
    ...getContactMock.mock.calls,
    ...updateContactMock.mock.calls,
    ...listSegmentsMock.mock.calls,
    ...addSegmentMock.mock.calls,
  ]

  it('joins a new address to the list and segment', async () => {
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'confirmed' })
    expect(createContactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'reader@example.test',
        segments: [{ id: SEGMENT_ID }],
      }),
    )
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sets a returning unsubscribed reader back to subscribed, reads it back, and adds the segment', async () => {
    getContactMock
      .mockResolvedValueOnce(existingContact(true))
      .mockResolvedValueOnce(existingContact(false))
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(200)
    expect(updateContactMock).toHaveBeenCalledWith({
      email: 'reader@example.test',
      unsubscribed: false,
    })
    expect(getContactMock).toHaveBeenCalledTimes(2)
    expect(addSegmentMock).toHaveBeenCalledWith({
      email: 'reader@example.test',
      segmentId: SEGMENT_ID,
    })
    expect(createContactMock).not.toHaveBeenCalled()
  })

  it('works once: pressing the same link again answers used and touches nothing', async () => {
    const token = await tokenFor('reader@example.test')
    const POST = await loadPost()

    expect((await POST(makeRequest({ token }))).status).toBe(200)
    vi.clearAllMocks()
    countingLimiter()
    const again = await POST(makeRequest({ token }))

    expect(again.status).toBe(410)
    expect(await again.json()).toMatchObject({ status: 'used' })
    expect(contactCalls()).toEqual([])
    const [key, , opts] = redisSetMock.mock.calls[0] as [
      string,
      unknown,
      object,
    ]
    expect(key).toMatch(/^newsletter:confirm-used:[0-9a-f]{32}$/)
    expect(key).not.toContain('reader')
    expect(opts).toMatchObject({ nx: true, ex: 3 * 24 * 60 * 60 })
  })

  it('so a reader who unsubscribed after confirming is not put back by the old link', async () => {
    const token = await tokenFor('reader@example.test')
    const POST = await loadPost()
    expect((await POST(makeRequest({ token }))).status).toBe(200)

    // The reader unsubscribes; then the old email's link is pressed again.
    getContactMock.mockResolvedValue(existingContact(true))
    const again = await POST(makeRequest({ token }))

    expect(again.status).toBe(410)
    // Nor by a respelling of it, which decodes the same but is refused.
    for (const respelled of [`${token}A`, `${token.slice(0, -1)}_`]) {
      if (respelled === token) continue
      expect((await POST(makeRequest({ token: respelled }))).status).not.toBe(
        200,
      )
    }
    expect(updateContactMock).not.toHaveBeenCalled()
  })

  it('releases the link when the join fails, so the reader can retry it', async () => {
    createContactMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'application_error', statusCode: 500, message: 'x' },
    })
    const token = await tokenFor('reader@example.test')
    const POST = await loadPost()

    expect((await POST(makeRequest({ token }))).status).toBe(503)
    expect(redisDelMock).toHaveBeenCalledTimes(1)
    expect((await POST(makeRequest({ token }))).status).toBe(200)
  })

  it('answers 503 and joins no one when the single-use store fails', async () => {
    redisSetMock.mockRejectedValueOnce(new Error('upstash down'))
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'failed' })
    expect(contactCalls()).toEqual([])
  })

  it('refuses an expired token with 410, touching nothing', async () => {
    const POST = await loadPost()
    const token = await tokenFor(
      'reader@example.test',
      NOW - 4 * 24 * 60 * 60 * 1000,
    )
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    try {
      const res = await POST(makeRequest({ token }))
      expect(res.status).toBe(410)
      expect(await res.json()).toMatchObject({ status: 'expired' })
    } finally {
      vi.useRealTimers()
    }
    expect(contactCalls()).toEqual([])
  })

  it('refuses a forged token with 400, touching nothing', async () => {
    const { createConfirmToken } =
      await import('@/lib/email/newsletterConfirmToken')
    const forged = createConfirmToken(
      'reader@example.test',
      createHmac('sha256', 'not-the-secret').digest(),
    )
    const POST = await loadPost()

    const res = await POST(makeRequest({ token: forged }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ status: 'invalid' })
    expect(contactCalls()).toEqual([])
  })

  it('cannot be replayed for another address: the body names none, and an edited payload fails', async () => {
    const raw = Buffer.from(await tokenFor('reader@example.test'), 'base64url')
    raw[14] ^= 0x01 // one bit of the sealed address
    const POST = await loadPost()

    const edited = await POST(makeRequest({ token: raw.toString('base64url') }))
    const extraField = await POST(
      makeRequest({
        token: await tokenFor('reader@example.test'),
        email: 'victim@example.test',
      }),
    )

    expect(edited.status).toBe(400)
    expect(extraField.status).toBe(200)
    const touched = JSON.stringify(contactCalls())
    expect(touched).not.toContain('victim@example.test')
    expect(touched).toContain('reader@example.test')
  })

  it('refuses a missing or non-string token as invalid', async () => {
    const POST = await loadPost()
    for (const body of [{}, { token: 42 }, 'just a string']) {
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
    }
    expect(contactCalls()).toEqual([])
  })

  it('answers 503 failed, reported by stage with no address, when Resend refuses the join (#409)', async () => {
    createContactMock.mockResolvedValue({
      data: null,
      error: { statusCode: 500, name: 'internal_server_error', message: 'x' },
    })
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'failed' })
    const [captured, hint] = captureExceptionMock.mock.calls[0] as [
      Error,
      { tags: Record<string, string> },
    ]
    expect(hint.tags).toEqual({
      'newsletter.capture_stage': 'create',
      'resend.error_name': 'internal_server_error',
      'resend.status_code': '500',
    })
    expect(JSON.stringify([captured.message, captured.stack])).not.toContain(
      'reader@example.test',
    )
  })

  it('answers 503, never confirmed, when a re-subscribe does not take', async () => {
    getContactMock.mockResolvedValue(existingContact(true))
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(503)
    expect(addSegmentMock).not.toHaveBeenCalled()
  })

  it('answers 503 and touches nothing without PAYLOAD_SECRET', async () => {
    const token = await tokenFor('reader@example.test')
    vi.stubEnv('PAYLOAD_SECRET', '')
    const POST = await loadPost()

    const res = await POST(makeRequest({ token }))

    expect(res.status).toBe(503)
    expect(limitMock).not.toHaveBeenCalled()
    expect(contactCalls()).toEqual([])
  })

  it('answers 503 and touches nothing without RESEND_API_KEY', async () => {
    const token = await tokenFor('reader@example.test')
    vi.stubEnv('RESEND_API_KEY', '')
    const POST = await loadPost()

    expect((await POST(makeRequest({ token }))).status).toBe(503)
    expect(contactCalls()).toEqual([])
  })

  it('runs no Turnstile check', async () => {
    turnstileMock.mockResolvedValue({ required: true, ok: false })
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(200)
    expect(turnstileMock).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request with 403 before the limiter runs', async () => {
    sourceAllowedMock.mockReturnValueOnce(false)
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(403)
    expect(limitMock).not.toHaveBeenCalled()
  })

  it('is rate limited in its own bucket, keyed on the IP digest', async () => {
    const POST = await loadPost()

    // A fresh link each time, since each link works once.
    for (let i = 0; i < RATE_PER_MINUTE; i += 1) {
      const token = await tokenFor(`reader${i}@example.test`)
      expect((await POST(makeRequest({ token }))).status).toBe(200)
    }
    const over = await POST(
      makeRequest({ token: await tokenFor('over@example.test') }),
    )

    expect(over.status).toBe(429)
    const [key] = limitMock.mock.calls[0] as [string]
    expect(key).toBe(EXPECTED_LIMITER_KEY)
    expect(key).not.toContain(CLIENT_IP)
  })

  it('fails closed on a limiter outage: 503, nothing touched', async () => {
    limitMock.mockRejectedValue(new TypeError('s.map is not a function'))
    const POST = await loadPost()

    const res = await POST(
      makeRequest({ token: await tokenFor('reader@example.test') }),
    )

    expect(res.status).toBe(503)
    expect(contactCalls()).toEqual([])
  })
})
