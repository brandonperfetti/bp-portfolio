import { describe, expect, it } from 'vitest'

import { normalizeHeroByType } from './normalizeHeroByType'

const richText = { root: { children: [{ type: 'heading', version: 1 }] } }
const links = [{ link: { label: 'View work', url: '/projects' } }]
const slides = [{ image: 7, title: 'One' }]

describe('normalizeHeroByType', () => {
  it('blank clears media, slides, effect, richText, and links (renders nothing)', () => {
    expect(
      normalizeHeroByType({
        type: 'blank',
        media: 5,
        slides,
        effect: 'fade',
        richText,
        links,
      }),
    ).toEqual({
      type: 'blank',
      media: null,
      slides: [],
      effect: null,
      navigation: null,
      pagination: null,
      showContent: null,
      richText: null,
      links: [],
    })
  })

  it('none clears media, slides, effect + banner toggles but keeps richText + links', () => {
    expect(
      normalizeHeroByType({ type: 'none', media: 5, richText, links }),
    ).toEqual({
      type: 'none',
      media: null,
      slides: [],
      effect: null,
      navigation: null,
      pagination: null,
      showContent: null,
      richText,
      links,
    })
  })

  it('shader clears media, slides, effect + banner toggles but keeps richText + links', () => {
    expect(
      normalizeHeroByType({ type: 'shader', media: 5, richText, links }),
    ).toEqual({
      type: 'shader',
      media: null,
      slides: [],
      effect: null,
      navigation: null,
      pagination: null,
      showContent: null,
      richText,
      links,
    })
  })

  it('standard keeps media, richText, links but clears carousel-only fields + banner toggles', () => {
    expect(
      normalizeHeroByType({
        type: 'standard',
        media: 5,
        slides,
        effect: 'fade',
        richText,
        links,
      }),
    ).toEqual({
      type: 'standard',
      media: 5,
      slides: [],
      effect: null,
      navigation: null,
      pagination: null,
      showContent: null,
      richText,
      links,
    })
  })

  it('image keeps its media + showContent but clears carousel-only nav/pagination', () => {
    // The one behaviour #65 adds to the media rule: `image` renders the upload
    // full-bleed, so it is kept just as `standard` keeps its inset image. B6.1:
    // `showContent` is an image field (not cleared); nav/pagination are
    // carousel-only, so they clear to null.
    expect(
      normalizeHeroByType({
        type: 'image',
        media: 5,
        showContent: false,
        richText,
        links,
      }),
    ).toEqual({
      type: 'image',
      media: 5,
      slides: [],
      effect: null,
      navigation: null,
      pagination: null,
      showContent: false,
      richText,
      links,
    })
  })

  it('carousel keeps slides + effect + all banner toggles but clears media', () => {
    expect(
      normalizeHeroByType({
        type: 'carousel',
        media: 5,
        slides,
        effect: 'fade',
        navigation: false,
        pagination: false,
        showContent: false,
        richText,
        links,
      }),
    ).toEqual({
      type: 'carousel',
      media: null,
      slides,
      effect: 'fade',
      navigation: false,
      pagination: false,
      showContent: false,
      richText,
      links,
    })
  })

  it('clears the banner toggles (to null) off the types that do not render them', () => {
    // showContent is image/carousel-only; navigation/pagination carousel-only.
    // They clear to `null` (nullable boolean columns — not the array-null bug),
    // so a re-switch back re-applies each field's DEFAULT true.
    const standard = normalizeHeroByType({
      type: 'standard',
      showContent: true,
      navigation: true,
      pagination: true,
    })
    expect(standard.showContent).toBeNull()
    expect(standard.navigation).toBeNull()
    expect(standard.pagination).toBeNull()

    // On image, showContent survives; only nav/pagination clear.
    const image = normalizeHeroByType({
      type: 'image',
      showContent: true,
      navigation: true,
      pagination: true,
    })
    expect(image.showContent).toBe(true)
    expect(image.navigation).toBeNull()
    expect(image.pagination).toBeNull()
  })

  it('strips orphan slides + effect off a non-carousel hero', () => {
    // The new rule: a page switched away from `carousel` must not carry its
    // old slide uploads or effect, hidden and ready to resurface on a re-switch.
    // `slides` clears to `[]`, NOT `null`: Payload rejects a null write to the
    // array relation and 500s every non-carousel hero save otherwise (staging
    // QA). The nullable `effect` enum column clears fine with `null`.
    const result = normalizeHeroByType({
      type: 'standard',
      slides,
      effect: 'spring',
    })
    expect(result.slides).toEqual([])
    expect(result.effect).toBeNull()
  })

  describe('empty Lexical root in richText (#164)', () => {
    // The exact value found stored in `pages.hero_rich_text` for `about`,
    // which made the hero tab render "Minified Lexical error #38" instead of
    // an editor. AC 2: saving with the hero text cleared must store NULL.
    const emptyRoot = {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        children: [],
        direction: 'ltr',
      },
    }

    // Every type that renders (and therefore can store) hero text; `blank`
    // already nulls richText unconditionally and is covered above.
    const nonBlankTypes = [
      'none',
      'standard',
      'shader',
      'image',
      'carousel',
    ] as const

    it.each(nonBlankTypes)('%s stores an empty root as null', (type) => {
      expect(normalizeHeroByType({ type, richText: emptyRoot }).richText).toBe(
        null,
      )
    })

    it('leaves a root with one paragraph child untouched', () => {
      const paragraph = {
        root: { type: 'root', children: [{ type: 'paragraph', version: 1 }] },
      }
      expect(
        normalizeHeroByType({ type: 'none', richText: paragraph }).richText,
      ).toBe(paragraph)
    })

    it('leaves null richText as null', () => {
      expect(
        normalizeHeroByType({ type: 'standard', richText: null }).richText,
      ).toBeNull()
    })
  })

  it('does not mutate the input', () => {
    const input = {
      type: 'blank',
      media: 5,
      slides,
      effect: 'fade',
      richText,
      links,
    }
    normalizeHeroByType(input)
    expect(input.media).toBe(5)
    expect(input.slides).toBe(slides)
    expect(input.effect).toBe('fade')
    expect(input.richText).toBe(richText)
    expect(input.links).toBe(links)
  })

  it('tolerates a nullish hero', () => {
    expect(normalizeHeroByType(null)).toBeNull()
    expect(normalizeHeroByType(undefined)).toBeUndefined()
  })
})
