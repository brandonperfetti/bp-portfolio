import { describe, expect, it, vi } from 'vitest'

import {
  findMainTableRow,
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

/**
 * The same projection with the `_status` clause deliberately absent — and its
 * absence is the whole contract, so it is pinned as an exact `where` rather
 * than a partial match. Adding a `_status` filter here would silently restore
 * the CodeRabbit-#179 defect: a never-published parent's first publish would
 * stop cascading its subtree.
 */
describe('findMainTableRow', () => {
  it('asks for the row by id ALONE, with no publish-status clause', async () => {
    const { find, req } = makeReq([{ path: 'a', slug: 'a' }])

    await findMainTableRow(req, 'pages', 3)

    expect(find).toHaveBeenCalledTimes(1)
    const [args] = find.mock.calls[0]
    expect(args.where).toEqual({ id: { equals: 3 } })
    // No `draft: true`: `collections/operations/find.js:96` branches to
    // `queryDrafts` (the `_v` table) only when that flag is set, so omitting
    // it is what makes this the MAIN-table read.
    expect(args.draft).toBeUndefined()
    expect(args.depth).toBe(0)
    expect(args.select).toEqual({ path: true, slug: true })
    expect(args.req).toBe(req)
    expect(args.overrideAccess).toBe(true)
  })

  it('returns the row for a document that has never been published', async () => {
    const { req } = makeReq([{ path: 'a', slug: 'a' }])

    await expect(findMainTableRow(req, 'pages', 3)).resolves.toEqual({
      path: 'a',
      slug: 'a',
    })
  })

  it('returns null when no row exists at all', async () => {
    const { req } = makeReq([])

    await expect(findMainTableRow(req, 'pages', 3)).resolves.toBeNull()
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
