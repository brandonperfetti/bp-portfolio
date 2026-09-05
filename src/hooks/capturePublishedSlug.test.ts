import { describe, expect, it, vi } from 'vitest'

import {
  capturePublishedSlug,
  readPreviousPublishedPath,
  readPreviousPublishedSlug,
  readPreviousPublishedStoredPath,
} from '@/hooks/capturePublishedSlug'

/**
 * Capturing the pre-write published slug (#120, addendum 1).
 *
 * The whole point is that `previousDoc`/`originalDoc` are the LATEST version —
 * the autosaved draft — and therefore already carry the new slug at publish
 * time. This hook reads the main table row instead, which a draft save never
 * touches.
 */

/**
 * A `req` whose `payload.find` reproduces Payload's real context swap.
 *
 * @remarks This is the fidelity that was missing and let a broken hook go green
 * twice. Every nested Local API call runs `createLocalReq`, which does
 * `req.context = getRequestContext(req, context)`
 * (`payload/dist/utilities/createLocalReq.js:86`), and `getRequestContext`
 * returns a NEW shallow-spread object. So after any `payload.find({ req })` the
 * hook's `context` argument points at a detached object and only `req.context`
 * is live. A plain `vi.fn()` never swaps, so it could not catch the bug — this
 * one does.
 */
const makeReq = (
  publishedSlug: null | string,
  { path, query }: { path?: string; query?: Record<string, unknown> } = {},
) => {
  const req: {
    context: Record<string, unknown>
    payload: { find: unknown }
    query: Record<string, unknown>
  } = {
    context: {},
    payload: { find: null },
    query: query ?? {},
  }
  const find = vi.fn(async () => {
    req.context = { ...req.context }
    return {
      docs: publishedSlug === null ? [] : [{ path, slug: publishedSlug }],
    }
  })
  req.payload.find = find
  return { find, req: req as never, rawReq: req }
}

const run = (
  args: Record<string, unknown>,
  publishedSlug: null | string = null,
  reqOptions: { path?: string; query?: Record<string, unknown> } = {},
) => {
  const { find, req, rawReq } = makeReq(publishedSlug, reqOptions)
  // Payload hands the hook `req.context` as its `context` argument; the swap
  // above is what later detaches the two.
  const context = rawReq.context
  const result = capturePublishedSlug({
    collection: { slug: 'posts' },
    context,
    operation: 'update',
    req,
    ...args,
  } as never)
  /** The live context after the operation — what afterChange will receive. */
  const liveContext = () => rawReq.context as never
  return { context, find, liveContext, result }
}

