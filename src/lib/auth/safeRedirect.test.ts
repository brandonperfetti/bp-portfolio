import { describe, expect, it } from 'vitest'

import { safeRedirectPath, withRedirect } from './safeRedirect'

const ORIGIN = 'https://brandonperfetti.com'

/**
 * #377: the custom sign-up form honours `redirect_url` itself (Clerk's
 * prebuilt form used to), so where a new member lands is now this site's to
 * get right. Anything that is not a path on this site must be refused, or the
 * sign-up page becomes an open redirect.
 */
describe('safeRedirectPath', () => {
  it.each([
    ['/articles/some-post', '/articles/some-post'],
    ['/corvus?q=hello#answer', '/corvus?q=hello#answer'],
    ['/', '/'],
  ])('keeps the site path %s', (value, expected) => {
    expect(safeRedirectPath(value, ORIGIN)).toBe(expected)
  })

  it('reduces a same-origin absolute URL to its path', () => {
    expect(
      safeRedirectPath(`${ORIGIN}/articles/some-post?x=1#top`, ORIGIN),
    ).toBe('/articles/some-post?x=1#top')
  })

  it('keeps a site path when the origin is not known yet (server render)', () => {
    expect(safeRedirectPath('/articles/some-post')).toBe('/articles/some-post')
  })

  it('refuses a same-origin absolute URL when the origin is not known', () => {
    expect(safeRedirectPath(`${ORIGIN}/articles/some-post`)).toBeNull()
  })

  it.each([
    ['another origin', 'https://evil.example/articles'],
    ['a protocol-relative URL', '//evil.example/articles'],
    ['a backslash host', '/\\evil.example'],
    ['two backslashes', '\\\\evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    [
      'a same-origin URL whose path is protocol-relative',
      `${ORIGIN}//evil.example`,
    ],
    ['a path with a tab in it', '/\tevil.example'],
    ['a path with a newline in it', '/articles\n/x'],
    ['a relative path with no leading slash', 'articles/some-post'],
    ['an empty string', ''],
    ['whitespace', '   '],
  ])('refuses %s', (_name, value) => {
    expect(safeRedirectPath(value, ORIGIN)).toBeNull()
  })

  it.each([[null], [undefined]])('refuses %s', (value) => {
    expect(safeRedirectPath(value, ORIGIN)).toBeNull()
  })

  it('refuses another origin that merely starts with this one', () => {
    expect(
      safeRedirectPath('https://brandonperfetti.com.evil.example/x', ORIGIN),
    ).toBeNull()
  })
})

describe('withRedirect', () => {
  it('adds the target, encoded', () => {
    expect(withRedirect('/sign-in', '/articles/x?y=1')).toBe(
      '/sign-in?redirect_url=%2Farticles%2Fx%3Fy%3D1',
    )
  })

  it('leaves the path alone when there is no target', () => {
    expect(withRedirect('/sign-in', null)).toBe('/sign-in')
  })
})
