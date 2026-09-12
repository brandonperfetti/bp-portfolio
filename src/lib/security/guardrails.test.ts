import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  getRequestClientIp,
  getSecurityLimits,
  isAllowedRequestSource,
} from '@/lib/security/guardrails'

/**
 * Regression suite for the Corvus chat source guard.
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
      referer: 'https://staging.brandonperfetti.com/corvus',
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
    // Force-empty rather than assume-absent: developers with real Turnstile
    // keys in their local .env (the expected state after setup) must not
    // see this test flip — caught live on the first post-setup push.
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
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

/**
 * Reasoning-effort resolver (#138 option 2, Brandon 2026-09-11).
 *
 * @remarks The knob exists because hidden reasoning is billed against the
 * same `maxCompletionTokens` allowance as the visible answer on a reasoning
 * model, so `AI_REASONING_EFFORT` and `AI_MAX_COMPLETION_TOKENS` spend one
 * budget between them. The properties pinned here are the ones a bad deploy
 * would break: the default is the value the eval mirror and `.env.example`
 * are drift-guarded against (`scripts/eval-harness.test.ts`), and an
 * unrecognized value must degrade rather than throw — this runs on the chat
 * request path, and a fat-fingered env var taking Corvus down would be a
 * worse outage than the truncation it was set to fix.
 */
describe('getSecurityLimits — reasoningEffort', () => {
  it('defaults to the documented effort when the env is unset', () => {
    vi.stubEnv('AI_REASONING_EFFORT', undefined as unknown as string)

    expect(getSecurityLimits().reasoningEffort).toBe(DEFAULT_REASONING_EFFORT)
    // `[measured, keyed, 2026-09-11]` the rung Brandon's probes settled on:
    // `minimal`/1024 cleared the safety file 4/4 with no truncation at 75% in
    // 9.4s, where `low`/1024 still lost the safety-essay refusal on both
    // attempts, and `low`/2048 scored the same for ~3x the wall clock.
    expect(DEFAULT_REASONING_EFFORT).toBe('minimal')
  })

  it.each(REASONING_EFFORTS)('honours the valid value %s', (effort) => {
    vi.stubEnv('AI_REASONING_EFFORT', effort)

    expect(getSecurityLimits().reasoningEffort).toBe(effort)
  })

  it('accepts a value whatever its case or padding', () => {
    vi.stubEnv('AI_REASONING_EFFORT', '  MINIMAL ')

    expect(getSecurityLimits().reasoningEffort).toBe('minimal')
  })

  it.each([
    ['an unknown rung', 'lowest'],
    ['a number', '1'],
    ['a provider-shaped typo', 'mimimal'],
  ])('falls back to the default on %s, with one warning', (_case, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AI_REASONING_EFFORT', value)

    expect(getSecurityLimits().reasoningEffort).toBe(DEFAULT_REASONING_EFFORT)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('AI_REASONING_EFFORT')
    warn.mockRestore()
  })

  it('never throws on a bad value — a bad env must not take the chat down', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AI_REASONING_EFFORT', 'definitely-not-an-effort')

    expect(() => getSecurityLimits()).not.toThrow()
    warn.mockRestore()
  })

  it('treats an empty value as unset, silently', () => {
    // Deploy platforms hand an unset variable through as `''` often enough
    // that warning on it would cry wolf on a correct configuration.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AI_REASONING_EFFORT', '')

    expect(getSecurityLimits().reasoningEffort).toBe(DEFAULT_REASONING_EFFORT)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