describe('capturePublishedSlug', () => {
  it('captures the published slug when the draft carries a different one', async () => {
    // The admin rename: autosave already wrote a draft at the NEW slug.
    const { context, find, liveContext, result } = run(
      {
        data: { _status: 'published', slug: 'new-slug' },
        originalDoc: { id: 55, _status: 'draft', slug: 'new-slug' },
      },
      'old-slug',
    )

    await result
    expect(find).toHaveBeenCalledTimes(1)
    // Read through the LIVE req.context, which is what afterChange receives.
    // The detached `context` argument no longer carries it — asserting on that
    // object is exactly the mistake the mocked suite used to make.
    expect(readPreviousPublishedSlug(liveContext(), 'posts', 55)).toBe(
      'old-slug',
    )
    expect(context).not.toBe(liveContext())
  })

  it('uses originalDoc directly when it is already the published row', async () => {
    const { find, liveContext, result } = run({
      data: { _status: 'published', slug: 'new-slug' },
      originalDoc: { id: 55, _status: 'published', slug: 'old-slug' },
    })

    await result
    // One-shot publish with no intervening draft costs no query.
    expect(find).not.toHaveBeenCalled()
    expect(readPreviousPublishedSlug(liveContext(), 'posts', 55)).toBe(
      'old-slug',
    )
  })

  it('captures nothing on a first publish (no published row exists)', async () => {
    const { liveContext, result } = run(
      {
        data: { _status: 'published', slug: 'hello' },
        originalDoc: { id: 56, _status: 'draft', slug: 'hello' },
      },
      null,
    )

    await result
    expect(
      readPreviousPublishedSlug(liveContext(), 'posts', 56),
    ).toBeUndefined()
  })

  it('does not query on an autosave draft save — the #155 call-count pin', async () => {
    // THE acceptance criterion for #155: the 100ms admin autosave must not gain
    // a database read. `[measured, @payloadcms/ui/dist/elements/Autosave/index.js:88-91]`
    // autosave PATCHes `?autosave=true&…&draft=true`, so the discriminator is a
    // `req.query` read and this returns before `payload.find` is reached.
    const { find, liveContext, result } = run(
      {
        data: { _status: 'draft', slug: 'typing' },
        originalDoc: { id: 55, _status: 'draft', slug: 'typin' },
      },
      'live',
      { query: { autosave: 'true', draft: 'true' } },
    )

    await result
    expect(find).toHaveBeenCalledTimes(0)
    expect(
      readPreviousPublishedSlug(liveContext(), 'posts', 55),
    ).toBeUndefined()
    expect(
      readPreviousPublishedPath(liveContext(), 'posts', 55),
    ).toBeUndefined()
  })

  it('captures on a PUBLISH sent with ?draft=true — not a draft save (#155 fix)', async () => {
    // The misclassification the first cut of this hook shipped. `update.js:29`
    // is `Boolean(draftArg && hasDraftsEnabled(...)) && data._status !==
    // 'published' && !publishAllLocales`, so a REST `PATCH ?draft=true` with a
    // `{_status:'published'}` body has `isSavingDraft === false`: Payload
    // WRITES the main table and this is a real publish. Guarding on the query
    // flag alone skipped the capture, so a rename made this way wrote no
    // redirect row and purged no old path.
    const { find, liveContext, result } = run(
      {
        data: { _status: 'published', slug: 'new-slug' },
        originalDoc: { id: 55, _status: 'draft', slug: 'new-slug' },
      },
      'old-slug',
      { query: { autosave: 'true', draft: 'true' } },
    )

    await result
    expect(find).toHaveBeenCalledTimes(1)
    expect(readPreviousPublishedSlug(liveContext(), 'posts', 55)).toBe(
      'old-slug',
    )
    expect(readPreviousPublishedPath(liveContext(), 'posts', 55)).toBe(
      '/articles/old-slug',
    )
  })

  it('does not query on an explicit "Save draft" either (draft=true, no autosave)', async () => {
    // `[measured, elements/PublishButton/index.js:94-96 and
    // elements/SaveDraftButton/index.js:49]` both send `draft=true`.
    const { find, result } = run(
      {
        data: { _status: 'draft', slug: 'typing' },
        originalDoc: { id: 55, _status: 'draft', slug: 'typin' },
      },
      'live',
      { query: { draft: 'true' } },
    )

    await result
    expect(find).toHaveBeenCalledTimes(0)
  })

  it('captures the served path on an UNPUBLISH after an autosaved rename (#155)', async () => {
    // The transition the hook used to swallow. `[measured, 2026-09-04,
    // elements/UnpublishButton/index.js:78-105]` unpublish PATCHes with NO
    // `draft` param and a `{ _status: 'draft' }` body — the same body an
    // autosave sends, which is why the old `data._status === 'draft'` guard
    // could not tell them apart. `originalDoc` is the autosaved draft carrying
    // the NEW slug, so the served slug comes from the main-table lookup.
    const { find, liveContext, result } = run(
      {
        data: { _status: 'draft' },
        originalDoc: { id: 55, _status: 'draft', slug: 'new-slug' },
      },
      'old-slug',
      { query: { depth: '0', 'fallback-locale': 'null' } },
    )

    await result
    expect(find).toHaveBeenCalledTimes(1)
    expect(readPreviousPublishedSlug(liveContext(), 'posts', 55)).toBe(
      'old-slug',
    )
    expect(readPreviousPublishedPath(liveContext(), 'posts', 55)).toBe(
      '/articles/old-slug',
    )
  })

  it('stashes the PLACED path, which a slug alone could not name (#148)', async () => {
    const { liveContext, result } = run(
      {
        data: { _status: 'draft' },
        originalDoc: { id: 55, _status: 'draft', slug: 'new-slug' },
      },
      'old-slug',
      { path: 'work/old-slug' },
    )

    await result
    expect(readPreviousPublishedPath(liveContext(), 'posts', 55)).toBe(
      '/work/old-slug',
    )
  })

  /**
   * The third stash (#150). The subtree cascade matches descendants' own
   * `path` COLUMNS by prefix, so it needs the storage key — not the public
   * form, which carries a leading slash and spells the root as `/`.
   */
  it('stashes the raw stored path column alongside the public one', async () => {
    const { liveContext, result } = run(
      {
        collection: { slug: 'pages' },
        data: { _status: 'published', slug: 'brytecore' },
        originalDoc: { id: 7, _status: 'draft', slug: 'brytecore' },
      },
      'brytecore',
      { path: 'work/brytecore' },
    )

    await result
    expect(readPreviousPublishedStoredPath(liveContext(), 'pages', 7)).toBe(
      'work/brytecore',
    )
    expect(readPreviousPublishedPath(liveContext(), 'pages', 7)).toBe(
      '/work/brytecore',
    )
  })

  it('stashes no stored path for an unplaced post, whose path column is NULL', async () => {
    const { liveContext, result } = run(
      {
        data: { _status: 'published', slug: 'new-slug' },
        originalDoc: { id: 55, _status: 'draft', slug: 'new-slug' },
      },
      'old-slug',
    )

    await result
    expect(
      readPreviousPublishedStoredPath(liveContext(), 'posts', 55),
    ).toBeUndefined()
    expect(readPreviousPublishedPath(liveContext(), 'posts', 55)).toBe(
      '/articles/old-slug',
    )
  })

  it('stashes / for the root page rather than /home', async () => {
    const { liveContext, result } = run(
      {
        collection: { slug: 'pages' },
        data: { _status: 'draft' },
        originalDoc: { id: 2, _status: 'draft', slug: 'renamed' },
      },
      'home',
    )

    await result
    expect(readPreviousPublishedPath(liveContext(), 'pages', 2)).toBe('/')
  })

  it('costs no query on an unpublish whose originalDoc IS the published row', async () => {
    // No pending draft: `originalDoc` is the main-table row, so both stashes
    // come from it directly.
    const { find, liveContext, result } = run({
      data: { _status: 'draft' },
      originalDoc: {
        id: 55,
        _status: 'published',
        path: 'work/live',
        slug: 'live',
      },
    })

    await result
    expect(find).not.toHaveBeenCalled()
    expect(readPreviousPublishedPath(liveContext(), 'posts', 55)).toBe(
      '/work/live',
    )
  })

  it('captures nothing on an unpublish of a document that was never published', async () => {
    const { liveContext, result } = run(
      {
        data: { _status: 'draft' },
        originalDoc: { id: 56, _status: 'draft', slug: 'hello' },
      },
      null,
    )

    await result
    expect(
      readPreviousPublishedPath(liveContext(), 'posts', 56),
    ).toBeUndefined()
  })

  it('captures on a Local API publish that omits _status', async () => {
    // `payload.update` without `draft` writes the main row even with no
    // `_status` in the payload, so this must not be mistaken for a draft save.
    const { liveContext, result } = run(
      {
        data: { slug: 'renamed' },
        originalDoc: { id: 55, _status: 'draft', slug: 'renamed' },
      },
      'live',
    )

    await result
    expect(readPreviousPublishedSlug(liveContext(), 'posts', 55)).toBe('live')
  })

  it('ignores collections whose slug is not a public URL', async () => {
    const { find, liveContext, result } = run({
      collection: { slug: 'categories' },
      data: { _status: 'published', slug: 'design-systems' },
      originalDoc: { id: 3, _status: 'published', slug: 'design' },
    })

    await result
    expect(find).not.toHaveBeenCalled()
    expect(
      readPreviousPublishedSlug(liveContext(), 'categories', 3),
    ).toBeUndefined()
  })

  it('ignores create operations', async () => {
    const { find, liveContext, result } = run({
      data: { _status: 'published', slug: 'brand-new' },
      operation: 'create',
      originalDoc: undefined,
    })

    await result
    expect(find).not.toHaveBeenCalled()
    expect(readPreviousPublishedSlug(liveContext(), 'posts', 1)).toBeUndefined()
  })

  it('keys per document so a bulk update cannot cross-contaminate', async () => {
    // One shared req.context runs many docs through payload.update({ where }).
    const { find, rawReq, req } = makeReq(null)

    for (const [id, slug] of [
      [1, 'first-old'],
      [2, 'second-old'],
    ] as Array<[number, string]>) {
      await capturePublishedSlug({
        collection: { slug: 'posts' },
        context: rawReq.context,
        data: { _status: 'published', slug: `${slug}-new` },
        operation: 'update',
        originalDoc: { id, _status: 'published', slug },
        req,
      } as never)
    }

    expect(find).not.toHaveBeenCalled()
    expect(readPreviousPublishedSlug(rawReq.context as never, 'posts', 1)).toBe(
      'first-old',
    )
    expect(readPreviousPublishedSlug(rawReq.context as never, 'posts', 2)).toBe(
      'second-old',
    )
  })
})

