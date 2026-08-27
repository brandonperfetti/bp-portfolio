import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 draft-split: getPageBySlugDraftAware selects a cached published read
// (draft:false → static prerender) vs an uncached draft read (draft:true),
// keyed on draftMode(). Payload + the `'use cache'` primitives are stubbed so
// the selector's branch + the find args are asserted against fixtures.
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

import { getPageBySlugDraftAware } from '@/lib/cms/pagesRepo'

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [] })
  draftState.isEnabled = false
})

describe('getPageBySlugDraftAware draft-split (#76 B2)', () => {
  it('published visitors + the build take the cached published read (draft:false)', async () => {
    draftState.isEnabled = false
    await getPageBySlugDraftAware('about')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        draft: false,
        overrideAccess: false,
        where: { slug: { equals: 'about' } },
      }),
    )
  })

  it('admin draft preview takes the uncached draft read (draft:true, overrideAccess:true)', async () => {
    draftState.isEnabled = true
    await getPageBySlugDraftAware('about')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        draft: true,
        overrideAccess: true,
        where: { slug: { equals: 'about' } },
      }),
    )
  })

  it('returns the first matching doc, or null when none match', async () => {
    find.mockResolvedValue({ docs: [{ id: 7, slug: 'about' }] })
    await expect(getPageBySlugDraftAware('about')).resolves.toMatchObject({
      id: 7,
    })
    find.mockResolvedValue({ docs: [] })
    await expect(getPageBySlugDraftAware('about')).resolves.toBeNull()
  })
})
