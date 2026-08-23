// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SHARE_TARGET_IDS } from '@/globals/SiteSettings'
import {
  SHARE_TARGETS,
  type ShareTargetId,
  resolveShareTargets,
} from '@/lib/share/shareTargets'

/**
 * A payload with characters that must survive `encodeURIComponent` — a space,
 * an ampersand, a slash, and a `?` — so a builder that forgets to encode any
 * interpolated value fails loudly rather than emitting a malformed URL.
 */
const payload = {
  url: 'https://brandonperfetti.com/articles/a b?c&d',
  title: 'Hello & Goodbye / Part 1?',
}
const encodedUrl = encodeURIComponent(payload.url)
const encodedTitle = encodeURIComponent(payload.title)

describe('share target registry', () => {
  it('has an entry for every pinned id', () => {
    for (const id of SHARE_TARGET_IDS) {
      expect(SHARE_TARGETS[id]).toBeDefined()
      expect(SHARE_TARGETS[id].id).toBe(id)
      expect(SHARE_TARGETS[id].label).toBeTruthy()
      expect(SHARE_TARGETS[id].icon).toBeTypeOf('function')
    }
  })

  it('exposes no ids beyond the pinned vocabulary', () => {
    expect(Object.keys(SHARE_TARGETS).sort()).toEqual(
      [...SHARE_TARGET_IDS].sort(),
    )
  })
})

describe('intent-URL builders', () => {
  it.each<[ShareTargetId, string]>([
    ['x', `https://x.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`],
    [
      'linkedin',
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    ],
    ['facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`],
    [
      'reddit',
      `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    ],
    [
      'hackernews',
      `https://news.ycombinator.com/submitlink?u=${encodedUrl}&t=${encodedTitle}`,
    ],
    ['email', `mailto:?subject=${encodedTitle}&body=${encodedUrl}`],
  ])('builds the pinned %s URL with every value encoded', (id, expected) => {
    expect(SHARE_TARGETS[id].buildIntentUrl(payload)).toBe(expected)
  })

  it('returns null for copylink (clipboard, not navigation)', () => {
    expect(SHARE_TARGETS.copylink.buildIntentUrl(payload)).toBeNull()
  })

  it('does not leak a raw space, ampersand, or slash into any URL', () => {
    for (const id of SHARE_TARGET_IDS) {
      const url = SHARE_TARGETS[id].buildIntentUrl(payload)
      if (url === null) continue
      // Only the mailto: scheme separator and query punctuation remain literal.
      expect(url).not.toMatch(/ /)
      expect(url).not.toContain('a b')
      expect(url).not.toContain('Goodbye /')
    }
  })
})

describe('resolveShareTargets', () => {
  it('returns the global set in canonical order', () => {
    const result = resolveShareTargets(['reddit', 'x', 'copylink'])
    expect(result.map((t) => t.id)).toEqual(['x', 'reddit', 'copylink'])
  })

  it('unions global and add', () => {
    const result = resolveShareTargets(['x'], ['facebook', 'email'])
    expect(result.map((t) => t.id)).toEqual(['x', 'facebook', 'email'])
  })

  it('subtracts remove from the union', () => {
    const result = resolveShareTargets(['x', 'linkedin'], ['reddit'], ['x'])
    expect(result.map((t) => t.id)).toEqual(['linkedin', 'reddit'])
  })

  it('dedupes ids appearing in both global and add', () => {
    const result = resolveShareTargets(['x', 'linkedin'], ['x'])
    expect(result.map((t) => t.id)).toEqual(['x', 'linkedin'])
  })

  it('imposes canonical order regardless of input order', () => {
    const result = resolveShareTargets([
      'copylink',
      'email',
      'hackernews',
      'reddit',
      'facebook',
      'linkedin',
      'x',
    ])
    expect(result.map((t) => t.id)).toEqual([...SHARE_TARGET_IDS])
  })

  it('ignores unknown ids', () => {
    const result = resolveShareTargets(['x', 'mastodon'], ['bluesky'])
    expect(result.map((t) => t.id)).toEqual(['x'])
  })

  it('treats a removed id as gone even when it is also added', () => {
    const result = resolveShareTargets(['x'], ['reddit'], ['reddit'])
    expect(result.map((t) => t.id)).toEqual(['x'])
  })

  it('returns an empty array with no inputs', () => {
    expect(resolveShareTargets()).toEqual([])
  })

  it('yields full resolved targets carrying label and builder', () => {
    const [target] = resolveShareTargets(['x'])
    expect(target.label).toBe('X')
    expect(target.buildIntentUrl(payload)).toContain('x.com/intent/tweet')
  })
})
