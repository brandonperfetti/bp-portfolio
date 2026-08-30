import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contract suite for the Clerk → Resend webhook (#74, #86).
 *
 * Wave 3 landed this as a *characterization* suite pinning the pre-#86
 * behavior. #86 flips four of those pins; the rest are unchanged and still
 * guard the parts that must not move. Groups:
 *
 * 1. **Gate + signature** — the env gates and the svix verification that must
 *    keep guarding every event type, whatever event switch grows on top.
 *    Untouched by #86.
 * 2. **`user.created`** — capture plus the new mapping write. The
 *    `captureContact` call shape is still asserted exactly; what changed is
 *    which address is chosen (primary, not first) and that the Resend contact
 *    id is written to Clerk `external_id`.
 * 3. **`user.deleted`** — removes the mapped contact by id, no-ops without a
 *    mapping.
 * 4. **`user.updated`** — follows a primary-email change as create-new then
 *    remove-old, and writes the new id back.
 * 5. **Unhandled events** — everything else still 2xx-and-ignores.
 *
 * The four assertions #86 flipped (each fails at the pre-#86 base, which is
 * the proof they pin new behavior rather than restating old):
 *
 * - `user.created` resolves `primary_email_address_id` instead of
 *   `email_addresses[0]` (was pinned as a deliberate "latent gap").
 * - `user.created` writes the Resend contact id to Clerk `external_id`.
 * - `user.deleted` removes the Resend contact (was pinned as 2xx-ignore).
 * - `user.updated` re-creates and re-maps on an email change (was pinned as
 *   2xx-ignore).
 *
 * Everything outbound is stubbed (`svix`, `captureContact`, `resend`,
 * `@clerk/nextjs/server`) — this suite makes zero network calls and needs no
 * Clerk or Resend credentials.
 */

const {
  verifyMock,
  webhookCtor,
  captureContactMock,
  contactsGet,
  contactsRemove,
  resendCtor,
  updateUserMock,
  clerkClientMock,
} = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  webhookCtor: vi.fn(),
  captureContactMock: vi.fn(),
  contactsGet: vi.fn(),
  contactsRemove: vi.fn(),
  resendCtor: vi.fn(),
  updateUserMock: vi.fn(),
  clerkClientMock: vi.fn(),
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

