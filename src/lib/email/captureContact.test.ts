import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureContact } from '@/lib/email/captureContact'

/**
 * Contract suite for the shared Resend capture path (Clerk webhook +
 * contact-form opt-in). The invariant that matters: this function NEVER
 * throws — capture is always secondary to the caller's real job
 * (delivering a message, acking a webhook), so every failure mode must
 * degrade to a log line.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    contacts = { create: createMock }
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  createMock.mockReset()
})

describe('captureContact', () => {
  it('no-ops (without calling Resend) when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await captureContact({ email: 'a@example.com' })
    expect(createMock).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('creates the contact, threading the segment when configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key')
    vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', 'seg-1')
    createMock.mockResolvedValue({ error: null })
    await captureContact({ email: 'a@example.com', firstName: 'Ada' })
    expect(createMock).toHaveBeenCalledWith({
      email: 'a@example.com',
      firstName: 'Ada',
      lastName: undefined,
      segments: [{ id: 'seg-1' }],
    })
  })

  it('omits segments entirely when no segment is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key')
    vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', '')
    createMock.mockResolvedValue({ error: null })
    await captureContact({ email: 'a@example.com' })
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('segments')
  })

  it('swallows API-reported errors (duplicate contact is expected noise)', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key')
    createMock.mockResolvedValue({
      error: { name: 'conflict', message: 'Contact already exists' },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      captureContact({ email: 'a@example.com' }),
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('swallows thrown/network errors', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key')
    createMock.mockRejectedValue(new Error('network down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      captureContact({ email: 'a@example.com' }),
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
