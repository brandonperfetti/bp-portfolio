import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  classifyCorvusLink,
  isInternalCorvusLink,
  STREAMDOWN_INCOMPLETE_LINK,
} from '@/lib/ai/linkSafety'

/**
 * #144, then #158. The predicate that decides whether a link in a Corvus
 * reply is this site — and so, since #158, whether it renders as a real
 * same-tab anchor or as a button carrying a confirmation.
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

  it.each([
    'http://localhost:3000/tech',
    'http://127.0.0.1/tech',
    // The Playwright `use.baseURL` origin (docs/TESTING.md); inherited from
    // the shared host set in `link-utils.ts`.
    'http://127.0.0.1:3000/tech',
  ])('treats the dev/e2e host %s as internal', (href) => {
    expect(isInternalCorvusLink(href)).toBe(true)
  })

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
    ['/\\evil.test/phish', 'slash-backslash'],
    ['/\\\\evil.test/phish', 'slash and two backslashes'],
    ['\\\\evil.test/phish', 'two leading backslashes'],
  ])('does not let %s pass as a relative path (%s)', (href) => {
    // WHATWG treats `\` as a path separator for special schemes, so these
    // resolve to `https://evil.test/phish` against this site's origin — a
    // protocol-relative URL wearing a disguise `startsWith('//')` cannot see.
    expect(
      new URL(href, 'https://brandonperfetti.com/corvus').host,
      'the disguise is real, not hypothetical',
    ).toBe('evil.test')
    expect(isInternalCorvusLink(href)).toBe(false)
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

/**
 * #158. `classifyCorvusLink` is what decides between a same-tab anchor and a
 * confirmation, and — the new part — which confirmation.
 */
describe('classifyCorvusLink', () => {
  it.each([
    ['/tech', 'internal'],
    ['#top', 'internal'],
    ['https://example-site.test/tech', 'internal'],
    ['https://vercel.com/docs', 'external'],
    ['//evil.test/phish', 'external'],
    ['mailto:brandon@example-site.test', 'mailto'],
    ['MAILTO:brandon@example-site.test', 'mailto'],
    ['tel:+15550100', 'tel'],
  ] as const)('classifies %s as %s', (href, kind) => {
    expect(classifyCorvusLink(href)).toBe(kind)
  })

  it('names streamdown’s mid-stream sentinel rather than guessing at it', () => {
    // A link whose closing paren has not streamed yet is not a destination.
    // Classified as a scheme it would become "external" and the visitor would
    // be offered a confirmation to open `streamdown:incomplete-link`.
    expect(classifyCorvusLink(STREAMDOWN_INCOMPLETE_LINK)).toBe('incomplete')
  })

  it('threads currentHost through to the internal predicate', () => {
    expect(
      classifyCorvusLink('https://preview-abc.vercel.app/tech', {
        currentHost: 'preview-abc.vercel.app',
      }),
    ).toBe('internal')
    expect(classifyCorvusLink('https://preview-abc.vercel.app/tech')).toBe(
      'external',
    )
  })

  it.each<[string | null, string]>([
    ['javascript:alert(1)', 'a script URL'],
    ['data:text/html,<b>x</b>', 'a data URL'],
    ['', 'an empty href'],
    ['tech', 'a bare word'],
    [null, 'a missing href'],
  ])('falls through to external for %s (%s)', (href) => {
    // Same direction as `isInternalCorvusLink`: anything unrecognised keeps
    // its confirmation rather than being waved through.
    expect(classifyCorvusLink(href)).toBe('external')
  })
})
