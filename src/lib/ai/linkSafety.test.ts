import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createCorvusLinkCheck,
  isInternalCorvusLink,
} from '@/lib/ai/linkSafety'

/**
 * #144. The predicate that decides whether a link in a Corvus reply gets
 * streamdown's "external website" confirmation.
 *
 * @remarks `getSiteUrl()` reads `process.env.NEXT_PUBLIC_SITE_URL` on every
 * call, so these tests set it per case rather than relying on whatever the
 * shell exports — the same reason `linkSafety.ts` does not memoise its host
 * set at module scope.
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

describe('isInternalCorvusLink', () => {
  it.each([
    ['/tech', 'the citation path from the ticket'],
    ['/articles/from-neon-to-supabase', 'a nested article route'],
    ['/', 'the home page'],
    ['#top', 'a same-document fragment'],
    ['?q=corvus', 'a same-document query'],
  ])('treats %s as internal (%s)', (href) => {
    expect(isInternalCorvusLink(href)).toBe(true)
  })

  it('treats an absolute URL on the configured site host as internal', () => {
    expect(isInternalCorvusLink('https://example-site.test/tech')).toBe(true)
  })

  it('follows NEXT_PUBLIC_SITE_URL rather than a hard-coded host', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://moved.test'

    expect(isInternalCorvusLink('https://moved.test/tech')).toBe(true)
    expect(isInternalCorvusLink('https://example-site.test/tech')).toBe(false)
  })

  it('tolerates a trailing slash on the configured site URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example-site.test/'

    expect(isInternalCorvusLink('https://example-site.test/tech')).toBe(true)
  })

  it.each(['http://localhost:3000/tech', 'http://127.0.0.1/tech'])(
    'treats the dev host %s as internal',
    (href) => {
      expect(isInternalCorvusLink(href)).toBe(true)
    },
  )

  it('treats the host currently being served as internal', () => {
    // The measured #144 report came from a staging deploy; naming staging
    // hosts is exactly what this avoids.
    expect(
      isInternalCorvusLink('https://staging.example-site.test/tech', {
        currentHost: 'staging.example-site.test',
      }),
    ).toBe(true)

    expect(isInternalCorvusLink('https://staging.example-site.test/tech')).toBe(
      false,
    )
  })

  it.each([
    ['https://vercel.com/docs', 'a plain off-site link'],
    ['http://evil.test/phish', 'an off-site link over http'],
    ['https://example-site.test.evil.test/tech', 'a suffix-confusion host'],
    ['https://evil.test/?x=https://example-site.test', 'the host in a query'],
  ])('treats %s as external (%s)', (href) => {
    expect(isInternalCorvusLink(href)).toBe(false)
  })

  it('does not let a protocol-relative URL pass as a relative path', () => {
    expect(isInternalCorvusLink('//evil.test/phish')).toBe(false)
  })

  it.each([
    ['mailto:brandon@example-site.test', 'mail'],
    ['tel:+15550100', 'telephone'],
    ['javascript:alert(1)', 'script'],
    ['data:text/html,<b>x</b>', 'data'],
  ])('treats the %s scheme as external (%s)', (href) => {
    // Not "internal" — these are not this site, and a non-http(s) target has
    // no business skipping the confirmation.
    expect(isInternalCorvusLink(href)).toBe(false)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['tech', 'a bare word'],
  ])('treats %s as external (%s)', (href) => {
    expect(isInternalCorvusLink(href)).toBe(false)
  })

  it('treats a missing href as external', () => {
    expect(isInternalCorvusLink(null)).toBe(false)
    expect(isInternalCorvusLink(undefined)).toBe(false)
  })

  it('keeps local defaults when NEXT_PUBLIC_SITE_URL is malformed', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url'

    expect(isInternalCorvusLink('/tech')).toBe(true)
    expect(isInternalCorvusLink('http://localhost:3000/tech')).toBe(true)
    expect(isInternalCorvusLink('https://vercel.com/docs')).toBe(false)
  })
})

describe('createCorvusLinkCheck', () => {
  it('returns a synchronous predicate streamdown can await', () => {
    const onLinkCheck = createCorvusLinkCheck()

    // Boolean, not a promise: the internal-link click must stay inside the
    // user gesture rather than resuming a microtask later.
    expect(onLinkCheck('/tech')).toBe(true)
    expect(onLinkCheck('https://vercel.com/docs')).toBe(false)
  })

  it('threads currentHost through to the predicate', () => {
    const onLinkCheck = createCorvusLinkCheck({
      currentHost: 'preview-abc.vercel.app',
    })

    expect(onLinkCheck('https://preview-abc.vercel.app/tech')).toBe(true)
    expect(onLinkCheck('https://other-preview.vercel.app/tech')).toBe(false)
  })
})
