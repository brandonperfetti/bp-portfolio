import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * immediate-expiration profile `{ expire: 0 }`, not `'max'`, in BOTH the
 * afterChange and afterDelete hooks this module builds. Under
 * cacheComponents `'max'` is stale-while-revalidate with a one-year stale
 * window, so a regression back to `'max'` (or to no second arg) silently
 * reintroduces the ~10-20 minute stale-admin-edit bug — this test fails
 * loudly instead.
 *
 * The containment blocks are #156, and they are not about caching at all: both
 * hooks are collection hooks that Payload runs INSIDE the operation's
 * transaction, so a purge that throws rolls back the Categories or WorkHistory
 * row that was just written (or resurrects the one just deleted). "Purge threw"
 * and "purge skipped" must therefore both end with the hook returning `doc`,
 * and a throw must be logged at `error` naming the target and the reason —
 * matching the matrix `revalidatePost.test.ts` / `revalidateRedirects.test.ts`
 * already pin for the hooks that shared this containment first.
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

const logger = () => ({ error: vi.fn(), info: vi.fn() })

const hookArgs = (context: Record<string, unknown> = {}) => {
  const log = logger()
  return {
    args: {
      doc: { id: '1' },
      req: { payload: { logger: log }, context },
    } as never,
    log,
  }
}

const changeArgs = (context: Record<string, unknown> = {}) =>
  hookArgs(context).args

const deleteArgs = changeArgs

// `mockReset` and not `mockClear`: the containment cases install a throwing
// implementation, which `mockClear` would leave in place for the next test.
beforeEach(() => {
  mocks.revalidateTag.mockReset()
  mocks.revalidatePath.mockReset()
})

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
    const { args, log } = hookArgs({ disableRevalidate: true })

    const hook = revalidateCollectionTag('tech-stack', ['/uses'])
    hook(args)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    // The skip is an opt-out, not a failure: nothing is logged at `error`.
    expect(log.error).not.toHaveBeenCalled()
  })

  it('contains a purge throw so the collection write is never rolled back', () => {
    // The #135/#156 defect verbatim: outside a Next request scope the purge
    // throws `Invariant: static generation store missing`, and an `afterChange`
    // throw reaches Payload's `killTransaction` — so the row written moments
    // earlier disappears. A stale tag is the acceptable outcome; a lost row is
    // not.
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })
    const { args, log } = hookArgs()

    const hook = revalidateCollectionTag('work-history', ['/'])

    expect(() => hook(args)).not.toThrow()
    expect(hook(args)).toEqual({ id: '1' })

    // The log names both the target that went stale and the reason, so the
    // operator can tell a missed purge from a lost write.
    const [payload, message] = log.error.mock.calls[0]
    expect(message).toContain('work-history')
    expect(message).toContain('/')
    expect((payload.err as Error).message).toContain(
      'static generation store missing',
    )
  })

  it('contains a throw from the PATH half of the purge too', () => {
    // The tag and the paths are one contained group, so a failure in the
    // second half must be caught by the same wrap rather than escape it.
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })
    const { args, log } = hookArgs()

    const hook = revalidateCollectionTag('projects', ['/projects'])

    expect(() => hook(args)).not.toThrow()
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})

describe('revalidateCollectionTagDelete (afterDelete)', () => {
  it('purges the tag with expire:0 and revalidates every path', () => {
    const hook = revalidateCollectionTagDelete('work-history', ['/'])
    hook(deleteArgs())

    expect(mocks.revalidateTag).toHaveBeenCalledWith('work-history', {
      expire: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
  })

  it('skips revalidation entirely when disableRevalidate is set', () => {
    const hook = revalidateCollectionTagDelete('work-history', ['/'])
    hook(deleteArgs({ disableRevalidate: true }))

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('contains a purge throw so the deleted row is never resurrected', () => {
    // `afterDelete` runs in the same transaction, so the consequence of an
    // escaping throw is the mirror image of the afterChange case: the document
    // the caller asked to delete comes back.
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })
    const { args, log } = hookArgs()

    const hook = revalidateCollectionTagDelete('work-history', ['/'])

    expect(() => hook(args)).not.toThrow()
    expect(hook(args)).toEqual({ id: '1' })
    expect(log.error.mock.calls[0][1]).toContain('work-history')
  })
})
