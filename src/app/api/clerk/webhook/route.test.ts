import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Characterization suite for the Clerk → Resend webhook (#74), written as the
 * regression net for #86 (`user.deleted` / `user.updated` contact hygiene).
 *
 * The route had no tests: this pins what it does **today** so the #86 handler
 * can be added against a green baseline rather than a guess. Three groups:
 *
 * 1. **Gate + signature** — the env gates and the svix verification that must
 *    keep guarding every event type, whatever event switch grows on top.
 * 2. **`user.created`** — the one handled event. #86 requires this path stay
 *    byte-identical, so its Resend call shape is asserted exactly.
 * 3. **Unhandled events** — `user.deleted` and `user.updated` are asserted to
 *    2xx-and-ignore. Those two assertions are the ones #86 must *flip*: they
 *    are written to fail loudly the moment either event starts doing work, so
 *    nobody can land the hygiene handler without consciously updating the
 *    contract recorded here.
 *
 * Everything outbound is stubbed (`svix`, `captureContact`) — this suite makes
 * zero network calls and needs no Clerk or Resend credentials.
 */

const { verifyMock, webhookCtor, captureContactMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  webhookCtor: vi.fn(),
  captureContactMock: vi.fn(),
}))

vi.mock('svix', () => ({
  Webhook: class {
    constructor(secret: string) {
      webhookCtor(secret)
    }
    verify = verifyMock
  },
}))

vi.mock('@/lib/email/captureContact', () => ({
  captureContact: captureContactMock,
}))

import { POST } from '@/app/api/clerk/webhook/route'

const SIGNING_SECRET = 'whsec_test_not_a_real_secret'

/** A Clerk delivery: raw body plus the three svix headers the route reads. */
const makeRequest = (
  body: unknown,
  headers: Record<string, string> = {
    'svix-id': 'msg_1',
    'svix-timestamp': '1700000000',
    'svix-signature': 'v1,stub',
  },
) =>
  new Request('https://example.test/api/clerk/webhook', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })

/** Minimal `user.*` payload shaped like Clerk's UserJSON. */
const userEvent = (
  type: string,
  data: Record<string, unknown> = {
    id: 'user_1',
    email_addresses: [{ email_address: 'ada@example.test' }],
    first_name: 'Ada',
    last_name: 'Lovelace',
  },
) => ({ type, data })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test')
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test')
  vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', SIGNING_SECRET)
  captureContactMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  verifyMock.mockReset()
  webhookCtor.mockReset()
  captureContactMock.mockReset()
})

describe('POST /api/clerk/webhook — configuration gates', () => {
  it('503s (without verifying) when Clerk is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    const res = await POST(makeRequest(userEvent('user.created')))

    expect(res.status).toBe(503)
    expect(verifyMock).not.toHaveBeenCalled()
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it('503s when the signing secret is absent', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', '')

    const res = await POST(makeRequest(userEvent('user.created')))

    expect(res.status).toBe(503)
    expect(verifyMock).not.toHaveBeenCalled()
    expect(captureContactMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/clerk/webhook — signature verification', () => {
  it('verifies the raw body and the three svix headers with the signing secret', async () => {
    const event = userEvent('user.created')
    const raw = JSON.stringify(event)
    verifyMock.mockReturnValue(event)

    await POST(makeRequest(raw))

    expect(webhookCtor).toHaveBeenCalledWith(SIGNING_SECRET)
    expect(verifyMock).toHaveBeenCalledWith(raw, {
      'svix-id': 'msg_1',
      'svix-timestamp': '1700000000',
      'svix-signature': 'v1,stub',
    })
  })

  it('400s on an invalid signature and never touches Resend', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('No matching signature found')
    })

    const res = await POST(makeRequest(userEvent('user.created')))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' })
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it('passes empty strings for missing svix headers (verification then fails closed)', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('Missing required headers')
    })

    const res = await POST(
      new Request('https://example.test/api/clerk/webhook', {
        method: 'POST',
        body: '{}',
      }),
    )

    expect(res.status).toBe(400)
    expect(verifyMock).toHaveBeenCalledWith('{}', {
      'svix-id': '',
      'svix-timestamp': '',
      'svix-signature': '',
    })
  })
})

