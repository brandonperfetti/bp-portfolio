import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureContact } from '@/lib/email/captureContact'

/**
 * Contract suite for the shared Resend capture path (Clerk webhook, the
 * contact form's opt-in, the Newsletter Signup form). Two invariants: it
 * NEVER throws, because capture is secondary to the webhook's and the contact
 * form's real job; and it reports an outcome that never tells a new contact
 * from an existing one, because the newsletter route answers from it.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  listSegments: vi.fn(),
  addSegment: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: class {
    contacts = {
      create: mocks.create,
      get: mocks.get,
      update: mocks.update,
      segments: { list: mocks.listSegments, add: mocks.addSegment },
    }
  },
}))

/** Resend's answer to a lookup of an absent contact (measured 2026-11-21). */
const NOT_FOUND = {
  data: null,
  error: { statusCode: 404, message: 'Contact not found', name: 'not_found' },
}

const existing = (unsubscribed: boolean) => ({
  data: {
    id: 'c_1',
    email: 'a@example.com',
    unsubscribed,
    first_name: null,
    last_name: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  error: null,
})

const segmentsPage = (ids: string[]) => ({
  data: {
    object: 'list',
    has_more: false,
    data: ids.map((id) => ({ id, name: id, created_at: '' })),
  },
  error: null,
})

const SERVER_ERROR = {
  data: null,
  error: { statusCode: 500, name: 'internal_server_error', message: 'boom' },
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'key')
  vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', 'seg-1')
  mocks.get.mockResolvedValue(NOT_FOUND)
  mocks.create.mockResolvedValue({ data: { id: 'c_new' }, error: null })
  mocks.update.mockResolvedValue({ data: { id: 'c_1' }, error: null })
  mocks.listSegments.mockResolvedValue(segmentsPage([]))
  mocks.addSegment.mockResolvedValue({ data: { id: 'seg-1' }, error: null })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  errorSpy.mockRestore()
})

