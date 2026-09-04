import { describe, expect, it } from 'vitest'

import { resolveCmsHref } from './CMSLink'

/**
 * `resolveCmsHref` is the href behind every CMS-authored internal link — heros,
 * CTA blocks, content columns. Under hierarchy it is the load-bearing consumer
 * of the path seam: a link to a placed page that still built `/`+slug would
 * 404, and one to the root page would point at `/home` (#148).
 */
describe('resolveCmsHref', () => {
  it('links a top-level page at /<slug>', () => {
    expect(
      resolveCmsHref({
        type: 'reference',
        reference: { relationTo: 'pages', value: { slug: 'now' } as never },
      }),
    ).toBe('/now')
  })

  it('links a PLACED page at its full nested path', () => {
    expect(
      resolveCmsHref({
        type: 'reference',
        reference: {
          relationTo: 'pages',
          value: { slug: 'brytecore', path: 'work/brytecore' } as never,
        },
      }),
    ).toBe('/work/brytecore')
  })

  it('links the root page at / rather than /home', () => {
    expect(
      resolveCmsHref({
        type: 'reference',
        reference: { relationTo: 'pages', value: { slug: 'home' } as never },
      }),
    ).toBe('/')
  })

  it('links a post under /articles — the preserved v3 shape', () => {
    expect(
      resolveCmsHref({
        type: 'reference',
        reference: {
          relationTo: 'posts',
          value: { slug: 'hello-world' } as never,
        },
      }),
    ).toBe('/articles/hello-world')
  })

  it('passes a custom URL through unchanged', () => {
    expect(
      resolveCmsHref({ type: 'custom', url: 'https://example.com/x' }),
    ).toBe('https://example.com/x')
  })

  it('falls back to # for an unpopulated reference, a slugless doc, and nothing', () => {
    // A depth-0 read leaves `value` a bare id with no slug to resolve.
    expect(
      resolveCmsHref({
        type: 'reference',
        reference: { relationTo: 'pages', value: 42 },
      }),
    ).toBe('#')
    expect(
      resolveCmsHref({
        type: 'reference',
        reference: { relationTo: 'pages', value: {} as never },
      }),
    ).toBe('#')
    expect(resolveCmsHref(null)).toBe('#')
    expect(resolveCmsHref(undefined)).toBe('#')
    expect(resolveCmsHref({ type: 'custom' })).toBe('#')
  })
})
