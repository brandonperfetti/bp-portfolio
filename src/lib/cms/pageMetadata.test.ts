import { describe, expect, it } from 'vitest'

import { resolveArticleSocialImage } from './pageMetadata'

import { DEFAULT_SOCIAL_IMAGE } from '@/lib/site'

const SITE = 'https://brandonperfetti.com'
const BLOB = 'https://store.public.blob.vercel-storage.com/og-default.png'

describe('resolveArticleSocialImage', () => {
  it("uses the article's own cover when present (absolute passthrough)", () => {
    expect(
      resolveArticleSocialImage(
        'https://cdn.example.com/cover.jpg',
        { openGraphImage: BLOB },
        SITE,
      ),
    ).toBe('https://cdn.example.com/cover.jpg')
  })

  it('makes a relative cover absolute against the site URL', () => {
    expect(
      resolveArticleSocialImage(
        '/media/cover.jpg',
        { openGraphImage: BLOB },
        SITE,
      ),
    ).toBe('https://brandonperfetti.com/media/cover.jpg')
  })

  it('falls back to the site-default OG image for a cover-less article', () => {
    expect(
      resolveArticleSocialImage(undefined, { openGraphImage: BLOB }, SITE),
    ).toBe(BLOB)
  })

  it('falls back to the hardcoded default when there is no cover and no site default', () => {
    expect(
      resolveArticleSocialImage(undefined, { openGraphImage: undefined }, SITE),
    ).toBe(DEFAULT_SOCIAL_IMAGE)
  })
})
