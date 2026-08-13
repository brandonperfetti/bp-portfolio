import { beforeEach, describe, expect, it, vi } from 'vitest'

// The repo reads through the Payload Local API wrapped in unstable_cache.
// Both are stubbed so the mapping runs against fixtures: getPayload returns a
// fake `find`, and unstable_cache passes the loader through unchanged.
const find = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import {
  DEFAULT_CMS_AUTHOR,
  getCmsAuthors,
  getCmsDefaultAuthor,
} from '@/lib/cms/authorsRepo'

beforeEach(() => {
  find.mockReset()
})

describe('getCmsAuthors', () => {
  it('falls back to the single-author default when the collection is empty', async () => {
    find.mockResolvedValue({ docs: [] })
    await expect(getCmsAuthors()).resolves.toEqual([DEFAULT_CMS_AUTHOR])
  })

  it('maps author docs to profiles with resolved avatar + socials', async () => {
    find.mockResolvedValue({
      docs: [
        {
          id: 1,
          name: 'Brandon Perfetti',
          slug: 'brandon-perfetti',
          role: 'Technical PM + Software Engineer',
          avatar: { url: '/api/media/file/bp.jpg' },
          // Whitespace-only URLs are trimmed away.
          socials: [{ url: 'https://x.com/brandonperfetti' }, { url: '  ' }],
        },
        { id: 2, name: 'Ada Lovelace', slug: 'ada', socials: [] },
      ],
    })

    const authors = await getCmsAuthors()

    expect(authors[0]).toMatchObject({
      id: '1',
      slug: 'brandon-perfetti',
      name: 'Brandon Perfetti',
      role: 'Technical PM + Software Engineer',
      image: '/api/media/file/bp.jpg',
      href: '/about',
      sameAs: ['https://x.com/brandonperfetti'],
      primary: true,
      order: 0,
    })
    // Guest author: no /about link, no sameAs, not primary.
    expect(authors[1]).toMatchObject({
      id: '2',
      name: 'Ada Lovelace',
      href: undefined,
      sameAs: undefined,
      primary: false,
      order: 1,
    })
  })

  it('queries the public authors collection with access enforced', async () => {
    find.mockResolvedValue({ docs: [] })
    await getCmsAuthors()
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'authors', overrideAccess: false }),
    )
  })
})

describe('getCmsDefaultAuthor', () => {
  it('returns the primary (first) author', async () => {
    find.mockResolvedValue({
      docs: [{ id: 5, name: 'Ada Lovelace', slug: 'ada' }],
    })
    await expect(getCmsDefaultAuthor()).resolves.toMatchObject({
      name: 'Ada Lovelace',
      primary: true,
    })
  })

  it('returns the identity-backed default when no authors exist', async () => {
    find.mockResolvedValue({ docs: [] })
    await expect(getCmsDefaultAuthor()).resolves.toEqual(DEFAULT_CMS_AUTHOR)
  })
})
