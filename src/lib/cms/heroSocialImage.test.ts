import { describe, expect, it } from 'vitest'

import { heroSocialImageUrl } from './heroSocialImage'

const media = { url: 'https://store.public.blob.vercel-storage.com/hero.png' }

describe('heroSocialImageUrl', () => {
  it('uses the media URL for a standard hero (the one type that renders an image)', () => {
    expect(heroSocialImageUrl({ type: 'standard', media })).toBe(media.url)
  })

  it('ignores hero media for shader/blank/none so OG falls through to the site default', () => {
    for (const type of ['shader', 'blank', 'none']) {
      expect(heroSocialImageUrl({ type, media })).toBeUndefined()
    }
  })

  it('returns undefined for a standard hero with no media', () => {
    expect(
      heroSocialImageUrl({ type: 'standard', media: null }),
    ).toBeUndefined()
  })

  it('tolerates a missing hero', () => {
    expect(heroSocialImageUrl(null)).toBeUndefined()
    expect(heroSocialImageUrl(undefined)).toBeUndefined()
  })
})
