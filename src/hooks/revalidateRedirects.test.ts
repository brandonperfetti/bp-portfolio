import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * immediate-expiration profile `{ expire: 0 }`, not `'max'`. Under
 * cacheComponents `'max'` is stale-while-revalidate with a one-year stale
 * window, so a regression back to `'max'` (or to no second arg) silently
 * reintroduces the ~10-20 minute stale-admin-edit bug — this test fails
 * loudly instead.
 *
 * The tag itself is expressed as `CMS_TAGS.redirects` (#133) so a rename of
 * the vocabulary moves this expectation with the hook instead of freezing
 * yesterday's literal. WHICH tag is the right one to purge — that it is the
 * same one `getCmsRedirects` subscribes to — is pinned in
 * `src/lib/cms/cacheTags.test.ts`, which can see both sides.
 *
 * The `disableRevalidate` and throw-containment blocks below are #135. Both
 * are about the same consequence rather than about caching: this is an
 * `afterChange` hook inside the operation's transaction, so anything that
 * escapes it rolls the redirect row back. "Purge skipped" and "purge threw"
 * must therefore both end with the row intact and the hook returning `doc`.
 */
const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}))

import { CMS_TAGS } from '@/lib/cms/cache'

import { revalidateRedirects } from './revalidateRedirects'

const logger = () => ({ error: vi.fn(), info: vi.fn() })

const changeArgs = (context: Record<string, unknown> = {}) => {
  const log = logger()
  return {
    args: {
      doc: { id: '1' },
      req: { context, payload: { logger: log } },
    } as never,
    log,
  }
}

describe('revalidateRedirects', () => {
  beforeEach(() => {
    mocks.revalidateTag.mockReset()
  })

  it('purges the redirects tag with the immediate-expiration expire:0 profile', () => {
    const { args } = changeArgs()

    revalidateRedirects(args)

    expect(mocks.revalidateTag).toHaveBeenCalledWith(CMS_TAGS.redirects, {
      expire: 0,
    })
  })

  it('skips the purge entirely when context.disableRevalidate is set', () => {
    const { args, log } = changeArgs({ disableRevalidate: true })

    const returned = revalidateRedirects(args)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    // The skip is silent, not an error: it is an opt-out, not a failure.
    expect(log.error).not.toHaveBeenCalled()
    expect(returned).toEqual({ id: '1' })
  })

  it('reads the flag from req.context, which is the object a nested Local API call carries', () => {
    // `createPathRedirect` reaches this hook through
    // `payload.create({ collection: 'redirects', …, req })`, and Payload
    // reassigns `req.context` to a fresh shallow spread on the way in. The
    // caller's flag arrives on `req.context`; the sibling hooks read it from
    // there and so must this one.
    const { args } = changeArgs({ disableRevalidate: true })

    revalidateRedirects(args)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('contains a revalidateTag throw so the redirect row is never rolled back', () => {
    // The #135 defect verbatim: outside a Next request scope `revalidateTag`
    // throws `Invariant: static generation store missing`. An `afterChange`
    // throw reaches Payload's `killTransaction`, so the row written moments
    // earlier disappears — a lost redirect, not a stale cache entry.
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing')
    })
    const { args, log } = changeArgs()

    expect(() => revalidateRedirects(args)).not.toThrow()
    expect(revalidateRedirects(args)).toEqual({ id: '1' })
    expect(log.error).toHaveBeenCalled()
  })
})
