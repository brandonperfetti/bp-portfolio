import { describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * read-your-writes profile `{ expire: 0 }`, not `'max'`, in BOTH the
 * afterChange and afterDelete hooks this module builds. Under
 * cacheComponents `'max'` is stale-while-revalidate with a one-year stale
 * window, so a regression back to `'max'` (or to no second arg) silently
 * reintroduces the ~10-20 minute stale-admin-edit bug — this test fails
 * loudly instead.
 */
const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}))

import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from './revalidateCollection'

const changeArgs = (context: Record<string, unknown> = {}) =>
  ({
    doc: { id: '1' },
    req: {
      payload: { logger: { info: vi.fn() } },
      context,
    },
  }) as never

const deleteArgs = (context: Record<string, unknown> = {}) =>
  ({
    doc: { id: '1' },
    req: { context },
  }) as never

describe('revalidateCollectionTag (afterChange)', () => {
  it('purges the tag with expire:0 and revalidates every path', () => {
    const hook = revalidateCollectionTag('tech-stack', ['/', '/uses'])
    hook(changeArgs())

    expect(mocks.revalidateTag).toHaveBeenCalledWith('tech-stack', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/uses')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    const hook = revalidateCollectionTag('tech-stack', ['/uses'])
    hook(changeArgs({ disableRevalidate: true }))

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('revalidateCollectionTagDelete (afterDelete)', () => {
  it('purges the tag with expire:0 and revalidates every path', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    const hook = revalidateCollectionTagDelete('work-history', ['/'])
    hook(deleteArgs())

    expect(mocks.revalidateTag).toHaveBeenCalledWith('work-history', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    const hook = revalidateCollectionTagDelete('work-history', ['/'])
    hook(deleteArgs({ disableRevalidate: true }))

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
