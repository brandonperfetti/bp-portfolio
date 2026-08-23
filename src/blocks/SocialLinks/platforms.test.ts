// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  SOCIAL_PLATFORM_ICONS,
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
  ] as const)('reads %s as %s', (href, platform) => {
    expect(resolveSocialPlatform(href)).toBe(platform)
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
