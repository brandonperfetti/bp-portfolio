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
      richText: null,
      links: [],
    })
  })

  it('none clears media, slides, effect but keeps richText + links', () => {
    expect(
      normalizeHeroByType({ type: 'none', media: 5, richText, links }),
    ).toEqual({
      type: 'none',
      media: null,
      slides: [],
      effect: null,
      richText,
      links,
    })
  })

  it('shader clears media, slides, effect but keeps richText + links', () => {
    expect(
      normalizeHeroByType({ type: 'shader', media: 5, richText, links }),
    ).toEqual({
      type: 'shader',
      media: null,
      slides: [],
      effect: null,
      richText,
      links,
    })
  })

  it('standard keeps media, richText, links but clears carousel-only slides + effect', () => {
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
      richText,
      links,
    })
  })

  it('image keeps its media (the full-bleed banner reuses the one upload)', () => {
    // The one behaviour #65 adds to the media rule: `image` renders the upload
    // full-bleed, so it is kept just as `standard` keeps its inset image.
    expect(
      normalizeHeroByType({ type: 'image', media: 5, richText, links }),
    ).toEqual({
      type: 'image',
      media: 5,
      slides: [],
      effect: null,
      richText,
      links,
    })
  })

  it('carousel keeps slides + effect but clears media (its image lives in slides)', () => {
    expect(
      normalizeHeroByType({
        type: 'carousel',
        media: 5,
        slides,
        effect: 'fade',
        richText,
        links,
      }),
    ).toEqual({
      type: 'carousel',
      media: null,
      slides,
      effect: 'fade',
      richText,
      links,
    })
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
