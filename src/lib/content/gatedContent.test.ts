import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The trusted gated-body read populates link targets with their publish state
 * (#359).
 *
 * `getGatedPostContent` runs with `overrideAccess: true`, and that override
 * reaches the Lexical link relationship population, so a draft target comes
 * back populated, not as the bare id an access-enforced read returns. The
 * collections' `defaultPopulate` leaves `_status` out, so without a `populate`
 * of its own the read hands `lexicalToBlocks` a draft that looks published and
 * renders as a dead link. These pin that the read asks for `_status` on both
 * link-target collections while keeping each collection's default fields.
 */
const { findByID } = vi.hoisted(() => ({ findByID: vi.fn() }))

const PAGES_POPULATE = { path: true, slug: true, title: true }
const POSTS_POPULATE = { categories: true, path: true, slug: true, title: true }

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    collections: {
      pages: { config: { defaultPopulate: PAGES_POPULATE } },
      posts: { config: { defaultPopulate: POSTS_POPULATE } },
    },
    findByID,
  })),
}))
vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }))
vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: false }),
}))

import { getGatedPostContent } from '@/lib/content/posts'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'

beforeEach(() => {
  findByID.mockReset()
  findByID.mockResolvedValue({ content: null })
})

describe('getGatedPostContent link-target population (#359)', () => {
  it('populates pages and posts with _status on top of their default fields', async () => {
    await getGatedPostContent(7)

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        id: 7,
        overrideAccess: true,
        populate: {
          pages: { ...PAGES_POPULATE, _status: true },
          posts: { ...POSTS_POPULATE, _status: true },
        },
      }),
    )
  })

  it('so a draft target it populates renders as text, not a link', async () => {
    // The shape that read returns for a never-published page under the
    // populate above; without `_status` the converter would link `/lab`.
    findByID.mockResolvedValue({
      content: {
        root: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'link',
                  fields: {
                    linkType: 'internal',
                    doc: {
                      relationTo: 'pages',
                      value: {
                        _status: 'draft',
                        id: 2,
                        path: 'lab',
                        slug: 'lab',
                        title: 'Lab',
                      },
                    },
                  },
                  children: [{ type: 'text', text: 'the lab' }],
                },
              ],
            },
          ],
        },
      },
    })

    const content = await getGatedPostContent(7)
    const blocks = lexicalToBlocks(content)
    expect(JSON.stringify(blocks)).toContain('the lab')
    expect(JSON.stringify(blocks)).not.toContain('"href"')
  })
})
