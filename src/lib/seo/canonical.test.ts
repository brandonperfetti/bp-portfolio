import { describe, expect, it } from 'vitest'

import { canonicalizeArticleUrl } from './canonical'

describe('canonicalizeArticleUrl', () => {
  it('returns fallback article URL when candidate is missing', () => {
    expect(
      canonicalizeArticleUrl('https://example.com', { slug: 'my-post' }),
    ).toBe('https://example.com/articles/my-post')
  })

  it('keeps same-host absolute canonical and strips hash fragments', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'my-post' },
        'https://example.com/articles/my-post#section',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('converts relative canonical paths to same-site absolute URLs', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'my-post' },
        '/articles/my-post',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('strips hash fragments from relative canonical paths', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'my-post' },
        '/articles/my-post#section',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('falls back when canonical host is different', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'my-post' },
        'https://other-domain.com/articles/my-post',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('falls back when canonical protocol does not match the site protocol', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'my-post' },
        'http://example.com/articles/my-post',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('falls back when candidate canonical is malformed', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'my-post' },
        'not-a-valid-url',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('normalizes trailing slash in siteUrl to avoid double slashes', () => {
    expect(
      canonicalizeArticleUrl('https://example.com/', { slug: 'my-post' }),
    ).toBe('https://example.com/articles/my-post')
    expect(
      canonicalizeArticleUrl(
        'https://example.com/',
        { slug: 'my-post' },
        '/articles/my-post',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('returns fallback string when siteUrl is malformed', () => {
    expect(
      canonicalizeArticleUrl(
        'not-a-valid-url',
        { slug: 'my-post' },
        'https://example.com/articles/my-post',
      ),
    ).toBe('not-a-valid-url/articles/my-post')
  })
})

describe('canonicalizeArticleUrl · placed articles (#153)', () => {
  it('canonicalises a placed article to its placed path, not /articles', () => {
    expect(
      canonicalizeArticleUrl('https://example.com', {
        slug: 'brytecore',
        path: 'work/brytecore',
      }),
    ).toBe('https://example.com/work/brytecore')
  })

  it('still canonicalises an unplaced article to /articles/<slug>', () => {
    expect(
      canonicalizeArticleUrl('https://example.com', {
        slug: 'brytecore',
        path: undefined,
      }),
    ).toBe('https://example.com/articles/brytecore')
  })

  it('lets a same-origin editor override beat the placed path', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        { slug: 'brytecore', path: 'work/brytecore' },
        'https://example.com/elsewhere',
      ),
    ).toBe('https://example.com/elsewhere')
  })
})
