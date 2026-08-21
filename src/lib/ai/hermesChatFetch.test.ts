import { describe, expect, it, vi } from 'vitest'

import {
  createHermesChatFetch,
  SIGN_IN_REQUIRED_CODE,
} from '@/lib/ai/hermesChatFetch'

/**
 * Mobile-staging fix (#74 addendum 2): the wrapper's job is to normalize the
 * sign-in-gate 401 into a message `HermesChat`'s `isSignInRequiredError` can
 * trust, WITHOUT relying on how the AI SDK transport happens to surface a
 * response body as `error.message` (that reliance was the original bug).
 * Every other response must pass through byte-for-byte untouched.
 */

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('createHermesChatFetch', () => {
  it('throws a normalized SIGN_IN_REQUIRED_CODE error on a 401 with the gate code', async () => {
    const baseFetch = vi.fn(async () =>
      jsonResponse(
        {
          error: "You've used your free Hermes messages.",
          code: 'sign_in_required',
        },
        401,
      ),
    )
    const wrapped = createHermesChatFetch(baseFetch)

    await expect(wrapped('/api/ai/chat')).rejects.toThrow(SIGN_IN_REQUIRED_CODE)
  })

  it('passes a 200 streaming response through untouched', async () => {
    const streamResponse = new Response('stream-body', { status: 200 })
    const baseFetch = vi.fn(async () => streamResponse)
    const wrapped = createHermesChatFetch(baseFetch)

    const result = await wrapped('/api/ai/chat')

    expect(result).toBe(streamResponse)
    expect(result.status).toBe(200)
  })

  it('passes a 401 WITHOUT the gate code through untouched (some other auth failure)', async () => {
    const baseFetch = vi.fn(async () =>
      jsonResponse({ error: 'Unauthorized' }, 401),
    )
    const wrapped = createHermesChatFetch(baseFetch)

    const result = await wrapped('/api/ai/chat')

    expect(result.status).toBe(401)
    await expect(result.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('passes a non-JSON 401 body through untouched instead of throwing', async () => {
    const baseFetch = vi.fn(
      async () => new Response('plain text failure', { status: 401 }),
    )
    const wrapped = createHermesChatFetch(baseFetch)

    const result = await wrapped('/api/ai/chat')

    expect(result.status).toBe(401)
    await expect(result.text()).resolves.toBe('plain text failure')
  })

  it('passes the 429 rate-limit response through untouched (not just 200s)', async () => {
    const rateLimited = jsonResponse(
      { error: 'Rate limit exceeded. Please slow down.' },
      429,
    )
    const baseFetch = vi.fn(async () => rateLimited)
    const wrapped = createHermesChatFetch(baseFetch)

    const result = await wrapped('/api/ai/chat')

    expect(result).toBe(rateLimited)
  })

  it('passes a 500 (or any other status) through untouched', async () => {
    const serverError = new Response('boom', { status: 500 })
    const baseFetch = vi.fn(async () => serverError)
    const wrapped = createHermesChatFetch(baseFetch)

    const result = await wrapped('/api/ai/chat')

    expect(result).toBe(serverError)
  })

  it("never calls response.text() to detect the gate (proves independence from the SDK's own body-reading path — the exact method the confirmed mobile-Safari diagnosis implicated)", async () => {
    // Detection reads ONLY response.clone().json(); the original response's
    // own .text() must never be touched by this wrapper — that's what makes
    // the fix durable regardless of whatever the real runtime did with
    // response.text() (the original, now-removed detection depended on it).
    const textSpy = vi.fn(() => {
      throw new Error(
        'response.text() must never be called for a matched gate response',
      )
    })
    const clonedJsonResponse = jsonResponse(
      { code: SIGN_IN_REQUIRED_CODE },
      401,
    )
    const fakeResponse = {
      status: 401,
      ok: false,
      text: textSpy,
      clone: () => clonedJsonResponse,
    } as unknown as Response
    const baseFetch = vi.fn(async () => fakeResponse)
    const wrapped = createHermesChatFetch(baseFetch)

    await expect(wrapped('/api/ai/chat')).rejects.toThrow(SIGN_IN_REQUIRED_CODE)
    expect(textSpy).not.toHaveBeenCalled()
  })

  it('forwards input/init to baseFetch unchanged (credentials/body/headers preserved)', async () => {
    const baseFetch = vi.fn(async () => new Response('ok', { status: 200 }))
    const wrapped = createHermesChatFetch(baseFetch)
    const init: RequestInit = {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
    }

    await wrapped('/api/ai/chat', init)

    expect(baseFetch).toHaveBeenCalledWith('/api/ai/chat', init)
  })
})
