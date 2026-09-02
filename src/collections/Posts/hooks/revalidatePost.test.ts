import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * immediate-expiration profile `{ expire: 0 }`, not `'max'`, on every branch
 * (publish, unpublish, delete). Under cacheComponents `'max'` is
 * stale-while-revalidate with a one-year stale window, so a regression back
 * to `'max'` (or to no second arg) silently reintroduces the ~10-20 minute
 * stale-admin-edit bug — this test fails loudly instead.
 */
const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}))

import { revalidateDelete, revalidatePost } from './revalidatePost'

const changeArgs = (
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown>,
  context: Record<string, unknown> = {},
) =>
  ({
    doc,
    previousDoc,
    req: { payload: { logger: { info: vi.fn() } }, context },
  }) as never

describe('revalidatePost (afterChange)', () => {
  it('purges posts/posts-sitemap with expire:0 on publish', () => {
    revalidatePost(
      changeArgs({ slug: 'hello', _status: 'published' }, { _status: 'draft' }),
    )

    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts-sitemap', {
      expire: 0,
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/articles/hello')
  })

  it('purges posts/posts-sitemap with expire:0 on unpublish', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidatePost(
      changeArgs(
        { slug: 'hello', _status: 'draft' },
        { slug: 'hello', _status: 'published' },
      ),
    )

    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts-sitemap', {
      expire: 0,
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/articles/hello')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidatePost(
      changeArgs(
        { slug: 'hello', _status: 'published' },
        { _status: 'draft' },
        { disableRevalidate: true },
      ),
    )

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

/**
 * Old-path purge transition matrix (#132).
 *
 * #132 asked whether the rename purge should move here from
 * `createSlugRedirect`. The answer is no — see the TSDoc on `revalidatePost`
 * for the reasoning — so what this block owns is the other half of that
 * decision: pinning exactly which transitions purge which path, so the split
 * cannot drift into a gap or an overlap without a test failing.
 *
 * The `previousDoc` values below are the ones Payload really passes, not the
 * ones the transition names suggest. `previousDoc` is
 * `getLatestCollectionVersion(...)`, and Posts autosaves every 100ms, so after
 * any autosave it is the DRAFT: `_status: 'draft'`, and already carrying the
 * NEW slug. Every row that says "autosaved" is written that way on purpose.
 */
describe('revalidatePost old-path purge matrix (#132)', () => {
  beforeEach(() => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()
  })

  const purgedPaths = () => mocks.revalidatePath.mock.calls.map(([p]) => p)

  it('first publish purges the new path and no old path', () => {
    revalidatePost(
      changeArgs({ slug: 'a', _status: 'published' }, { _status: 'draft' }),
    )

    expect(purgedPaths()).toContain('/articles/a')
    expect(purgedPaths()).not.toContain('/articles/undefined')
  })

  it('a published edit that does not rename purges its one path', () => {
    revalidatePost(
      changeArgs(
        { slug: 'a', _status: 'published' },
        { slug: 'a', _status: 'published' },
      ),
    )

    expect(purgedPaths().filter((p) => p.startsWith('/articles/'))).toEqual([
      '/articles/a',
    ])
  })

  it('a published-to-published rename purges ONLY the new path here', () => {
    // The admin shape: the autosaved draft already holds the new slug.
    // `createSlugRedirect` purges `/articles/a`, in the same try that wrote the
    // redirect row whose `from` is that exact string.
    revalidatePost(
      changeArgs(
        { slug: 'b', _status: 'published' },
        { slug: 'b', _status: 'draft' },
      ),
    )

    expect(purgedPaths()).toContain('/articles/b')
    expect(purgedPaths()).not.toContain('/articles/a')
  })

  it('unpublish with no pending draft purges the path it was serving', () => {
    revalidatePost(
      changeArgs(
        { slug: 'a', _status: 'draft' },
        { slug: 'a', _status: 'published' },
      ),
    )

    expect(purgedPaths()).toContain('/articles/a')
  })

  it('KNOWN GAP: unpublish after an autosaved rename purges nothing (#132)', () => {
    // Measured on real Postgres, 2026-09-02. Unpublish sends
    // `_status: 'draft'`, so `capturePublishedSlug` returns early and no
    // captured slug exists; `previousDoc` is the autosaved draft, so
    // `previousDoc._status === 'published'` is false and the old-path branch
    // never runs at all. The live URL `/articles/a` keeps serving its
    // prerendered shell after the document is unpublished.
    //
    // This is pinned rather than fixed: the true published slug is not present
    // in ANY afterChange argument on this path, so closing it means teaching
    // `capturePublishedSlug` to fire on unpublish — which needs a way to tell
    // an unpublish from an autosave draft save that this tree does not have,
    // and getting it wrong puts a database read on every 100ms autosave.
    // Tracked in a follow-up to #132; change this expectation when that lands.
    revalidatePost(
      changeArgs(
        { slug: 'b', _status: 'draft' },
        { slug: 'b', _status: 'draft' },
      ),
    )

    expect(purgedPaths()).toEqual([])
  })
})

describe('revalidateDelete (afterDelete)', () => {
  it('purges posts/posts-sitemap with the immediate-expiration expire:0 profile', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidateDelete({
      doc: { slug: 'hello' },
      req: { context: {} },
    } as never)

    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts-sitemap', {
      expire: 0,
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidateDelete({
      doc: { slug: 'hello' },
      req: { context: { disableRevalidate: true } },
    } as never)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
