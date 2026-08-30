import { describe, expect, it, vi } from 'vitest'

import {
  capturePublishedSlug,
  readPreviousPublishedSlug,
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
const makeReq = (publishedSlug: null | string) => {
  const req: { context: Record<string, unknown>; payload: { find: unknown } } =
    {
      context: {},
      payload: { find: null },
    }
  const find = vi.fn(async () => {
    req.context = { ...req.context }
    return { docs: publishedSlug === null ? [] : [{ slug: publishedSlug }] }
  })
  req.payload.find = find
  return { find, req: req as never, rawReq: req }
}

const run = (
  args: Record<string, unknown>,
  publishedSlug: null | string = null,
) => {
  const { find, req, rawReq } = makeReq(publishedSlug)
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

  it('does not query on an explicit draft save (the autosave path)', async () => {
    const { find, liveContext, result } = run({
      data: { _status: 'draft', slug: 'typing' },
      originalDoc: { id: 55, _status: 'draft', slug: 'typin' },
    })

    await result
    expect(find).not.toHaveBeenCalled()
    expect(
      readPreviousPublishedSlug(liveContext(), 'posts', 55),
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
