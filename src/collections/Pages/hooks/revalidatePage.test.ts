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

import { revalidateDelete, revalidatePage } from './revalidatePage'

/** A logger with both levels the hook uses, so the #156 wrap can be observed. */
const makeLogger = () => ({ error: vi.fn(), info: vi.fn() })

let logger = makeLogger()

const changeArgs = (
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> | undefined,
  context: Record<string, unknown> = {},
) =>
  ({
    doc,
    previousDoc,
    req: { payload: { logger }, context },
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
 * 100ms interval), and one extra thing to pin that Posts does not have: the
 * root page's `/` mapping.
 *
 * That mapping used to be a hand-built root-slug comparison here while
 * `publicPathForSlug('pages', 'home')` — the function `createSlugRedirect`
 * builds its rows from — yielded `/home`; the two vocabularies genuinely
 * disagreed. #148 closed that by making `publicPathFor` the single owner, and
 * both sides now call it. The matrix below is UNCHANGED — the same five
 * transitions purge the same five paths — which is the proof that routing the
 * hook through the seam moved no behaviour. What is newly pinned is that a
 * PLACED page purges its full nested path, which no `/`+slug template could
 * produce.
 *
 * The #132 ownership split is untouched: whoever writes a redirect row purges
 * that row's `from`; this hook purges the document's own paths.
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

  it('unpublish after an autosaved rename purges the path the site was SERVING (#155)', () => {
    // Was `KNOWN GAP: ... purges nothing`. Identical to the Posts case and
    // measured the same way (2026-09-04, Payload 3.86.0, PostgreSQL 16.13):
    // `previousDoc` is the autosaved draft carrying the NEW slug, so the served
    // path exists only in the stash `capturePublishedSlug` fills from the main
    // table row.
    revalidatePage(
      changeArgs(
        { id: 7, slug: 'b', _status: 'draft' },
        { slug: 'b', _status: 'draft' },
        { previousPublishedPaths: { 'pages:7': '/a' } },
      ),
    )

    expect(purgedPaths()).toEqual(['/a'])
  })

  it('still purges nothing on an autosaved rename with no captured path', () => {
    revalidatePage(
      changeArgs(
        { id: 8, slug: 'b', _status: 'draft' },
        { slug: 'b', _status: 'draft' },
      ),
    )

    expect(purgedPaths()).toEqual([])
  })

  it('purges the captured NESTED path when a placed page is unpublished (#148)', () => {
    revalidatePage(
      changeArgs(
        { id: 9, slug: 'b', path: 'work/b', _status: 'draft' },
        { slug: 'b', path: 'work/b', _status: 'draft' },
        { previousPublishedPaths: { 'pages:9': '/work/brytecore' } },
      ),
    )

    expect(purgedPaths()).toEqual(['/work/brytecore'])
  })

  it('purges / when the ROOT page is unpublished after an autosaved rename', () => {
    // The stash resolves through `publicPathFor`, so the root arrives as `/`
    // and not as `/home` — the vocabulary #148 unified.
    revalidatePage(
      changeArgs(
        { id: 10, slug: 'renamed', _status: 'draft' },
        { slug: 'renamed', _status: 'draft' },
        { previousPublishedPaths: { 'pages:10': '/' } },
      ),
    )

    expect(purgedPaths()).toEqual(['/'])
  })

  it('leaves the publish branch alone when a path was captured', () => {
    revalidatePage(
      changeArgs(
        { id: 11, slug: 'b', _status: 'published' },
        { slug: 'b', _status: 'draft' },
        { previousPublishedPaths: { 'pages:11': '/a' } },
      ),
    )

    expect(purgedPaths()).toEqual(['/b'])
  })

  it('maps the home page to / on both the current- and old-path branches', () => {
    // The root contract, stated as a test. Both this hook and
    // `publicPathForSlug` now answer `/`, so a purge issued here uncovers the
    // row `createSlugRedirect` wrote — which is what the disagreement used to
    // prevent (#132 → #148).
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

  it('purges a PLACED page at its full nested path (#148)', () => {
    revalidatePage(
      changeArgs(
        { slug: 'brytecore', path: 'work/brytecore', _status: 'published' },
        { _status: 'draft' },
      ),
    )

    expect(purgedPaths()).toEqual(['/work/brytecore'])
  })

  it('purges the OLD nested path on unpublish', () => {
    revalidatePage(
      changeArgs(
        { slug: 'brytecore', path: 'work/brytecore', _status: 'draft' },
        { slug: 'brytecore', path: 'work/brytecore', _status: 'published' },
      ),
    )

    expect(purgedPaths()).toEqual(['/work/brytecore'])
  })

  it('purges nothing rather than "/undefined" when a doc carries no slug or path', () => {
    revalidatePage(changeArgs({ _status: 'published' }, { _status: 'draft' }))

    expect(purgedPaths()).toEqual([])
  })
})

describe('revalidateDelete (afterDelete)', () => {
  it('purges pages/pages-sitemap with the immediate-expiration expire:0 profile', () => {
    mocks.revalidateTag.mockClear()
    mocks.revalidatePath.mockClear()

    revalidateDelete({
      doc: { slug: 'about' },
      req: { context: {}, payload: { logger } },
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
      req: { context: { disableRevalidate: true }, payload: { logger } },
    } as never)

    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

/**
 * Revalidation containment (#156) — the Pages half of the block in
 * `src/collections/Posts/hooks/revalidatePost.test.ts`.
 *
 * `afterChange`/`afterDelete` run inside the operation's transaction
 * (`payload/dist/collections/operations/utilities/update.js:330-341`), so a
 * `revalidatePath` throw outside a Next request scope rolls the PAGE back, not
 * just the purge. What these pin: the hook returns normally, the failure is
 * logged at `error` naming the path, and the `disableRevalidate` fast path
 * still attempts nothing.
 */
describe('revalidatePage · revalidation never fails the write (#156)', () => {
  beforeEach(() => {
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
      revalidatePage(
        changeArgs(
          { slug: 'about', _status: 'published' },
          { _status: 'draft' },
        ),
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not propagate a revalidatePath throw on unpublish', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidatePage(
        changeArgs(
          { slug: 'about', _status: 'draft' },
          { slug: 'about', _status: 'published' },
        ),
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not propagate a revalidateTag throw', () => {
    mocks.revalidateTag.mockImplementation(boom)

    expect(() =>
      revalidatePage(
        changeArgs(
          { slug: 'about', _status: 'published' },
          { _status: 'draft' },
        ),
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('logs the failing path and the reason', () => {
    mocks.revalidatePath.mockImplementation(boom)

    revalidatePage(
      changeArgs({ slug: 'about', _status: 'published' }, { _status: 'draft' }),
    )

    const [meta, message] = logger.error.mock.calls[0] as [
      { err: Error },
      string,
    ]
    expect(message).toContain('/about')
    expect(meta.err.message).toContain('static generation store missing')
  })

  it('still lands the write when revalidateDelete throws', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidateDelete({
        doc: { slug: 'about' },
        req: { context: {}, payload: { logger } },
      } as never),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalled()
  })

  it('leaves the disableRevalidate fast path untouched — nothing is attempted', () => {
    mocks.revalidatePath.mockImplementation(boom)

    expect(() =>
      revalidatePage(
        changeArgs(
          { slug: 'about', _status: 'published' },
          { _status: 'draft' },
          { disableRevalidate: true },
        ),
      ),
    ).not.toThrow()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})
