// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  SOCIAL_PLATFORM_ICONS,
  type SocialPlatform,
  defaultSocialLabel,
  resolveSocialLink,
  resolveSocialPlatform,
} from '@/blocks/SocialLinks/platforms'
import { SITE_OWNER_SOCIAL_LINKS } from '@/lib/identity'

/**
 * The icon and the wording are derived from the URL, because the Identity
 * global stores bare URLs and has no field to read either from — so this
 * derivation is the whole reason `source: identity` can work at all.
 */
describe('social platform resolution', () => {
  it.each([
    ['https://x.com/brandonperfetti', 'x'],
    ['https://www.x.com/brandonperfetti', 'x'],
    ['https://twitter.com/brandonperfetti', 'x'],
    ['https://github.com/brandonperfetti', 'github'],
    ['https://www.linkedin.com/in/brandonperfetti/', 'linkedin'],
    ['https://instagram.com/brandonperfetti', 'instagram'],
    ['mailto:info@brandonperfetti.com', 'email'],
    ['https://brandonperfetti.com', 'link'],
    // #46 — the four platforms added in wave 4.
    ['https://facebook.com/brandonperfetti', 'facebook'],
    ['https://www.facebook.com/brandonperfetti', 'facebook'],
    ['https://m.facebook.com/brandonperfetti', 'facebook'],
    ['https://fb.com/brandonperfetti', 'facebook'],
    ['https://youtube.com/@brandonperfetti', 'youtube'],
    ['https://www.youtube.com/@brandonperfetti', 'youtube'],
    ['https://music.youtube.com/channel/abc', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://bsky.app/profile/brandonperfetti.com', 'bluesky'],
    ['https://www.bsky.app/profile/brandonperfetti.com', 'bluesky'],
    ['https://threads.net/@brandonperfetti', 'threads'],
    ['https://www.threads.net/@brandonperfetti', 'threads'],
    ['https://threads.com/@brandonperfetti', 'threads'],
  ] as const)('reads %s as %s', (href, platform) => {
    expect(resolveSocialPlatform(href)).toBe(platform)
  })

  /**
   * The one failure mode that would actually mislead a reader: lending a
   * brand's mark to a host that merely contains its name. Each of these
   * embeds a platform domain as a substring without being that domain.
   */
  it.each([
    'https://notfacebook.com/brandonperfetti',
    'https://facebook.com.evil.test/brandonperfetti',
    'https://myfb.com/brandonperfetti',
    'https://notyoutube.com/@brandonperfetti',
    'https://youtube.com.phish.test/@brandonperfetti',
    'https://fakeyoutu.be/abc',
    'https://notbsky.app/profile/x',
    'https://bsky.app.evil.test/profile/x',
    'https://notthreads.net/@brandonperfetti',
    'https://threads.net.evil.test/@brandonperfetti',
    'https://threadsxcom.example/@brandonperfetti',
  ])('keeps the lookalike %s on the generic link glyph', (href) => {
    expect(resolveSocialPlatform(href)).toBe('link')
  })

  it('falls back to the generic link glyph for junk rather than throwing', () => {
    expect(resolveSocialPlatform('not a url')).toBe('link')
    expect(resolveSocialPlatform('')).toBe('link')
  })

  it('has an icon for every platform it can resolve', () => {
    for (const platform of Object.keys(SOCIAL_PLATFORM_ICONS)) {
      expect(SOCIAL_PLATFORM_ICONS[platform as 'x']).toBeTypeOf('function')
    }
  })

  /**
   * Typed as a total `Record`, so adding a member to `SocialPlatform`
   * without listing it here is a typecheck failure rather than a glyph that
   * silently comes up `undefined` at runtime — the resolver and the icon map
   * are only useful if they stay the same size.
   */
  it('draws an icon and a label for every member of the union', () => {
    const ALL_PLATFORMS: Record<SocialPlatform, true> = {
      x: true,
      github: true,
      linkedin: true,
      instagram: true,
      facebook: true,
      youtube: true,
      bluesky: true,
      threads: true,
      email: true,
      link: true,
    }

    for (const platform of Object.keys(ALL_PLATFORMS) as SocialPlatform[]) {
      expect(SOCIAL_PLATFORM_ICONS[platform]).toBeTypeOf('function')
      expect(defaultSocialLabel('https://example.com/a', platform)).toBeTruthy()
    }
  })
})

describe('default labels', () => {
  it('reproduces the wording both pages already ship', () => {
    // Home's aria-labels and About's row text are the same three strings.
    expect(defaultSocialLabel('https://x.com/b', 'x')).toBe('Follow on X')
    expect(defaultSocialLabel('https://github.com/b', 'github')).toBe(
      'Follow on GitHub',
    )
    expect(defaultSocialLabel('https://linkedin.com/in/b', 'linkedin')).toBe(
      'Follow on LinkedIn',
    )
  })

  it('extends the same wording to the #46 platforms, brand casing intact', () => {
    expect(defaultSocialLabel('https://facebook.com/b', 'facebook')).toBe(
      'Follow on Facebook',
    )
    // "YouTube", not "Youtube" — the capital T is part of the name.
    expect(defaultSocialLabel('https://youtube.com/@b', 'youtube')).toBe(
      'Follow on YouTube',
    )
    expect(defaultSocialLabel('https://bsky.app/profile/b', 'bluesky')).toBe(
      'Follow on Bluesky',
    )
    expect(defaultSocialLabel('https://threads.net/@b', 'threads')).toBe(
      'Follow on Threads',
    )
  })

  it('shows an email address bare, the way About renders its mail row', () => {
    expect(defaultSocialLabel('mailto:info@brandonperfetti.com', 'email')).toBe(
      'info@brandonperfetti.com',
    )
  })

  it('names the host for an unknown link', () => {
    expect(defaultSocialLabel('https://www.example.com/x', 'link')).toBe(
      'example.com',
    )
  })

  /**
   * Both admin sources can hold a value that is not a URL at all, and the
   * label is the only thing a `labeledList` row has to show. Echoing the raw
   * value back is what makes a typo legible to the editor who typed it —
   * better than an empty row or a thrown `TypeError` from `new URL`.
   */
  it('echoes a value that does not parse as a URL rather than throwing', () => {
    expect(defaultSocialLabel('not a url', 'link')).toBe('not a url')
    expect(defaultSocialLabel('', 'link')).toBe('')
  })
})

describe('resolveSocialLink', () => {
  it('turns the Identity fallback URLs into the home icon row, in order', () => {
    expect(
      SITE_OWNER_SOCIAL_LINKS.map((url) => resolveSocialLink(url)),
    ).toEqual([
      {
        href: 'https://x.com/brandonperfetti',
        label: 'Follow on X',
        platform: 'x',
      },
      {
        href: 'https://github.com/brandonperfetti',
        label: 'Follow on GitHub',
        platform: 'github',
      },
      {
        href: 'https://www.linkedin.com/in/brandonperfetti/',
        label: 'Follow on LinkedIn',
        platform: 'linkedin',
      },
    ])
  })

  it('prefers an editor label over the derived one', () => {
    expect(resolveSocialLink('https://github.com/b', 'Code')?.label).toBe(
      'Code',
    )
    // Blank is not an override — it is an empty admin field.
    expect(resolveSocialLink('https://github.com/b', '   ')?.label).toBe(
      'Follow on GitHub',
    )
  })

  it('adds the mailto scheme to a bare address', () => {
    expect(resolveSocialLink('info@brandonperfetti.com')).toEqual({
      href: 'mailto:info@brandonperfetti.com',
      label: 'info@brandonperfetti.com',
      platform: 'email',
    })
  })

  it('drops blank rows — both sources can hold them', () => {
    expect(resolveSocialLink('')).toBeNull()
    expect(resolveSocialLink('   ')).toBeNull()
    expect(resolveSocialLink(null)).toBeNull()
    expect(resolveSocialLink(undefined)).toBeNull()
  })
})
