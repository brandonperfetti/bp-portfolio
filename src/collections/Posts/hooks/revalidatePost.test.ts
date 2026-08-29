import { describe, expect, it, vi } from 'vitest'

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
