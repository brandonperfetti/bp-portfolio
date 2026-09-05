import { describe, expect, it } from 'vitest'

import {
  buildPageMetadata,
  resolveArticleSocialImage,
  resolvePageSocialImage,
} from './pageMetadata'

import type { CmsPageContent } from '@/lib/cms/types'
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

/**
 * The generated-OG card URL under hierarchy (#148). `/api/og/page` is a
 * `[...segments]` catch-all keyed by the page's PATH: under per-parent slug
 * uniqueness a bare slug is ambiguous, so a slug-keyed card would be served
 * some other page's title.
 */
describe('resolvePageSocialImage — generated-card URL is path-keyed (#148)', () => {
  const generated = {
    pageId: '1',
    routeKey: '/x',
    title: 'X',
    ogImageMode: 'generated' as const,
  }
  const settings = {
    canonicalUrl: 'https://example.com',
    generatedOgEnabled: true,
  } as unknown as Parameters<typeof resolvePageSocialImage>[1]

  it('keys a top-level page by its path', () => {
    expect(
      resolvePageSocialImage(
        { ...generated, slug: 'colophon', path: 'colophon' },
        settings,
      ),
    ).toBe('https://example.com/api/og/page/colophon')
  })

  it('keys a PLACED page by its full nested path', () => {
    expect(
      resolvePageSocialImage(
        { ...generated, slug: 'brytecore', path: 'work/brytecore' },
        settings,
      ),
    ).toBe('https://example.com/api/og/page/work/brytecore')
  })

  it('keys the root page by the root slug, since / carries no segment', () => {
    expect(
      resolvePageSocialImage(
        { ...generated, slug: 'home', path: 'home' },
        settings,
      ),
    ).toBe('https://example.com/api/og/page/home')
  })

  it('falls back to the slug for a projection with no path', () => {
    expect(
      resolvePageSocialImage({ ...generated, slug: 'colophon' }, settings),
    ).toBe('https://example.com/api/og/page/colophon')
  })
})

/**
 * Title handling under the root layout's `%s - <siteName>` template (#176).
 *
 * The layout appends the site name to any plain-string `title`. Editors write
 * SEO titles that already carry the brand, so `/tech` shipped
 * "Tech Stack — Brandon Perfetti | … - Brandon Perfetti". An authored
 * `seoTitle` is now final (`title.absolute`, matching the articles route); the
 * fallback title is a bare route name and still takes the suffix.
 */
describe('buildPageMetadata — title vs the layout template (#176)', () => {
  const settings = {
    canonicalUrl: 'https://example.com',
    siteName: 'Brandon Perfetti',
    generatedOgEnabled: false,
  } as unknown as Parameters<typeof buildPageMetadata>[0]['settings']

  const page = {
    pageId: '1',
    routeKey: '/tech',
    slug: 'tech',
    path: 'tech',
    title: 'Tech',
  } as unknown as CmsPageContent

  /** Build args for one page, defaulting to the `/tech` shape. */
  function metaArgs(overrides: Partial<CmsPageContent> | null = {}) {
    return {
      page:
        overrides === null
          ? null
          : ({ ...page, ...overrides } as CmsPageContent),
      settings,
      fallbackTitle: 'Tech',
      fallbackDescription: 'Fallback description.',
      path: '/tech',
    }
  }

  it('marks an authored seoTitle absolute, so the site name is not appended', () => {
    const meta = buildPageMetadata(
      metaArgs({ seoTitle: 'Tech Stack — Brandon Perfetti | Engineer' }),
    )

    expect(meta.title).toEqual({
      absolute: 'Tech Stack — Brandon Perfetti | Engineer',
    })
  })

  it('leaves the fallback title a plain string, so the template still suffixes it', () => {
    const meta = buildPageMetadata(metaArgs({ seoTitle: undefined }))

    expect(meta.title).toBe('Tech')
  })

  it('treats an empty seoTitle as absent and falls back to the plain string', () => {
    const meta = buildPageMetadata(metaArgs({ seoTitle: '' }))

    expect(meta.title).toBe('Tech')
  })

  it('falls back to a plain string when there is no page document at all', () => {
    const meta = buildPageMetadata(metaArgs(null))

    expect(meta.title).toBe('Tech')
  })

  it('leaves openGraph.title and twitter.title as the exact string, unchanged', () => {
    const authored = 'Tech Stack — Brandon Perfetti | Engineer'
    const meta = buildPageMetadata(metaArgs({ seoTitle: authored }))

    expect(meta.openGraph?.title).toBe(authored)
    expect(meta.twitter?.title).toBe(authored)
  })

  it('keeps openGraph/twitter on the fallback title when no seoTitle is authored', () => {
    const meta = buildPageMetadata(metaArgs({ seoTitle: undefined }))

    expect(meta.openGraph?.title).toBe('Tech')
    expect(meta.twitter?.title).toBe('Tech')
  })
})
