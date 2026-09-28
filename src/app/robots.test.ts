import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/site', () => ({
  getSiteUrl: () => 'https://example.com',
}))

import robots from './robots'

/** One `Allow`/`Disallow` line, in the order Next emits them. */
type Rule = { kind: 'allow' | 'disallow'; pattern: string }

const toArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

function emittedRules(): Rule[] {
  const { rules } = robots()
  const [only] = Array.isArray(rules) ? rules : [rules]
  return [
    ...toArray(only.allow).map((pattern) => ({
      kind: 'allow' as const,
      pattern,
    })),
    ...toArray(only.disallow).map((pattern) => ({
      kind: 'disallow' as const,
      pattern,
    })),
  ]
}

/**
 * RFC 9309 matching, as Google documents it: the longest matching pattern
 * wins, `Allow` wins a tie, `$` anchors the end, and no match means allowed.
 * Only what the emitted rules use — no `*` wildcards.
 */
function isAllowed(path: string, rules: Rule[]): boolean {
  const matching = rules.filter(({ pattern }) =>
    pattern.endsWith('$')
      ? path === pattern.slice(0, -1)
      : path.startsWith(pattern),
  )
  if (matching.length === 0) return true
  const longest = Math.max(...matching.map(({ pattern }) => pattern.length))
  return matching.some(
    ({ kind, pattern }) => pattern.length === longest && kind === 'allow',
  )
}

describe('robots (#221)', () => {
  it('emits the recorded policy: one rule set, admin and api disallowed, media carved back out', () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: '*',
        allow: ['/', '/api/og/', '/api/media/file/'],
        disallow: ['/admin$', '/admin/', '/api/'],
      },
      host: 'https://example.com',
      sitemap: 'https://example.com/sitemap.xml',
    })
  })

  it('never disallows /_next/ — Google renders pages with their JS and CSS', () => {
    const rules = emittedRules()
    expect(
      rules.filter(
        ({ kind, pattern }) =>
          kind === 'disallow' &&
          '/_next/'.startsWith(pattern.replace(/\$$/, '')),
      ),
    ).toEqual([])
    expect(isAllowed('/_next/static/chunks/f41fa1d2ef55d59e.js', rules)).toBe(
      true,
    )
    expect(isAllowed('/_next/image', rules)).toBe(true)
  })

  it.each([
    ['/admin', false],
    ['/admin/login', false],
    ['/admin/collections/posts', false],
    ['/api/mcp', false],
    ['/api/ai/chat', false],
    ['/api/search', false],
    ['/api/posts', false],
    // The generated social cards and media bytes stay fetchable: og:image and
    // article JSON-LD point at /api/og/, and images are indexable content.
    ['/api/og/article/some-slug', true],
    ['/api/og/page/work/brytecore', true],
    ['/api/media/file/cover.png', true],
    // Prefixes never swallow a page the catch-all could serve.
    ['/administration', true],
    ['/api-design', true],
    ['/', true],
    ['/articles/some-slug', true],
    ['/work/brytecore', true],
    ['/sitemap.xml', true],
  ])('%s is allowed: %s', (path, expected) => {
    expect(isAllowed(path, emittedRules())).toBe(expected)
  })
})
