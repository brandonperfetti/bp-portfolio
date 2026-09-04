import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getExternalLinkProps,
  isExternalHref,
  isInternalHost,
} from '@/lib/link-utils'

/**
 * `src/lib/link-utils.ts` had no tests. It acquired them when #144 pulled the
 * internal-host decision out of it into a shared {@link isInternalHost} that
 * Corvus's streamdown link guard also consumes — a definition two modules now
 * depend on should not be the untested one.
 *
 * @remarks `getSiteUrl()` reads `process.env.NEXT_PUBLIC_SITE_URL` on every
 * call, so these set it per case. That is itself a behaviour change worth
 * pinning: the host set used to be memoised at module scope, which froze
 * whatever value existed at import time.
 */

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example-site.test'
})

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  }
})

describe('isInternalHost', () => {
  it('accepts the configured site host', () => {
    expect(isInternalHost('example-site.test')).toBe(true)
  })

  it('follows NEXT_PUBLIC_SITE_URL rather than a hard-coded host', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://moved.test'

    expect(isInternalHost('moved.test')).toBe(true)
    expect(isInternalHost('example-site.test')).toBe(false)
  })

  it.each(['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000'])(
    'accepts the local/e2e host %s',
    (host) => {
      // `127.0.0.1:3000` is the Playwright `use.baseURL` origin
      // (docs/TESTING.md); it was missing before the set was shared.
      expect(isInternalHost(host)).toBe(true)
    },
  )

  it.each([
    'vercel.com',
    'example-site.test.evil.test',
    'evil.test',
    'sub.example-site.test',
  ])('rejects the off-site host %s', (host) => {
    expect(isInternalHost(host)).toBe(false)
  })

  it('keeps the local defaults when NEXT_PUBLIC_SITE_URL is malformed', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url'

    expect(isInternalHost('localhost:3000')).toBe(true)
    expect(isInternalHost('vercel.com')).toBe(false)
  })
})

describe('isExternalHref', () => {
  it.each(['/tech', '#top', '?q=x'])('treats %s as internal', (href) => {
    expect(isExternalHref(href)).toBe(false)
  })

  it('treats an absolute own-host URL as internal', () => {
    expect(isExternalHref('https://example-site.test/tech')).toBe(false)
  })

  it('treats an off-site URL as external', () => {
    expect(isExternalHref('https://vercel.com/docs')).toBe(true)
  })

  it('treats mailto: and tel: as internal — no target=_blank needed', () => {
    // Deliberately DIFFERENT from `isInternalCorvusLink`, which answers a
    // safety-confirmation question and rejects every non-http(s) scheme.
    // The divergence is documented on that function.
    expect(isExternalHref('mailto:brandon@example-site.test')).toBe(false)
    expect(isExternalHref('tel:+15550100')).toBe(false)
  })

  it('treats a non-http(s) scheme as internal (no new tab)', () => {
    expect(isExternalHref('ftp://files.evil.test')).toBe(false)
  })

  it.each([null, undefined, ''])('treats %s as internal', (href) => {
    expect(isExternalHref(href)).toBe(false)
  })

  it('reads a URL object and a Next href object', () => {
    expect(isExternalHref(new URL('https://vercel.com/docs'))).toBe(true)
    expect(isExternalHref({ pathname: '/tech' })).toBe(false)
  })
})

describe('getExternalLinkProps', () => {
  it('adds a safe new-tab rel for an off-site link', () => {
    expect(getExternalLinkProps('https://vercel.com/docs')).toEqual({
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })

  it('adds nothing for an internal link', () => {
    expect(getExternalLinkProps('/tech')).toEqual({})
  })
})
