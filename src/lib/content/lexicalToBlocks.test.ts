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

/**
 * Internal links (#359, case 2). Payload's LinkFeature stores an internal link
 * as `fields: { linkType: 'internal', doc: { relationTo, value } }` and no
 * `url`; the converter used to read `url` alone, so every internal link in an
 * article body or a Prose block rendered as plain text. `value` is populated
 * only when the reader could see the target: a draft target comes back as a
 * bare id, which is what the cross-collection cache tags refresh.
 */
describe('lexicalToBlocks — internal links (#359)', () => {
  const paragraphWithLink = (fields: Record<string, unknown>) =>
    root([
      {
        type: 'paragraph',
        children: [
          { type: 'link', fields, children: [{ type: 'text', text: 'here' }] },
        ],
      },
    ])
  const spanOf = (fields: Record<string, unknown>) =>
    lexicalToBlocks(paragraphWithLink(fields))[0]?.richText?.[0]
  const hrefOf = (fields: Record<string, unknown>) => spanOf(fields)?.href
  /** The link's text survives as plain text, with no destination. */
  const expectTextOnly = (fields: Record<string, unknown>) => {
    const span = spanOf(fields)
    expect(span).toMatchObject({ plainText: 'here' })
    expect(span?.href).toBeUndefined()
  }

  it('links a populated page to its public path', () => {
    expect(
      hrefOf({
        linkType: 'internal',
        doc: {
          relationTo: 'pages',
          value: {
            _status: 'published',
            id: 2,
            path: 'work/acme',
            slug: 'acme',
          },
        },
      }),
    ).toBe('/work/acme')
  })

  it('links a populated, unplaced post to /articles/<slug>', () => {
    expect(
      hrefOf({
        linkType: 'internal',
        doc: {
          relationTo: 'posts',
          value: { _status: 'published', id: 3, slug: 'hello' },
        },
      }),
    ).toBe('/articles/hello')
  })

  it('renders no link for a target the reader could not see (a bare id)', () => {
    expectTextOnly({
      linkType: 'internal',
      doc: { relationTo: 'pages', value: 2 },
    })
  })

  it('renders no link for a populated target that is not published', () => {
    // A trusted read (`getGatedPostContent`, `overrideAccess: true`) populates
    // drafts too; their path serves nothing yet.
    expectTextOnly({
      linkType: 'internal',
      doc: {
        relationTo: 'pages',
        value: { _status: 'draft', id: 2, path: 'lab', slug: 'lab' },
      },
    })
  })

  it('keeps a custom link on its url', () => {
    expect(hrefOf({ linkType: 'custom', url: 'https://example.com' })).toBe(
      'https://example.com',
    )
  })
})
