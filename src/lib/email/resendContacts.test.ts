// @vitest-environment node
import { Resend } from 'resend'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { removeContactByEmail } from '@/lib/email/resendContacts'

/**
 * `removeContactByEmail`, the one-step removal for a subscriber with no
 * account (#365). The Resend client is a stub: these tests pin which calls
 * it makes and how each answer is read, not Resend itself.
 */

const EMAIL = 'reader@example.test'

/** A stub client whose `contacts.get` and `contacts.remove` answer as given. */
function stubResend(
  get: () => Promise<unknown>,
  remove: () => Promise<unknown> = async () => ({
    data: { object: 'contact', contact: 'contact-1', deleted: true },
    error: null,
  }),
) {
  const contacts = { get: vi.fn(get), remove: vi.fn(remove) }
  return { client: { contacts } as unknown as Resend, contacts }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('removeContactByEmail (#365)', () => {
  it('looks the address up, then removes that contact by id', async () => {
    const { client, contacts } = stubResend(async () => ({
      data: { id: 'contact-1', email: EMAIL },
      error: null,
    }))
    vi.spyOn(console, 'info').mockImplementation(() => {})

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'removed',
    )
    expect(contacts.get).toHaveBeenCalledWith({ email: EMAIL })
    expect(contacts.remove).toHaveBeenCalledWith('contact-1')
  })

  it('answers absent, and removes nothing, when no contact has the address', async () => {
    const { client, contacts } = stubResend(async () => ({
      data: null,
      error: { name: 'not_found', statusCode: 404, message: 'Not found' },
    }))

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'absent',
    )
    expect(contacts.remove).not.toHaveBeenCalled()
  })

  it('answers unconfirmed, never absent, when the lookup fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, contacts } = stubResend(async () => ({
      data: null,
      error: {
        name: 'internal_server_error',
        statusCode: 500,
        message: `nothing for ${EMAIL}`,
      },
    }))

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'unconfirmed',
    )
    expect(contacts.remove).not.toHaveBeenCalled()
    // The address stays out of the log, even when Resend's message echoes it.
    expect(JSON.stringify(error.mock.calls)).not.toContain(EMAIL)
  })

  it('answers unconfirmed when Resend refuses the removal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = stubResend(
      async () => ({ data: { id: 'contact-1', email: EMAIL }, error: null }),
      async () => ({
        data: null,
        error: { name: 'rate_limit_exceeded', message: 'slow down' },
      }),
    )

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'unconfirmed',
    )
  })

  it('answers unconfirmed, not absent, for a 404 that is not Resend not_found', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, contacts } = stubResend(async () => ({
      data: null,
      error: { name: 'application_error', statusCode: 404, message: '<html>' },
    }))

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'unconfirmed',
    )
    expect(contacts.remove).not.toHaveBeenCalled()
  })

  it('answers unconfirmed when the removal reply does not say deleted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = stubResend(
      async () => ({ data: { id: 'contact-1', email: EMAIL }, error: null }),
      async () => ({
        data: { object: 'contact', contact: 'contact-1', deleted: false },
        error: null,
      }),
    )

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'unconfirmed',
    )
  })

  it('keeps the address out of the log when the removal error echoes it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = stubResend(
      async () => ({ data: { id: 'contact-1', email: EMAIL }, error: null }),
      async () => ({
        data: null,
        error: { name: 'validation_error', message: `bad ${EMAIL}` },
      }),
    )

    await removeContactByEmail(client, EMAIL, 'test')
    expect(JSON.stringify(error.mock.calls)).not.toContain(EMAIL)
  })

  it('answers unconfirmed when the client throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = stubResend(async () => {
      throw new Error(`fetch failed for /contacts/${EMAIL}`)
    })

    await expect(removeContactByEmail(client, EMAIL, 'test')).resolves.toBe(
      'unconfirmed',
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain(EMAIL)
  })

  it.each([
    ['reader#tag@example.test', '/contacts/reader%23tag@example.test'],
    ['reader?x@example.test', '/contacts/reader%3Fx@example.test'],
    ['a/b@example.test', '/contacts/a%2Fb@example.test'],
    [EMAIL, `/contacts/${EMAIL}`],
  ])(
    'asks the real SDK for exactly %s, as one path segment',
    async (address, path) => {
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ name: 'not_found', message: 'Not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          ),
      )
      vi.stubGlobal('fetch', fetchMock)
      vi.stubEnv('NODE_ENV', 'production')
      try {
        await removeContactByEmail(new Resend('re_test'), address, 'test')
        const [url] = fetchMock.mock.calls[0] as unknown as [string]
        expect(new URL(url).pathname).toBe(path)
        expect(new URL(url).hash).toBe('')
        expect(new URL(url).search).toBe('')
      } finally {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
      }
    },
  )
})
