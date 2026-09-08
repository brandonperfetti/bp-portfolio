// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const find = vi.fn()

// `'use cache'` has no request/cache scope under Vitest; the directive is inert
// here and `cacheTags.test.ts` is what pins the tag and tier each function
// declares. This suite is about the shape of what comes back.
vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))

const { getPageLayoutBySlug, getPostLayoutBySlug } =
  await import('@/lib/cms/layoutsRepo')

/**
 * #177: these two reads already selected the hosting document, and used to
 * return `docs[0]?.layout ?? null` — discarding the identity half of the row
 * they had just read. A block that wants to query for things belonging to its
 * host needs that id, so the id now travels with the layout.
 */
describe('layoutsRepo · hosted layouts (#177)', () => {
  beforeEach(() => {
    find.mockReset()
  })

  it('returns the page’s id alongside its layout', async () => {
    find.mockResolvedValue({
      docs: [{ id: 7, layout: [{ blockType: 'spacer', id: 's' }] }],
    })

    await expect(getPageLayoutBySlug('uses')).resolves.toEqual({
      id: 7,
      layout: [{ blockType: 'spacer', id: 's' }],
    })
  })

  it('returns the post’s id alongside its layout', async () => {
    find.mockResolvedValue({ docs: [{ id: 12, layout: [] }] })

    await expect(getPostLayoutBySlug('a-post')).resolves.toEqual({
      id: 12,
      layout: [],
    })
  })

  it('keeps the same single-slug argument, so no cache key moved', async () => {
    find.mockResolvedValue({ docs: [{ id: 7, layout: null }] })

    await getPageLayoutBySlug('uses')
    await getPostLayoutBySlug('a-post')

    expect(getPageLayoutBySlug).toHaveLength(1)
    expect(getPostLayoutBySlug).toHaveLength(1)
    // Same finder arguments as before the id joined the return value: the
    // query is untouched, only the mapping of its result changed.
    expect(find).toHaveBeenNthCalledWith(1, {
      collection: 'pages',
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: { slug: { equals: 'uses' } },
    })
    expect(find).toHaveBeenNthCalledWith(2, {
      collection: 'posts',
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: { slug: { equals: 'a-post' } },
    })
  })

  it('returns a document with a null layout rather than swallowing it', async () => {
    // `null` now means "no such published document", which is a different
    // fact from "the document exists and has no blocks" — the callers rely on
    // the distinction to decide whether they can name a host at all.
    find.mockResolvedValue({ docs: [{ id: 7, layout: null }] })

    await expect(getPageLayoutBySlug('uses')).resolves.toEqual({
      id: 7,
      layout: null,
    })
  })

  it('returns null when no published document has the slug', async () => {
    find.mockResolvedValue({ docs: [] })

    await expect(getPageLayoutBySlug('nope')).resolves.toBeNull()
    await expect(getPostLayoutBySlug('nope')).resolves.toBeNull()
  })
})
