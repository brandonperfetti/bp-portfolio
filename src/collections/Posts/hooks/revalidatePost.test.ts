import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/** A logger with both levels the hook uses, so the #156 wrap can be observed. */
const makeLogger = () => ({ error: vi.fn(), info: vi.fn() })

let logger = makeLogger()

const changeArgs = (
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown>,
  context: Record<string, unknown> = {},
) =>
  ({
    doc,
    previousDoc,
    req: { payload: { logger }, context },
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
      req: { context: {}, payload: { logger } },
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
      req: { context: { disableRevalidate: true }, payload: { logger } },
    } as never)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

/**
 * Revalidation containment (#156).
 *
 * `afterChange`/`afterDelete` run inside the operation's transaction
 * (`payload/dist/collections/operations/utilities/update.js:330-341`), so a
 * `revalidatePath` throw does not merely lose a cache purge — it rolls the
 * article back. `revalidatePath`/`revalidateTag` throw
 * `Invariant: static generation store missing` outside a Next request scope,
 * which is every Local-API publish that does not set `disableRevalidate`
 * (`scripts/migrate-notion-to-payload.ts` is the one in this repo).
 *
 * What these pin: the hook returns normally, the failure is logged at `error`
 * with the path in the message, and the `disableRevalidate` fast path still
 * attempts nothing at all.
 */
describe('revalidatePost · revalidation never fails the write (#156)', () => {
  beforeEach(() => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()
    mocks.revalidatePath.mockReset()
    mocks.revalidateTag.mockReset()
    logger = makeLogger()
  })

  // Restore the plain spies so the blocks that follow are not left with a
  // throwing `revalidatePath` installed.
  afterEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.revalidateTag.mockReset()
  })

  const boom = () => {
    throw new Error('Invariant: static generation store missing')
  }

  it('does not propagate a revalidatePath throw on publish', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidatePost(
        changeArgs(
          { slug: 'hello', _status: 'published' },
          { _status: 'draft' },
        ),
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not propagate a revalidatePath throw on unpublish', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidatePost(
        changeArgs(
          { slug: 'hello', _status: 'draft' },
          { slug: 'hello', _status: 'published' },
        ),
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not propagate a revalidateTag throw', () => {
    mocks.revalidateTag.mockImplementation(boom)

    expect(() =>
      revalidatePost(
        changeArgs(
          { slug: 'hello', _status: 'published' },
          { _status: 'draft' },
        ),
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('logs the failing path and the reason', () => {
    mocks.revalidatePath.mockImplementation(boom)

    revalidatePost(
      changeArgs({ slug: 'hello', _status: 'published' }, { _status: 'draft' }),
    )

    const [meta, message] = logger.error.mock.calls[0] as [
      { err: Error },
      string,
    ]
    expect(message).toContain('/articles/hello')
    expect(meta.err.message).toContain('static generation store missing')
  })

  it('still lands the write when revalidateDelete throws', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidateDelete({
        doc: { slug: 'hello' },
        req: { context: {}, payload: { logger } },
      } as never),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('leaves the disableRevalidate fast path untouched — nothing is attempted', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidatePost(
        changeArgs(
          { slug: 'hello', _status: 'published' },
          { _status: 'draft' },
          { disableRevalidate: true },
        ),
      ),
    ).not.toThrow()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

/**
 * Placement moves (#153): placing or un-placing an article changes its URL
 * without changing its slug, so `createSlugRedirect` never fires and no
 * redirect row exists to own the vacated path. This hook therefore purges it —
 * narrowly, on the slug-unchanged condition, so the #132 rename split above is
 * untouched.
 */
describe('revalidatePost · placement moves (#153)', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear()
  })

  const run = ({
    doc,
    previousDoc,
  }: {
    doc: Record<string, unknown>
    previousDoc: Record<string, unknown>
  }) => {
    revalidatePost(changeArgs(doc, previousDoc))
    return { paths: mocks.revalidatePath.mock.calls.map(([p]) => p) }
  }

  it('purges both the new placed path and the path the article vacated', () => {
    const { paths } = run({
      doc: { _status: 'published', slug: 'a', path: 'work/a' },
      previousDoc: { _status: 'published', slug: 'a', path: null },
    })
    expect(paths).toContain('/work/a')
    expect(paths).toContain('/articles/a')
  })

  it('purges the archive path an un-placed article returns to, and the section path it left', () => {
    const { paths } = run({
      doc: { _status: 'published', slug: 'a', path: null },
      previousDoc: { _status: 'published', slug: 'a', path: 'work/a' },
    })
    expect(paths).toContain('/articles/a')
    expect(paths).toContain('/work/a')
  })

  it('leaves the #132 rename split alone — a slug rename still purges only the NEW path here', () => {
    const { paths } = run({
      doc: { _status: 'published', slug: 'b', path: null },
      previousDoc: { _status: 'published', slug: 'a', path: null },
    })
    expect(paths).toContain('/articles/b')
    expect(paths).not.toContain('/articles/a')
  })

  it('purges a placed article at its section path, never at /articles', () => {
    const { paths } = run({
      doc: { _status: 'published', slug: 'a', path: 'work/a' },
      previousDoc: { _status: 'published', slug: 'a', path: 'work/a' },
    })
    expect(paths).toContain('/work/a')
    expect(paths).not.toContain('/articles/a')
  })

  it('unpublishing a placed article purges its section path', () => {
    const { paths } = run({
      doc: { _status: 'draft', slug: 'a', path: 'work/a' },
      previousDoc: { _status: 'published', slug: 'a', path: 'work/a' },
    })
    expect(paths).toContain('/work/a')
  })
})
