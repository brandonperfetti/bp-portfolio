import { describe, expect, it } from 'vitest'

import {
  ROOT_PAGE_SLUG,
  isSlugRoutedCollection,
  publicPathFor,
  publicPathForSlug,
} from './slugPaths'

/**
 * The path seam's contract (#148). These cases are the ones every other
 * consumer in the codebase now delegates to, so a change here is a change to
 * every public URL the site emits.
 */
describe('publicPathFor', () => {
  describe('pages — the root contract', () => {
    it('serves the designated root page at /', () => {
      expect(publicPathFor('pages', { slug: ROOT_PAGE_SLUG })).toBe('/')
    })

    it('serves the root at / when it arrives with a computed path too', () => {
      expect(
        publicPathFor('pages', { slug: ROOT_PAGE_SLUG, path: ROOT_PAGE_SLUG }),
      ).toBe('/')
    })

    it('is the single owner of the mapping: publicPathForSlug agrees (#132)', () => {
      // Before #148 this wrapper said `/home` while `revalidatePage` said `/`.
      // The two vocabularies now agree, which is what lets a purge uncover the
      // redirect row it was meant to uncover.
      expect(publicPathForSlug('pages', ROOT_PAGE_SLUG)).toBe('/')
    })

    it('does not treat a nested page whose last segment is the root slug as the root', () => {
      expect(publicPathFor('pages', { slug: 'home', path: 'work/home' })).toBe(
        '/work/home',
      )
    })
  })

  describe('pages — flat and placed', () => {
    it('serves an unplaced page at /<slug>', () => {
      expect(publicPathFor('pages', { slug: 'about', path: 'about' })).toBe(
        '/about',
      )
    })

    it('serves a child page at /<parent>/<child>', () => {
      expect(
        publicPathFor('pages', { slug: 'brytecore', path: 'work/brytecore' }),
      ).toBe('/work/brytecore')
    })

    it('serves a depth-3 page at its full path', () => {
      expect(publicPathFor('pages', { slug: 'c', path: 'a/b/c' })).toBe(
        '/a/b/c',
      )
    })

    it('prefers the stored path over the slug when they disagree', () => {
      expect(publicPathFor('pages', { slug: 'ai', path: 'tech/ai' })).toBe(
        '/tech/ai',
      )
    })

    it('degrades to the slug for a pre-migration row with no path', () => {
      // M1 backfills `path = slug`, but the function must be correct before it
      // runs and for slug-only projections.
      expect(publicPathFor('pages', { slug: 'colophon' })).toBe('/colophon')
    })
  })

  describe('posts — the preserved v3 shape', () => {
    it('serves a post at /articles/<slug>', () => {
      expect(publicPathFor('posts', { slug: 'hello-world' })).toBe(
        '/articles/hello-world',
      )
    })

    it('serves a PLACED post at its own path (#153)', () => {
      // Premise change, deliberate: #148 pinned "a path on a post is ignored"
      // because placement did not exist yet. #153 is what makes it exist, and a
      // placed post's `path` is now the whole point — it is set only by an
      // editor picking a parent page.
      expect(
        publicPathFor('posts', { slug: 'hello-world', path: 'work/hello' }),
      ).toBe('/work/hello')
    })

    it('does NOT fall back from path to slug for a post, unlike a page', () => {
      // The asymmetry that keeps the v3 URL surface still. A page with no
      // stored path degrades to `/<slug>`; a post with no stored path is
      // unplaced and must stay at `/articles/<slug>`. Reading the fallback the
      // other way would move every article on the site in one line.
      expect(publicPathFor('posts', { slug: 'hello-world' })).toBe(
        '/articles/hello-world',
      )
      expect(publicPathFor('posts', { slug: 'hello-world', path: null })).toBe(
        '/articles/hello-world',
      )
      expect(publicPathFor('posts', { slug: 'hello-world', path: '' })).toBe(
        '/articles/hello-world',
      )
      expect(publicPathFor('pages', { slug: 'hello-world' })).toBe(
        '/hello-world',
      )
    })

    it('resolves a placed post with no slug from its path alone', () => {
      expect(publicPathFor('posts', { path: 'work/hello' })).toBe('/work/hello')
    })

    it('does not treat a post slugged "home" as the site root', () => {
      expect(publicPathFor('posts', { slug: ROOT_PAGE_SLUG })).toBe(
        '/articles/home',
      )
    })
  })

  describe('null cases', () => {
    it('returns null for a collection that is not slug-routed', () => {
      expect(publicPathFor('categories', { slug: 'ai' })).toBeNull()
      expect(publicPathFor('media', { slug: 'x' })).toBeNull()
    })

    it('returns null when both slug and path are missing or empty', () => {
      expect(publicPathFor('pages', {})).toBeNull()
      expect(publicPathFor('pages', { slug: '' })).toBeNull()
      expect(publicPathFor('pages', { slug: '', path: '' })).toBeNull()
      expect(publicPathFor('posts', { slug: undefined })).toBeNull()
      expect(publicPathFor('pages', null)).toBeNull()
      expect(publicPathFor('pages', undefined)).toBeNull()
    })

    it('returns null for non-string slug/path values', () => {
      expect(publicPathFor('pages', { slug: 42 })).toBeNull()
      expect(publicPathFor('posts', { slug: { id: 1 } })).toBeNull()
      expect(publicPathFor('pages', { slug: 'x', path: 7 })).toBe('/x')
    })
  })
})

describe('isSlugRoutedCollection', () => {
  it('admits exactly posts and pages', () => {
    expect(isSlugRoutedCollection('posts')).toBe(true)
    expect(isSlugRoutedCollection('pages')).toBe(true)
    expect(isSlugRoutedCollection('categories')).toBe(false)
    expect(isSlugRoutedCollection('toString')).toBe(false)
  })
})
