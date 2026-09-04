import { describe, expect, it, vi } from 'vitest'

import {
  findPublishedRow,
  findPublishedSlug,
} from '@/fields/slug/findPublishedSlug'

/**
 * The query that defines "the live URL" (#120, #155).
 *
 * What is worth pinning here is not that `find` is called — it is the SHAPE of
 * the call, because three hooks depend on this one `where` meaning exactly
 * "the row the site is serving": a lost `_status` clause would hand a caller
 * the draft's slug, and a lost `req` would take the lookup outside the write's
 * transaction. The projection is pinned too, because #155 needs `path` and a
 * silent narrowing back to `{ slug }` would make a placed document's purge
 * resolve to the wrong URL.
 */
const makeReq = (docs: unknown[]) => {
  const find = vi.fn(async (args: Record<string, unknown>) => {
    void args
    return { docs }
  })
  return { find, req: { payload: { find } } as never }
}

describe('findPublishedRow', () => {
  it('selects slug AND path, at depth 0, on the in-flight request', async () => {
    const { find, req } = makeReq([{ path: 'work/a', slug: 'a' }])

    await findPublishedRow(req, 'posts', 7)

    expect(find).toHaveBeenCalledTimes(1)
    const [args] = find.mock.calls[0]
    expect(args.collection).toBe('posts')
    expect(args.depth).toBe(0)
    expect(args.select).toEqual({ path: true, slug: true })
    expect(args.req).toBe(req)
    expect(args.overrideAccess).toBe(true)
  })

  it('asks only for the PUBLISHED row of that document', async () => {
    const { find, req } = makeReq([])

    await findPublishedRow(req, 'pages', 3)

    const [args] = find.mock.calls[0]
    expect(args.where).toEqual({
      and: [{ id: { equals: 3 } }, { _status: { equals: 'published' } }],
    })
  })

  it('returns the row, path included', async () => {
    const { req } = makeReq([{ path: 'work/a', slug: 'a' }])

    await expect(findPublishedRow(req, 'posts', 7)).resolves.toEqual({
      path: 'work/a',
      slug: 'a',
    })
  })

  it('returns null when the document has never been published', async () => {
    const { req } = makeReq([])

    await expect(findPublishedRow(req, 'posts', 7)).resolves.toBeNull()
  })
})

describe('findPublishedSlug', () => {
  it('is the slug-only face of the same single query', async () => {
    const { find, req } = makeReq([{ path: 'work/a', slug: 'a' }])

    await expect(findPublishedSlug(req, 'posts', 7)).resolves.toBe('a')
    // One query, not two — the whole reason the wrapper delegates.
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('returns null for an unpublished document', async () => {
    const { req } = makeReq([])

    await expect(findPublishedSlug(req, 'posts', 7)).resolves.toBeNull()
  })

  it('treats a missing or empty slug as unpublished rather than returning it', async () => {
    await expect(
      findPublishedSlug(makeReq([{ slug: '' }]).req, 'posts', 7),
    ).resolves.toBeNull()
    await expect(
      findPublishedSlug(makeReq([{ path: 'work/a' }]).req, 'posts', 7),
    ).resolves.toBeNull()
  })
})
