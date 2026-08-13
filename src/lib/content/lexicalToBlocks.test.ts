import { describe, expect, it } from 'vitest'

import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'

/**
 * `lexicalToBlocks` is exercised end-to-end through the Prose block and article
 * bodies; this suite pins the embedded-block (`type: 'block'`) mapping directly,
 * and in particular the `mediaBlock` case that settles #44's #45 — before it, an
 * embedded media block in a Posts body converted to nothing and rendered blank.
 */

const root = (children: unknown[]) => ({
  root: { type: 'root', children },
})

const mediaBlockNode = (media: unknown) => ({
  type: 'block',
  fields: { blockType: 'mediaBlock', media },
})

describe('lexicalToBlocks — embedded mediaBlock (#45)', () => {
  it('maps a populated mediaBlock upload to an image block with its url', () => {
    const blocks = lexicalToBlocks(
      root([mediaBlockNode({ url: '/media/portrait.jpg', alt: 'A portrait' })]),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'image',
      url: '/media/portrait.jpg',
      caption: [{ plainText: 'A portrait' }],
    })
  })

  it('emits an empty caption when the media has no alt text', () => {
    const blocks = lexicalToBlocks(
      root([mediaBlockNode({ url: '/media/plain.png' })]),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'image', url: '/media/plain.png' })
    expect(blocks[0].caption).toEqual([])
  })

  it('skips a mediaBlock whose upload is unpopulated (bare id or no url)', () => {
    // A find depth that returns a bare relation id must not render broken —
    // mirror the bare `upload` case, which also drops an id-only value.
    expect(lexicalToBlocks(root([mediaBlockNode(42)]))).toEqual([])
    expect(lexicalToBlocks(root([mediaBlockNode({ alt: 'no url' })]))).toEqual(
      [],
    )
    expect(lexicalToBlocks(root([mediaBlockNode(undefined)]))).toEqual([])
  })

  it('still maps the sibling code and banner blocks it always has', () => {
    const blocks = lexicalToBlocks(
      root([
        { type: 'block', fields: { blockType: 'code', code: 'x = 1' } },
        mediaBlockNode({ url: '/media/a.jpg' }),
      ]),
    )
    expect(blocks.map((b) => b.type)).toEqual(['code', 'image'])
  })
})