vi.mock('resend', () => ({
  Resend: class {
    contacts = { get: contactsGet, remove: contactsRemove }
    constructor(apiKey: string) {
      resendCtor(apiKey)
    }
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}))

import { POST } from '@/app/api/clerk/webhook/route'

const SIGNING_SECRET = 'whsec_test_not_a_real_secret'
const RESEND_KEY = 're_test_not_a_real_key'

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

/** A Resend `contacts.get` success envelope. */
const contact = (id: string, email: string) => ({
  data: { id, email, object: 'contact' },
  error: null,
})

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test')
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test')
  vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', SIGNING_SECRET)
  vi.stubEnv('RESEND_API_KEY', RESEND_KEY)
  captureContactMock.mockResolvedValue(undefined)
  contactsRemove.mockResolvedValue({ data: { deleted: true }, error: null })
  clerkClientMock.mockResolvedValue({ users: { updateUser: updateUserMock } })
  updateUserMock.mockResolvedValue({})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  verifyMock.mockReset()
  webhookCtor.mockReset()
  captureContactMock.mockReset()
  contactsGet.mockReset()
  contactsRemove.mockReset()
  resendCtor.mockReset()
  updateUserMock.mockReset()
  clerkClientMock.mockReset()
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
    contactsGet.mockResolvedValue(contact('con_1', 'ada@example.test'))

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
    expect(resendCtor).not.toHaveBeenCalled()
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

describe('POST /api/clerk/webhook — user.created', () => {
  it('captures the contact with the primary email plus both name parts', async () => {
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_1', 'ada@example.test'))

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
    contactsGet.mockResolvedValue(contact('con_2', 'noname@example.test'))

    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'noname@example.test',
      firstName: undefined,
      lastName: undefined,
    })
  })

  it('resolves primary_email_address_id, not email_addresses[0] (#86 flip)', async () => {
    // FLIPPED by #86. Wave 3 pinned the opposite ("takes email_addresses[0]
    // and ignores primary_email_address_id (latent gap)") precisely so this
    // change could not land by accident. #86 is entirely about primary-email
    // semantics, so the route now resolves the marked address; the first-entry
    // fallback survives only for payloads with no primary id.
    const event = userEvent('user.created', {
      id: 'user_5',
      email_addresses: [
        { email_address: 'old@example.test', id: 'idn_old' },
        { email_address: 'new-primary@example.test', id: 'idn_new' },
      ],
      primary_email_address_id: 'idn_new',
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_5', 'new-primary@example.test'))

    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'new-primary@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
  })

  it('falls back to the first address when primary_email_address_id dangles', async () => {
    // A primary id that matches nothing is malformed input, not a reason to
    // drop the capture: the pre-#86 behavior is the safe floor here.
    const event = userEvent('user.created', {
      id: 'user_6',
      email_addresses: [{ email_address: 'first@example.test', id: 'idn_a' }],
      primary_email_address_id: 'idn_missing',
    })
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_6', 'first@example.test'))

    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'first@example.test',
      firstName: undefined,
      lastName: undefined,
    })
  })

  it('writes the Resend contact id to Clerk external_id (#86 flip)', async () => {
    // FLIPPED by #86: the mapping did not exist before. This is the link every
    // later event resolves through — without it `user.deleted` (which carries
    // no email) has nothing to act on.
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_1', 'ada@example.test'))

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(resendCtor).toHaveBeenCalledWith(RESEND_KEY)
    expect(contactsGet).toHaveBeenCalledWith({ email: 'ada@example.test' })
    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      externalId: 'con_1',
    })
  })

  it('skips the mapping when external_id is already set (redelivery-safe)', async () => {
    const event = userEvent('user.created', {
      id: 'user_1',
      email_addresses: [{ email_address: 'ada@example.test' }],
      external_id: 'con_existing',
    })
    verifyMock.mockReturnValue(event)

    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledTimes(1)
    expect(contactsGet).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('still 200s when the external_id write fails (mapping never fails the ack)', async () => {
    // Clerk redelivers every non-2xx, and a redelivery re-runs captureContact
    // for a contact that already exists. An unmapped user is repairable by the
    // backfill script; a retry storm is not.
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_1', 'ada@example.test'))
    updateUserMock.mockRejectedValue(new Error('Clerk 500'))

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
  })

  it('still 200s when the contact lookup fails, and writes no mapping', async () => {
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue({
      data: null,
      error: { name: 'not_found', message: 'Contact not found' },
    })

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('captures but never touches Resend directly when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(captureContactMock).toHaveBeenCalledTimes(1)
    expect(resendCtor).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
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
    contactsGet.mockResolvedValue(contact('con_1', 'ada@example.test'))

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
  })

  it('re-captures on redelivery — idempotency is delegated to captureContact', async () => {
    // Clerk retries any non-2xx, so the same event can arrive twice. The route
    // does not deduplicate; captureContact swallows the duplicate-contact
    // conflict instead. The mapping write is idempotent on its own: Clerk
    // receives the same external_id both times.
    const event = userEvent('user.created')
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_1', 'ada@example.test'))

    await POST(makeRequest(event))
    await POST(makeRequest(event))

    expect(captureContactMock).toHaveBeenCalledTimes(2)
    expect(updateUserMock).toHaveBeenNthCalledWith(1, 'user_1', {
      externalId: 'con_1',
    })
    expect(updateUserMock).toHaveBeenNthCalledWith(2, 'user_1', {
      externalId: 'con_1',
    })
  })
})

describe('POST /api/clerk/webhook — user.deleted', () => {
  it('removes the mapped Resend contact by id (#86 flip)', async () => {
    // FLIPPED by #86. Wave 3 pinned "2xx-ignores user.deleted without touching
    // Resend (gap #86 must close)". Removal, not suppression: a Resend
    // suppression blocks transactional mail to the address too.
    const event = {
      type: 'user.deleted',
      data: { id: 'user_1', deleted: true, external_id: 'con_1' },
    }
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
    expect(contactsRemove).toHaveBeenCalledWith('con_1')
  })

  it('2xx no-ops when the payload carries no external_id', async () => {
    // The measured `user.deleted` payload is `{ deleted, id, object }` — an
    // unmapped user (pre-mapping signup, dashboard test delivery) has nothing
    // to act on and no email to fall back to. The contact survives and is
    // reconcilable out of band; a non-2xx here would just be a retry loop.
    const event = {
      type: 'user.deleted',
      data: { id: 'user_1', deleted: true, object: 'user' },
    }
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(contactsRemove).not.toHaveBeenCalled()
    expect(resendCtor).not.toHaveBeenCalled()
  })

  it('still 200s when the removal fails', async () => {
    const event = {
      type: 'user.deleted',
      data: { id: 'user_1', deleted: true, external_id: 'con_1' },
    }
    verifyMock.mockReturnValue(event)
    contactsRemove.mockResolvedValue({
      data: null,
      error: { name: 'not_found', message: 'Contact not found' },
    })

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
  })

  it('still 200s when the removal throws', async () => {
    const event = {
      type: 'user.deleted',
      data: { id: 'user_1', deleted: true, external_id: 'con_1' },
    }
    verifyMock.mockReturnValue(event)
    contactsRemove.mockRejectedValue(new Error('network down'))

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
  })
})

describe('POST /api/clerk/webhook — user.updated', () => {
  const updatedEvent = (overrides: Record<string, unknown> = {}) =>
    userEvent('user.updated', {
      id: 'user_1',
      external_id: 'con_old',
      email_addresses: [
        { email_address: 'old@example.test', id: 'idn_old' },
        { email_address: 'ada.new@example.test', id: 'idn_new' },
      ],
      primary_email_address_id: 'idn_new',
      first_name: 'Ada',
      last_name: 'Lovelace',
      ...overrides,
    })

  it('creates the new contact, removes the old, and re-maps (#86 flip)', async () => {
    // FLIPPED by #86. Wave 3 pinned "2xx-ignores user.updated without touching
    // Resend (gap #86 must close)". Create-then-remove is forced by the SDK:
    // `contacts.update` PATCHes /contacts/:emailOrId and its body carries only
    // names/unsubscribed/properties, so a contact's email cannot be renamed.
    const event = updatedEvent()
    verifyMock.mockReturnValue(event)
    contactsGet
      .mockResolvedValueOnce(contact('con_old', 'old@example.test'))
      .mockResolvedValueOnce(contact('con_new', 'ada.new@example.test'))

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(contactsGet).toHaveBeenNthCalledWith(1, 'con_old')
    expect(captureContactMock).toHaveBeenCalledWith({
      email: 'ada.new@example.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    expect(contactsGet).toHaveBeenNthCalledWith(2, {
      email: 'ada.new@example.test',
    })
    expect(contactsRemove).toHaveBeenCalledWith('con_old')
    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      externalId: 'con_new',
    })
  })

  it('creates before removing, so a failed create leaves the old contact intact', async () => {
    // The ordering IS the safety argument. If the new contact cannot be
    // resolved, the old one must still be in the audience and external_id must
    // still point at it — a no-op, not a data loss.
    const event = updatedEvent()
    verifyMock.mockReturnValue(event)
    contactsGet
      .mockResolvedValueOnce(contact('con_old', 'old@example.test'))
      .mockResolvedValueOnce({
        data: null,
        error: { name: 'not_found', message: 'Contact not found' },
      })

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(contactsRemove).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('no-ops when the primary email is unchanged (redelivery-safe)', async () => {
    const event = updatedEvent()
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_old', 'ada.new@example.test'))

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(captureContactMock).not.toHaveBeenCalled()
    expect(contactsRemove).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('compares addresses case-insensitively', async () => {
    // Resend echoes the stored casing; Clerk may report a differently-cased
    // spelling of the same mailbox. Treating that as a change would delete and
    // recreate the contact on every profile save.
    const event = updatedEvent()
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue(contact('con_old', 'Ada.New@Example.test'))

    await POST(makeRequest(event))

    expect(captureContactMock).not.toHaveBeenCalled()
    expect(contactsRemove).not.toHaveBeenCalled()
  })

  it('2xx no-ops when the user has no external_id mapping', async () => {
    const event = updatedEvent({ external_id: undefined })
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(resendCtor).not.toHaveBeenCalled()
    expect(captureContactMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('2xx no-ops when the mapped contact is unreadable', async () => {
    const event = updatedEvent()
    verifyMock.mockReturnValue(event)
    contactsGet.mockResolvedValue({
      data: null,
      error: { name: 'not_found', message: 'Contact not found' },
    })

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(captureContactMock).not.toHaveBeenCalled()
    expect(contactsRemove).not.toHaveBeenCalled()
  })

  it('2xx no-ops when the payload carries no primary email', async () => {
    const event = updatedEvent({
      email_addresses: [],
      primary_email_address_id: undefined,
    })
    verifyMock.mockReturnValue(event)

    const res = await POST(makeRequest(event))

    expect(res.status).toBe(200)
    expect(resendCtor).not.toHaveBeenCalled()
    expect(captureContactMock).not.toHaveBeenCalled()
  })

  it('skips the removal when the new contact resolves to the same id', async () => {
    // Resend returns the existing contact when an address is re-created. If
    // that is somehow the mapped id, removing it would delete the contact the
    // mapping is about to point at.
    const event = updatedEvent()
    verifyMock.mockReturnValue(event)
    contactsGet
      .mockResolvedValueOnce(contact('con_old', 'old@example.test'))
      .mockResolvedValueOnce(contact('con_old', 'ada.new@example.test'))

    await POST(makeRequest(event))

    expect(contactsRemove).not.toHaveBeenCalled()
    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      externalId: 'con_old',
    })
  })
})

describe('POST /api/clerk/webhook — unhandled events', () => {
  it.each(['session.created', 'organization.created', 'email.created'])(
    '2xx-ignores %s',
    async (type) => {
      const event = { type, data: { id: 'obj_1' } }
      verifyMock.mockReturnValue(event)

      const res = await POST(makeRequest(event))

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ received: true })
      expect(captureContactMock).not.toHaveBeenCalled()
      expect(resendCtor).not.toHaveBeenCalled()
    },
  )
})
