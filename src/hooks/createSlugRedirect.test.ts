import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createSlugRedirect } from '@/hooks/createSlugRedirect'

/**
 * Auto-redirect on a deliberate published rename (#120).
 *
 * The freeze hook makes a rename deliberate; this hook makes it safe. These
 * tests pin exactly when a row is written — and, just as important, when one is
 * NOT (drafts, first publish, self-redirect, non-slug-routed collections).
 */

type FindResult = { docs: Array<{ id: number }> }

const makeReq = (existing: FindResult = { docs: [] }) => {
  const find = vi.fn(async () => existing)
  const create = vi.fn(async () => ({ id: 1 }))
  const update = vi.fn(async () => ({ id: 1 }))
  const logger = { error: vi.fn(), info: vi.fn() }
  return {
    create,
    find,
    logger,
    req: { payload: { create, find, logger, update } } as never,
    update,
  }
}

const call = (
  args: Record<string, unknown>,
  existing: FindResult = { docs: [] },
) => {
  const harness = makeReq(existing)
  return {
    ...harness,
    result: createSlugRedirect({
      collection: { slug: 'posts' },
      context: {},
      operation: 'update',
      req: harness.req,
      ...args,
    } as never),
  }
}

const published = (slug: string, id = 55) => ({
  id,
  _status: 'published',
  slug,
})

describe('createSlugRedirect', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear()
  })

  it('creates one redirect from the old article path to the document', async () => {
    const { result, create, update } = call({
      doc: published('new-slug'),
      previousDoc: published('old-slug'),
    })

    await result
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        data: {
          from: '/articles/old-slug',
          to: {
            type: 'reference',
            reference: { relationTo: 'posts', value: 55 },
          },
        },
      }),
    )
  })

  it('purges the old path so it stops serving its prerendered shell', async () => {
    // revalidatePost only purges the old path on UNPUBLISH, so without this the
    // renamed article's old URL would never reach the redirect branch.
    const { result } = call({
      doc: published('new-slug'),
      previousDoc: published('old-slug'),
    })

    await result
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/articles/old-slug')
  })

  it('updates the existing row instead of stacking a second one', async () => {
    const { result, create, update } = call(
      { doc: published('c'), previousDoc: published('b') },
      { docs: [{ id: 9 }] },
    )

    await result
    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        id: 9,
        data: expect.objectContaining({ from: '/articles/b' }),
      }),
    )
  })

  it('uses the bare path for pages', async () => {
    const { result, create } = call({
      collection: { slug: 'pages' },
      doc: published('now', 7),
      previousDoc: published('before', 7),
    })

    await result
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          from: '/before',
          to: {
            type: 'reference',
            reference: { relationTo: 'pages', value: 7 },
          },
        },
      }),
    )
  })

  it('writes nothing on a first publish', async () => {
    const { result, create, update } = call({
      doc: published('hello'),
      previousDoc: { id: 55, _status: 'draft', slug: 'draft-title' },
    })

    await result
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('writes nothing for a draft save', async () => {
    const { result, create } = call({
      doc: { id: 55, _status: 'draft', slug: 'new' },
      previousDoc: published('old'),
    })

    await result
    expect(create).not.toHaveBeenCalled()
  })

  it('writes nothing when the slug did not change', async () => {
    const { result, create, find } = call({
      doc: published('same'),
      previousDoc: published('same'),
    })

    await result
    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('writes nothing on create', async () => {
    const { result, create } = call({
      doc: published('brand-new'),
      operation: 'create',
      previousDoc: undefined,
    })

    await result
    expect(create).not.toHaveBeenCalled()
  })

  it('ignores collections whose slug is not a public URL', async () => {
    const { result, create } = call({
      collection: { slug: 'categories' },
      doc: published('design-systems', 3),
      previousDoc: published('design', 3),
    })

    await result
    expect(create).not.toHaveBeenCalled()
  })

  it('never fails the editor’s publish when the redirect write throws', async () => {
    const harness = makeReq()
    harness.find.mockRejectedValueOnce(new Error('db down') as never)
    const doc = published('new')

    await expect(
      createSlugRedirect({
        collection: { slug: 'posts' },
        context: {},
        doc,
        operation: 'update',
        previousDoc: published('old'),
        req: harness.req,
      } as never),
    ).resolves.toBe(doc)
    expect(harness.logger.error).toHaveBeenCalled()
  })

  it('honours context.disableRevalidate for the path purge only', async () => {
    const { result, create } = call({
      context: { disableRevalidate: true },
      doc: published('new'),
      previousDoc: published('old'),
    })

    await result
    expect(create).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