describe('POST /api/clerk/webhook — user.created (must stay unchanged by #86)', () => {
  it('captures the contact with the first email plus both name parts', async () => {
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
    expect(captureContactMock).toHaveBeenCalledTimes(1)
    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'ada@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
  })

  it('threads undefined (never null/empty) for absent name parts', async () => {
    const event = userEvent('user.created', {
      id: 'user_2',
      email_addresses: [{ email_address: 'noname@example.test' }],
      first_name: null,
      last_name: null,
    })
    verifyMock.mockReturnValue(event)

    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'noname@example.test',
      firstName: undefined,
      lastName: undefined,
    })
  })

  it('takes email_addresses[0] and ignores primary_email_address_id (latent gap)', async () => {
    // Pinning a known-imperfect behavior on purpose. Clerk's UserJSON marks the
    // primary address with `primary_email_address_id`; this route just takes
    // the first element. Harmless at sign-up (a new user has exactly one
    // address) but wrong for any multi-address account — and #86 is entirely
    // about primary-email semantics, so whoever implements it must decide
    // deliberately whether to resolve the primary here. This test fails when
    // they do, which is the point.
    const event = userEvent('user.updated-like-shape', {
      id: 'user_5',
      email_addresses: [
        { email_address: 'old@example.test', id: 'idn_old' },
        { email_address: 'new-primary@example.test', id: 'idn_new' },
      ],
      primary_email_address_id: 'idn_new',
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
    // Run it through the handled path so the extraction is exercised.
    verifyMock.mockReturnValue({ ...event, type: 'user.created' })

    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'old@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
  })

  it('2xx-ignores a user.created that carries no email address', async () => {
    const event = userEvent('user.created', {
      id: 'user_3',
      email_addresses: [],
    })
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it('2xx-ignores a user.created whose email_addresses key is absent entirely', async () => {
    const event = userEvent('user.created', { id: 'user_4' })
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it('still 200s when capture fails internally (capture never fails the ack)', async () => {
    // captureContact's own contract is that it logs and swallows everything,
    // so the route must never see a rejection — Clerk redelivers on non-2xx
    // and a bad Resend config would otherwise become a retry storm.
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)
    captureContactMock.mockResolvedValue(undefined)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
  })

  it('re-captures on redelivery — idempotency is delegated to captureContact', async () => {
    // Clerk retries any non-2xx, so the same event can arrive twice. The route
    // does not deduplicate; captureContact swallows the duplicate-contact
    // conflict instead. Pinned here so #86 does not silently move that
    // responsibility without updating this contract.
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)

    await POST(makeRequest(event))
    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/clerk/webhook — unhandled events (the #86 gap)', () => {
  // These two assertions record the CURRENT behavior and are the ones #86 has
  // to flip. Both events are 2xx-ignored today: the Resend contact of a
  // deleted Clerk user survives, and a primary-email change never reaches
  // Resend. See the lane summary for why neither is implementable from the
  // webhook payload alone.
  it('2xx-ignores user.deleted without touching Resend (gap #86 must close)', async () => {
    const event = {
      type: 'user.deleted',
      data: { id: 'user_1', deleted: true },
    }
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it('2xx-ignores user.updated without touching Resend (gap #86 must close)', async () => {
    const event = userEvent('user.updated', {
      id: 'user_1',
      email_addresses: [{ email_address: 'ada.new@example.test' }],
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it.each(['session.created', 'organization.created', 'email.created'])(
    '2xx-ignores %s',
    async (type) => {
      const event = { type, data: { id: 'obj_1' } }
      verifyMock.mockReturnValue(event)

      const res = await POST(makeRequest(event))

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ received: true })
      expect(captureContactMock).not.toHaveBeenCalled()
    },
  )
})
