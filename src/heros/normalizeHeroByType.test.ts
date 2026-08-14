import { describe, expect, it } from 'vitest'

import { normalizeHeroByType } from './normalizeHeroByType'

const richText = { root: { children: [{ type: 'heading', version: 1 }] } }
const links = [{ link: { label: 'View work', url: '/projects' } }]

describe('normalizeHeroByType', () => {
  it('blank clears media, richText, and links (renders nothing)', () => {
    expect(
      normalizeHeroByType({ type: 'blank', media: 5, richText, links }),
    ).toEqual({ type: 'blank', media: null, richText: null, links: [] })
  })

  it('none clears media but keeps richText + links', () => {
    expect(
      normalizeHeroByType({ type: 'none', media: 5, richText, links }),
    ).toEqual({ type: 'none', media: null, richText, links })
  })

  it('shader clears media but keeps richText + links', () => {
    expect(
      normalizeHeroByType({ type: 'shader', media: 5, richText, links }),
    ).toEqual({ type: 'shader', media: null, richText, links })
  })

  it('standard keeps media, richText, and links (the only type that renders an image)', () => {
    expect(
      normalizeHeroByType({ type: 'standard', media: 5, richText, links }),
    ).toEqual({ type: 'standard', media: 5, richText, links })
  })

  it('does not mutate the input', () => {
    const input = { type: 'blank', media: 5, richText, links }
    normalizeHeroByType(input)
    expect(input.media).toBe(5)
    expect(input.richText).toBe(richText)
    expect(input.links).toBe(links)
  })

  it('tolerates a nullish hero', () => {
    expect(normalizeHeroByType(null)).toBeNull()
    expect(normalizeHeroByType(undefined)).toBeUndefined()
  })
})
