import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 draft-split: getPostBySlug selects a cached published body read
// (draft:false → the article shell prerenders) vs an uncached draft read
// (draft:true), keyed on draftMode().
const find = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))
vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))
const { draftState } = vi.hoisted(() => ({ draftState: { isEnabled: false } }))
vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: draftState.isEnabled }),
}))

import { getPostBySlug } from '@/lib/content/posts'

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [] })
  draftState.isEnabled = false
})

describe('getPostBySlug draft-split (#76 B2)', () => {
  it('published visitors + the build take the cached published read (draft:false)', async () => {
    draftState.isEnabled = false
    await getPostBySlug('a-post')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        draft: false,
        overrideAccess: false,
        where: { slug: { equals: 'a-post' } },
      }),
    )
  })

  it('admin draft preview takes the uncached draft read (draft:true, overrideAccess:true)', async () => {
    draftState.isEnabled = true
    await getPostBySlug('a-post')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        draft: true,
        overrideAccess: true,
      }),
    )
  })

  it('returns the first matching doc, or null when none match', async () => {
    find.mockResolvedValue({ docs: [{ id: 3, slug: 'a-post' }] })
    await expect(getPostBySlug('a-post')).resolves.toMatchObject({ id: 3 })
    find.mockResolvedValue({ docs: [] })
    await expect(getPostBySlug('a-post')).resolves.toBeNull()
  })
})
