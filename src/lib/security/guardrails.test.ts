import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getRequestClientIp,
  isAllowedRequestSource,
} from '@/lib/security/guardrails'

/**
 * Regression suite for the Hermes chat source guard.
 *
 * The staging incident (2026-08): staging keeps `NEXT_PUBLIC_SITE_URL`
 * pointed at production for SEO canonicals, so an env-only allowlist
 * rejected every same-origin request on staging with 403. The guard must
 * accept the host actually serving the request.
 */

const makeRequest = (headers: Record<string, string>) =>
  new Request('https://example.test/api/ai/chat', {
    method: 'POST',
    headers,
  })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isAllowedRequestSource', () => {
  it('allows same-origin requests on the serving host (staging regression)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://brandonperfetti.com')
    const request = makeRequest({
      'x-forwarded-host': 'staging.brandonperfetti.com',
      origin: 'https://staging.brandonperfetti.com',
    })
    expect(isAllowedRequestSource(request)).toBe(true)
  })

  it('still allows the NEXT_PUBLIC_SITE_URL host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://brandonperfetti.com')
    const request = makeRequest({
      'x-forwarded-host': 'staging.brandonperfetti.com',
      origin: 'https://brandonperfetti.com',
    })
    expect(isAllowedRequestSource(request)).toBe(true)
  })

  it('rejects cross-site origins even with a valid serving host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://brandonperfetti.com')
    const request = makeRequest({
      'x-forwarded-host': 'staging.brandonperfetti.com',
      origin: 'https://evil.example',
    })
    expect(isAllowedRequestSource(request)).toBe(false)
  })

  it('rejects requests with neither Origin nor Referer', () => {
    const request = makeRequest({
      'x-forwarded-host': 'staging.brandonperfetti.com',
    })
    expect(isAllowedRequestSource(request)).toBe(false)
  })

  it('accepts a valid Referer when Origin is absent', () => {
    const request = makeRequest({
      'x-forwarded-host': 'staging.brandonperfetti.com',
      referer: 'https://staging.brandonperfetti.com/hermes',
    })
    expect(isAllowedRequestSource(request)).toBe(true)
  })

  it('falls back to the host header when x-forwarded-host is absent', () => {
    const request = makeRequest({
      host: 'preview-abc123.vercel.app',
      origin: 'https://preview-abc123.vercel.app',
    })
    expect(isAllowedRequestSource(request)).toBe(true)
  })
})

describe('getRequestClientIp', () => {
  it('prefers the platform-set x-real-ip', () => {
    const request = makeRequest({
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': 'spoofed.example, 203.0.113.7',
    })
    expect(getRequestClientIp(request)).toBe('203.0.113.7')
  })

  it('uses the RIGHTMOST x-forwarded-for hop, never the spoofable leftmost (M2 regression)', () => {
    // The leftmost XFF entry is client-prependable; keying rate limits on
    // it let attackers mint a fresh bucket per request.
    const request = makeRequest({
      'x-forwarded-for': '6.6.6.6, 203.0.113.9',
    })
    expect(getRequestClientIp(request)).toBe('203.0.113.9')
  })

  it('returns unknown when no proxy headers are present', () => {
    expect(getRequestClientIp(makeRequest({}))).toBe('unknown')
  })
})

describe('verifyRequestTurnstileToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is a no-op (ok, not required) when TURNSTILE_SECRET_KEY is unset', async () => {
    const { verifyRequestTurnstileToken } =
      await import('@/lib/security/guardrails')
    const result = await verifyRequestTurnstileToken({ token: 'anything' })
    expect(result).toEqual({ required: false, ok: true })
  })

  it('fails closed when configured and the token is missing', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1')
    const { verifyRequestTurnstileToken } =
      await import('@/lib/security/guardrails')
    const result = await verifyRequestTurnstileToken({ token: '' })
    expect(result).toEqual({ required: true, ok: false })
  })

  it('accepts when Cloudflare reports success', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }))),
    )
    const { verifyRequestTurnstileToken } =
      await import('@/lib/security/guardrails')
    const result = await verifyRequestTurnstileToken({
      token: 'tok',
      ip: '1.2.3.4',
    })
    expect(result).toEqual({ required: true, ok: true })
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(call[0])).toContain('challenges.cloudflare.com')
    expect(String(call[1].body)).toContain('remoteip=1.2.3.4')
  })

  it('rejects when Cloudflare reports failure', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }))),
    )
    const { verifyRequestTurnstileToken } =
      await import('@/lib/security/guardrails')
    const result = await verifyRequestTurnstileToken({ token: 'tok' })
    expect(result).toEqual({ required: true, ok: false })
  })

  it('fails closed on verification API transport errors', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const { verifyRequestTurnstileToken } =
      await import('@/lib/security/guardrails')
    const result = await verifyRequestTurnstileToken({ token: 'tok' })
    expect(result).toEqual({ required: true, ok: false })
  })

  it('fails closed on non-200 verification responses', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    )
    const { verifyRequestTurnstileToken } =
      await import('@/lib/security/guardrails')
    const result = await verifyRequestTurnstileToken({ token: 'tok' })
    expect(result).toEqual({ required: true, ok: false })
  })
})
