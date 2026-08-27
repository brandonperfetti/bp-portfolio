import { describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * read-your-writes profile `{ expire: 0 }`, not `'max'`. Under
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

import { revalidateGlobal } from './revalidateGlobal'

// Minimal afterChange-hook argument: only `doc` and `req.{payload,context}`
// are read.
const run = (context: Record<string, unknown> = {}) =>
  revalidateGlobal('site-settings')({
    doc: { id: '1' },
    req: {
      payload: { logger: { info: vi.fn() } },
      context,
    },
  } as never)

describe('revalidateGlobal', () => {
  it('purges the global tag with the read-your-writes expire:0 profile', () => {
    run()

    expect(mocks.revalidateTag).toHaveBeenCalledWith('global_site-settings', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    run({ disableRevalidate: true })

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