describe('readPreviousPublishedSlug', () => {
  it('returns undefined for an empty or malformed context', () => {
    expect(readPreviousPublishedSlug(undefined, 'posts', 1)).toBeUndefined()
    expect(readPreviousPublishedSlug({} as never, 'posts', 1)).toBeUndefined()
    expect(
      readPreviousPublishedSlug(
        { previousPublishedSlugs: 'nope' } as never,
        'posts',
        1,
      ),
    ).toBeUndefined()
  })
})

describe('readPreviousPublishedPath', () => {
  it('returns undefined for an empty or malformed context', () => {
    expect(readPreviousPublishedPath(undefined, 'posts', 1)).toBeUndefined()
    expect(readPreviousPublishedPath({} as never, 'posts', 1)).toBeUndefined()
    expect(
      readPreviousPublishedPath(
        { previousPublishedPaths: 'nope' } as never,
        'posts',
        1,
      ),
    ).toBeUndefined()
    expect(
      readPreviousPublishedPath(
        { previousPublishedPaths: { 'posts:1': '' } } as never,
        'posts',
        1,
      ),
    ).toBeUndefined()
  })

  it('is keyed per collection and document, like the slug stash', () => {
    const context = {
      previousPublishedPaths: { 'pages:1': '/a', 'posts:1': '/articles/a' },
    } as never
    expect(readPreviousPublishedPath(context, 'posts', 1)).toBe('/articles/a')
    expect(readPreviousPublishedPath(context, 'pages', 1)).toBe('/a')
    expect(readPreviousPublishedPath(context, 'posts', 2)).toBeUndefined()
  })
})