describe('captureContact', () => {
  it('skips (without calling Resend) when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(captureContact({ email: 'a@example.com' })).resolves.toEqual({
      status: 'skipped',
    })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  describe('a new address', () => {
    it('creates the contact, threading the segment when configured', async () => {
      const outcome = await captureContact({
        email: 'a@example.com',
        firstName: 'Ada',
      })
      expect(outcome).toEqual({ status: 'captured' })
      expect(mocks.get).toHaveBeenCalledWith({ email: 'a@example.com' })
      expect(mocks.create).toHaveBeenCalledWith({
        email: 'a@example.com',
        firstName: 'Ada',
        lastName: undefined,
        segments: [{ id: 'seg-1' }],
      })
      expect(mocks.addSegment).not.toHaveBeenCalled()
    })

    it('omits segments entirely when no segment is configured', async () => {
      vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', '')
      await captureContact({ email: 'a@example.com' })
      expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('segments')
    })

    it('sends no unsubscribed field, even with rejoin', async () => {
      await captureContact({ email: 'a@example.com' }, { rejoin: true })
      expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('unsubscribed')
    })

    it('reports a refused create as a failure, never a throw', async () => {
      mocks.create.mockResolvedValue(SERVER_ERROR)
      await expect(captureContact({ email: 'a@example.com' })).resolves.toEqual(
        {
          status: 'failed',
          stage: 'create',
          errorName: 'internal_server_error',
          statusCode: 500,
        },
      )
      expect(errorSpy).toHaveBeenCalled()
    })

    it("keeps Resend's message, which can echo the address, out of the log", async () => {
      mocks.create.mockResolvedValue({
        data: null,
        error: {
          statusCode: 422,
          name: 'validation_error',
          message: 'a@example.com is invalid',
        },
      })
      await captureContact({ email: 'a@example.com' })
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('a@example.com')
    })
  })

  describe('an existing contact (#406)', () => {
    it('adds it to the segment when it is not in it', async () => {
      mocks.get.mockResolvedValue(existing(false))
      const outcome = await captureContact({ email: 'a@example.com' })
      expect(outcome).toEqual({ status: 'captured' })
      expect(mocks.create).not.toHaveBeenCalled()
      expect(mocks.listSegments).toHaveBeenCalledWith({
        email: 'a@example.com',
        limit: 100,
      })
      expect(mocks.addSegment).toHaveBeenCalledWith({
        email: 'a@example.com',
        segmentId: 'seg-1',
      })
    })

    it('leaves it alone when it is already in the segment', async () => {
      mocks.get.mockResolvedValue(existing(false))
      mocks.listSegments.mockResolvedValue(segmentsPage(['other', 'seg-1']))
      await expect(captureContact({ email: 'a@example.com' })).resolves.toEqual(
        { status: 'captured' },
      )
      expect(mocks.addSegment).not.toHaveBeenCalled()
    })

    it('reads every page of segments before deciding to add', async () => {
      mocks.get.mockResolvedValue(existing(false))
      mocks.listSegments
        .mockResolvedValueOnce({
          ...segmentsPage(['a', 'b']),
          data: { ...segmentsPage(['a', 'b']).data, has_more: true },
        })
        .mockResolvedValueOnce(segmentsPage(['seg-1']))
      await captureContact({ email: 'a@example.com' })
      expect(mocks.listSegments).toHaveBeenLastCalledWith({
        email: 'a@example.com',
        limit: 100,
        after: 'b',
      })
      expect(mocks.addSegment).not.toHaveBeenCalled()
    })

    it('makes no segment call when no segment is configured', async () => {
      vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', '')
      mocks.get.mockResolvedValue(existing(false))
      await expect(captureContact({ email: 'a@example.com' })).resolves.toEqual(
        { status: 'captured' },
      )
      expect(mocks.listSegments).not.toHaveBeenCalled()
      expect(mocks.addSegment).not.toHaveBeenCalled()
      expect(mocks.create).not.toHaveBeenCalled()
    })

    it('reports a failed segment add, logged and never thrown', async () => {
      mocks.get.mockResolvedValue(existing(false))
      mocks.addSegment.mockResolvedValue(SERVER_ERROR)
      await expect(captureContact({ email: 'a@example.com' })).resolves.toEqual(
        {
          status: 'failed',
          stage: 'segment',
          errorName: 'internal_server_error',
          statusCode: 500,
        },
      )
      expect(errorSpy).toHaveBeenCalled()
    })

    it('reports a failed segment read without adding', async () => {
      mocks.get.mockResolvedValue(existing(false))
      mocks.listSegments.mockResolvedValue(SERVER_ERROR)
      const outcome = await captureContact({ email: 'a@example.com' })
      expect(outcome).toMatchObject({ status: 'failed', stage: 'segment' })
      expect(mocks.addSegment).not.toHaveBeenCalled()
    })

    it('leaves an opt-out alone without rejoin (webhook, contact form)', async () => {
      mocks.get.mockResolvedValue(existing(true))
      await captureContact({ email: 'a@example.com' })
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.addSegment).toHaveBeenCalled()
    })
  })

  describe('rejoin (#407)', () => {
    it('sets an unsubscribed contact back to subscribed, then into the segment', async () => {
      mocks.get
        .mockResolvedValueOnce(existing(true))
        .mockResolvedValueOnce(existing(false))
      const outcome = await captureContact(
        { email: 'a@example.com' },
        { rejoin: true },
      )
      expect(outcome).toEqual({ status: 'captured' })
      expect(mocks.update).toHaveBeenCalledWith({
        email: 'a@example.com',
        unsubscribed: false,
      })
      expect(mocks.addSegment).toHaveBeenCalledWith({
        email: 'a@example.com',
        segmentId: 'seg-1',
      })
    })

    it('reports a failure when the contact is still unsubscribed after the update', async () => {
      mocks.get.mockResolvedValue(existing(true))
      const outcome = await captureContact(
        { email: 'a@example.com' },
        { rejoin: true },
      )
      expect(outcome).toMatchObject({
        status: 'failed',
        stage: 'resubscribe',
        errorName: 'resubscribe_not_applied',
      })
      expect(mocks.update).toHaveBeenCalledTimes(1)
      expect(mocks.addSegment).not.toHaveBeenCalled()
    })

    it('makes no update for a contact already subscribed', async () => {
      mocks.get.mockResolvedValue(existing(false))
      await captureContact({ email: 'a@example.com' }, { rejoin: true })
      expect(mocks.update).not.toHaveBeenCalled()
    })

    it('reports a refused update and stops before the segment', async () => {
      mocks.get.mockResolvedValue(existing(true))
      mocks.update.mockResolvedValue(SERVER_ERROR)
      const outcome = await captureContact(
        { email: 'a@example.com' },
        { rejoin: true },
      )
      expect(outcome).toMatchObject({ status: 'failed', stage: 'resubscribe' })
      expect(mocks.addSegment).not.toHaveBeenCalled()
    })

    it('reports a thrown update by stage, never a throw', async () => {
      mocks.get.mockResolvedValue(existing(true))
      mocks.update.mockRejectedValue(new Error('network down'))
      await expect(
        captureContact({ email: 'a@example.com' }, { rejoin: true }),
      ).resolves.toEqual({ status: 'failed', stage: 'resubscribe' })
    })
  })

  describe('lookup failures', () => {
    it('reports a lookup error other than not_found, and writes nothing', async () => {
      mocks.get.mockResolvedValue({
        data: null,
        error: {
          statusCode: 429,
          name: 'rate_limit_exceeded',
          message: 'slow',
        },
      })
      const outcome = await captureContact({ email: 'a@example.com' })
      expect(outcome).toMatchObject({
        status: 'failed',
        stage: 'lookup',
        errorName: 'rate_limit_exceeded',
      })
      expect(mocks.create).not.toHaveBeenCalled()
    })

    it('swallows thrown/network errors', async () => {
      mocks.get.mockRejectedValue(new Error('network down'))
      await expect(captureContact({ email: 'a@example.com' })).resolves.toEqual(
        { status: 'failed', stage: 'lookup' },
      )
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})
