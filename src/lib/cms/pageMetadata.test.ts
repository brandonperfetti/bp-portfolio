import { describe, expect, it } from 'vitest'

import { resolveArticleSocialImage } from './pageMetadata'

import type { OgImageMode } from '@/lib/og/types'
import { DEFAULT_SOCIAL_IMAGE } from '@/lib/site'

const SITE = 'https://brandonperfetti.com'
const BLOB = 'https://store.public.blob.vercel-storage.com/og-default.png'
const GEN = `${SITE}/api/og/article/my-slug`

/** Build resolver args, defaulting to the common "auto, generation off" case. */
function args(
  overrides: Partial<Parameters<typeof resolveArticleSocialImage>[0]> = {},
) {
  return {
    articleImage: undefined,
    mode: 'auto' as OgImageMode | undefined,
    generatedOgEnabled: false,
    generatedImageUrl: GEN,
    openGraphImage: BLOB as string | undefined,
    siteUrl: SITE,
    ...overrides,
  }
}

describe('resolveArticleSocialImage', () => {
  it("uses the article's own cover when present (absolute passthrough)", () => {
    expect(
      resolveArticleSocialImage(
        args({ articleImage: 'https://cdn.example.com/cover.jpg' }),
      ),
    ).toBe('https://cdn.example.com/cover.jpg')
  })

  it('makes a relative cover absolute against the site URL', () => {
    expect(
      resolveArticleSocialImage(args({ articleImage: '/media/cover.jpg' })),
    ).toBe('https://brandonperfetti.com/media/cover.jpg')
  })

  it('falls back to the site-default OG image for a cover-less article', () => {
    expect(resolveArticleSocialImage(args())).toBe(BLOB)
  })

  it('falls back to the hardcoded default when there is no cover and no site default', () => {
    expect(resolveArticleSocialImage(args({ openGraphImage: undefined }))).toBe(
      DEFAULT_SOCIAL_IMAGE,
    )
  })

  it('generates a card for a cover-less article when the global toggle is on (auto)', () => {
    expect(resolveArticleSocialImage(args({ generatedOgEnabled: true }))).toBe(
      GEN,
    )
  })

  it('keeps a real cover over a generated card in auto mode, even with the toggle on', () => {
    expect(
      resolveArticleSocialImage(
        args({
          articleImage: 'https://cdn.example.com/cover.jpg',
          generatedOgEnabled: true,
        }),
      ),
    ).toBe('https://cdn.example.com/cover.jpg')
  })

  it('never generates in bespoke mode — falls back to the site default', () => {
    expect(
      resolveArticleSocialImage(
        args({ mode: 'bespoke', generatedOgEnabled: true }),
      ),
    ).toBe(BLOB)
  })

  it('always generates in generated mode, even when the article has a cover', () => {
    expect(
      resolveArticleSocialImage(
        args({
          mode: 'generated',
          generatedOgEnabled: false,
          articleImage: 'https://cdn.example.com/cover.jpg',
        }),
      ),
    ).toBe(GEN)
  })
})
