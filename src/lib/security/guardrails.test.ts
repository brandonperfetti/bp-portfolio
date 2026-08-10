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
