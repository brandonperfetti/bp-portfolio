import { describe, expect, it } from 'vitest'

import { canonicalizeArticleUrl } from './canonical'

describe('canonicalizeArticleUrl', () => {
  it('returns fallback article URL when candidate is missing', () => {
    expect(canonicalizeArticleUrl('https://example.com', 'my-post')).toBe(
      'https://example.com/articles/my-post',
    )
  })

  it('keeps same-host absolute canonical and strips hash fragments', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        'my-post',
        'https://example.com/articles/my-post#section',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('converts relative canonical paths to same-site absolute URLs', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        'my-post',
        '/articles/my-post',
      ),
    ).toBe('https://example.com/articles/my-post')
  })

  it('falls back when canonical host is different', () => {
    expect(
      canonicalizeArticleUrl(
        'https://example.com',
        'my-post',
        'https://other-domain.com/articles/my-post',
      ),
    ).toBe('https://example.com/articles/my-post')
  })
})
