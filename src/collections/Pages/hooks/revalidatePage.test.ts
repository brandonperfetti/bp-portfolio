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

import { revalidateDelete, revalidatePage } from './revalidatePage'

const changeArgs = (
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> | undefined,
  context: Record<string, unknown> = {},
) =>
  ({
    doc,
    previousDoc,
    req: { payload: { logger: { info: vi.fn() } }, context },
  }) as never

describe('revalidatePage (afterChange)', () => {
  it('purges pages/pages-sitemap with expire:0 on publish', () => {
    revalidatePage(
      changeArgs({ slug: 'about', _status: 'published' }, { _status: 'draft' }),
    )

    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages-sitemap', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/about')
  })

  it('purges pages/pages-sitemap with expire:0 on unpublish', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidatePage(
      changeArgs(
        { slug: 'about', _status: 'draft' },
        { slug: 'about', _status: 'published' },
      ),
    )

    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages-sitemap', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/about')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidatePage(
      changeArgs(
        { slug: 'about', _status: 'published' },
        { _status: 'draft' },
        { disableRevalidate: true },
      ),
    )

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

/**
 * Old-path purge transition matrix (#132) — the Pages half of the matrix in
 * `src/collections/Posts/hooks/revalidatePost.test.ts`. Same decision, same
 * `previousDoc`-is-the-autosaved-draft caveat (Pages autosaves at the same
 * 100ms interval), and one extra thing to pin that Posts does not have: this
 * hook maps `home` to `/`, while `publicPathForSlug('pages', 'home')` — the
 * function `createSlugRedirect` builds its rows from — yields `/home`. The two
 * path vocabularies genuinely disagree, which is the concrete reason the purge
 * stays with the writer instead of moving here.
 */
describe('revalidatePage old-path purge matrix (#132)', () => {
  beforeEach(() => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()
  })

  const purgedPaths = () => mocks.revalidatePath.mock.calls.map(([p]) => p)

  it('first publish purges the new path and no old path', () => {
    revalidatePage(
      changeArgs({ slug: 'a', _status: 'published' }, { _status: 'draft' }),
    )

    expect(purgedPaths()).toEqual(['/a'])
  })

  it('a published edit that does not rename purges its one path', () => {
    revalidatePage(
      changeArgs(
        { slug: 'a', _status: 'published' },
        { slug: 'a', _status: 'published' },
      ),
    )

    expect(purgedPaths()).toEqual(['/a'])
  })

  it('a published-to-published rename purges ONLY the new path here', () => {
    revalidatePage(
      changeArgs(
        { slug: 'b', _status: 'published' },
        { slug: 'b', _status: 'draft' },
      ),
    )

    expect(purgedPaths()).toEqual(['/b'])
  })

  it('unpublish with no pending draft purges the path it was serving', () => {
    revalidatePage(
      changeArgs(
        { slug: 'a', _status: 'draft' },
        { slug: 'a', _status: 'published' },
      ),
    )

    expect(purgedPaths()).toEqual(['/a'])
  })

  it('KNOWN GAP: unpublish after an autosaved rename purges nothing (#132)', () => {
    // Identical to the Posts gap and for identical reasons — see the comment
    // there. Pinned, not fixed.
    revalidatePage(
      changeArgs(
        { slug: 'b', _status: 'draft' },
        { slug: 'b', _status: 'draft' },
      ),
    )

    expect(purgedPaths()).toEqual([])
  })

  it('maps the home page to / on both the current- and old-path branches', () => {
    // The vocabulary split above, stated as a test: this hook serves `home` at
    // `/`, `publicPathForSlug` calls it `/home`. Whoever purges must use the
    // vocabulary of whoever wrote the thing being exposed.
    revalidatePage(
      changeArgs({ slug: 'home', _status: 'published' }, { _status: 'draft' }),
    )
    expect(purgedPaths()).toEqual(['/'])

    mocks.revalidatePath.mockClear()
    revalidatePage(
      changeArgs(
        { slug: 'home', _status: 'draft' },
        { slug: 'home', _status: 'published' },
      ),
    )
    expect(purgedPaths()).toEqual(['/'])
  })
})

describe('revalidateDelete (afterDelete)', () => {
  it('purges pages/pages-sitemap with the immediate-expiration expire:0 profile', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidateDelete({
      doc: { slug: 'about' },
      req: { context: {} },
    } as never)

    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('pages-sitemap', {
      expire: 0,
    })
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidateDelete({
      doc: { slug: 'about' },
      req: { context: { disableRevalidate: true } },
    } as never)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
