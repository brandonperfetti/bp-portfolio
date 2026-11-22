// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureContact } from '@/lib/email/captureContact'

/**
 * The request paths `captureContact` makes through the real Resend SDK
 * (#418). The SDK puts the address into `/contacts/<email>` unencoded
 * (`resend@6.18.1`), so these drive the real client against a stubbed `fetch`
 * and read the URL it built. `captureContact.test.ts` mocks the SDK, so it
 * cannot see a path.
 */

/** Address, and the path segment it must travel as. */
const ADDRESSES: [string, string][] = [
  ['reader#tag@example.test', 'reader%23tag@example.test'],
  ['reader?x@example.test', 'reader%3Fx@example.test'],
  ['a/b@example.test', 'a%2Fb@example.test'],
  ['reader@example.test', 'reader@example.test'],
  // A `+` is valid in a path segment and goes out as it did before.
  ['reader+tag@example.test', 'reader+tag@example.test'],
]

type Call = {
  method: string
  pathname: string
  search: string
  hash: string
  body: unknown
}

/** JSON reply in the shape the SDK reads. */
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Stub `fetch` as a Resend that knows the contact (or not) and answer each
 * call by its method and path, recording the URL the SDK built.
 */
function stubResend(known: { unsubscribed: boolean } | null) {
  const calls: Call[] = []
  let unsubscribed = known?.unsubscribed ?? false
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({
      method,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    if (method === 'POST' && url.pathname === '/contacts') {
      return reply(201, { object: 'contact', id: 'c_new' })
    }
    if (method === 'GET' && url.pathname.endsWith('/segments')) {
      return reply(200, { object: 'list', has_more: false, data: [] })
    }
    if (method === 'POST') return reply(201, { id: 'seg-1' })
    if (method === 'PATCH') {
      unsubscribed = false
      return reply(200, { object: 'contact', id: 'c_1' })
    }
    if (!known) return reply(404, { name: 'not_found', message: 'Not found' })
    return reply(200, {
      object: 'contact',
      id: 'c_1',
      email: 'stored@example.test',
      unsubscribed,
      first_name: null,
      last_name: null,
      created_at: '2026-01-01T00:00:00Z',
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('RESEND_CONTACT_SEGMENT_ID', 'seg-1')
  // The SDK logs a failed request's path, address included, outside production.
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('captureContact request paths (#418)', () => {
  it.each(ADDRESSES)(
    'looks %s up as one path segment, and creates it with the address as given',
    async (address, segment) => {
      const calls = stubResend(null)

      await expect(captureContact({ email: address })).resolves.toEqual({
        status: 'captured',
      })

      expect(calls.map((c) => `${c.method} ${c.pathname}`)).toEqual([
        `GET /contacts/${segment}`,
        'POST /contacts',
      ])
      expect(calls.every((c) => c.search === '' && c.hash === '')).toBe(true)
      // The body is JSON, not a path: it carries the address unencoded.
      expect(calls[1].body).toMatchObject({ email: address })
    },
  )

  it.each(ADDRESSES)(
    'rejoins %s and adds it to the segment, every call on that one segment',
    async (address, segment) => {
      const calls = stubResend({ unsubscribed: true })

      await expect(
        captureContact({ email: address }, { rejoin: true }),
      ).resolves.toEqual({ status: 'captured' })

      expect(calls.map((c) => `${c.method} ${c.pathname}`)).toEqual([
        `GET /contacts/${segment}`,
        `PATCH /contacts/${segment}`,
        `GET /contacts/${segment}`,
        `GET /contacts/${segment}/segments`,
        `POST /contacts/${segment}/segments/seg-1`,
      ])
      expect(calls.every((c) => c.hash === '')).toBe(true)
      expect(calls[3].search).toBe('?limit=100')
      expect(
        calls.filter((c) => c !== calls[3]).every((c) => c.search === ''),
      ).toBe(true)
    },
  )
})
