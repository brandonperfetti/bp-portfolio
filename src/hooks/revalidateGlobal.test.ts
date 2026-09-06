import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * immediate-expiration profile `{ expire: 0 }`, not `'max'`. Under
 * cacheComponents `'max'` is stale-while-revalidate with a one-year stale
 * window, so a regression back to `'max'` (or to no second arg) silently
 * reintroduces the ~10-20 minute stale-admin-edit bug — this test fails
 * loudly instead.
 *
 * The containment block is #156. It is not about caching: Payload runs this
 * `afterChange` inside the operation's transaction, so a purge that throws
 * rolls back the global itself — Navigation, Footer, SiteSettings or Identity,
 * i.e. what the whole site renders from. "Purge threw" must end with the hook
 * returning `doc` and an `error` log naming the target and the reason, the same
 * matrix `revalidatePost.test.ts` and `revalidateRedirects.test.ts` pin.
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
const logger = () => ({ error: vi.fn(), info: vi.fn() })

const runWithLog = (context: Record<string, unknown> = {}) => {
  const log = logger()
  const returned = revalidateGlobal('site-settings')({
    doc: { id: '1' },
    req: { payload: { logger: log }, context },
  } as never)
  return { log, returned }
}

const run = (context: Record<string, unknown> = {}) =>
  runWithLog(context).returned

describe('revalidateGlobal', () => {
  // `mockReset`, not `mockClear`: the containment cases install a throwing
  // implementation that must not leak into the next test.
  beforeEach(() => {
    mocks.revalidateTag.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('purges the global tag with the immediate-expiration expire:0 profile', () => {
    run()

    expect(mocks.revalidateTag).toHaveBeenCalledWith('global_site-settings', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    const { log } = runWithLog({ disableRevalidate: true })

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    // An opt-out, not a failure.
    expect(log.error).not.toHaveBeenCalled()
  })

  it('contains a purge throw so the global write is never rolled back', () => {
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })

    expect(() => runWithLog()).not.toThrow()
    const { log, returned } = runWithLog()

    expect(returned).toEqual({ id: '1' })
    const [payload, message] = log.error.mock.calls[0]
    expect(message).toContain('global_site-settings')
    expect((payload.err as Error).message).toContain(
      'static generation store missing',
    )
  })

  it('contains a throw from the layout path purge too', () => {
    // Tag and path are one contained group, so the second half is covered by
    // the same wrap — a scope-wide failure hits both identically.
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })

    const { log, returned } = runWithLog()

    expect(returned).toEqual({ id: '1' })
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})
