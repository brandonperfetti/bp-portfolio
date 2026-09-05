import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { capturePublishedSlug } from '@/hooks/capturePublishedSlug'
import { createPathRedirect } from '@/hooks/createPathRedirect'

/**
 * Auto-redirect on a deliberate published move (#120, generalised to paths by
 * #150).
 *
 * The freeze hook makes a rename deliberate; this hook makes it safe. These
 * tests pin exactly when a row is written — and, just as important, when one is
 * NOT (drafts, first publish, self-redirect, non-slug-routed collections).
 *
 * They drive the hook through the SAME `req.context` that `capturePublishedSlug`
 * populates rather than hand-feeding a `previousDoc`, because the whole defect
 * this file guards against (addendum 1) was that `previousDoc` is the autosaved
 * draft, not the published document.
 *
 * **The #120 assertions below are deliberately unchanged, byte for byte.** They
 * are AC1 of #150 — a top-level page and an unplaced post must still produce
 * exactly the rows they produced before paths existed — and they caught a
 * deletion in an earlier batch. The path-aware cases are additions beneath them,
 * never edits to them.
 */

type FindResult = { docs: Array<{ id: number }> }

/**
 * Harness whose nested Local API calls swap `req.context` the way Payload's
 * `createLocalReq` does (`req.context = getRequestContext(req, context)`, a new
 * shallow-spread object). Without that swap this suite cannot see the addendum-2
 * defect at all — a plain `vi.fn()` kept the hook's `context` argument live and
 * a broken implementation passed.
 */
const makeHarness = (existing: FindResult = { docs: [] }) => {
  const findRedirects = vi.fn(async () => existing)
  const create = vi.fn(async () => ({ id: 1 }))
  const update = vi.fn(async () => ({ id: 1 }))
  const logger = { error: vi.fn(), info: vi.fn() }
  const req: {
    context: Record<string, unknown>
    payload: Record<string, unknown>
  } = { context: {}, payload: { create, logger, update } }

  return {
    create,
    findRedirects,
    logger,
    rawReq: req,
    update,
    /** `payload.find` routed by collection: redirects vs the published-row probe. */
    makeReq: (publishedSlug: null | string, publishedPath?: string) => {
      req.payload.find = vi.fn(
        async ({ collection }: { collection: string }) => {
          req.context = { ...req.context }
          return collection === 'redirects'
            ? await findRedirects()
            : {
                docs:
                  publishedSlug === null
                    ? []
                    : [{ path: publishedPath, slug: publishedSlug }],
              }
        },
      )
      return req as never
    },
  }
}

/**
 * Run the real publish sequence: `capturePublishedSlug` (beforeChange) then
 * `createPathRedirect` (afterChange), sharing one `req.context`.
 */
const publish = async ({
  collectionSlug = 'posts',
  context = {} as Record<string, unknown>,
  data,
  doc,
  existing = { docs: [] } as FindResult,
  originalDoc,
  publishedPath,
  publishedSlug,
}: {
  collectionSlug?: string
  context?: Record<string, unknown>
  data: Record<string, unknown>
  doc: Record<string, unknown>
  existing?: FindResult
  originalDoc: Record<string, unknown> | undefined
  /** The published row's stored `path` column, when the document was placed. */
  publishedPath?: string
  publishedSlug: null | string
}) => {
  const harness = makeHarness(existing)
  const req = harness.makeReq(publishedSlug, publishedPath)
  Object.assign(harness.rawReq.context, context)
  const collection = { slug: collectionSlug }

  // Each hook receives `req.context` AS IT IS AT CALL TIME, exactly as Payload
  // passes it — so the swap performed by a nested find detaches the first
  // hook's argument, which is the whole point.
  await capturePublishedSlug({
    collection,
    context: harness.rawReq.context,
    data,
    operation: 'update',
    originalDoc,
    req,
  } as never)

  await createPathRedirect({
    collection,
    context: harness.rawReq.context,
    doc,
    operation: 'update',
    req,
  } as never)

  return harness
}

describe('createPathRedirect', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear()
  })

  /**
   * THE regression (addendum 1). Both Posts and Pages run
   * `autosave.interval: 100`, so by the time the editor clicks Publish the
   * autosaved draft already holds the NEW slug and reports `_status: 'draft'`.
   * A hook reading `previousDoc` sees `from === to` (or bails on the status
   * guard) and writes nothing. This is red against that implementation.
   */
  it('creates the redirect on the admin rename path, after an autosave', async () => {
    const { create, update } = await publish({
      data: { _status: 'published', slug: 'new-slug', slugLock: false },
      doc: { id: 55, _status: 'published', slug: 'new-slug' },
      // What Payload actually hands the hooks: the autosaved draft.
      originalDoc: { id: 55, _status: 'draft', slug: 'new-slug' },
      publishedSlug: 'old-slug',
    })

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
          // #130: a rename is permanent by definition, and the hook says so
          // explicitly rather than leaning on the field's `defaultValue` —
          // an `update` of an existing row does not re-apply a default.
          type: '301',
        },
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/articles/old-slug')
  })

  it('still works for a one-shot REST/MCP publish with no intervening draft', async () => {
    const { create } = await publish({
      data: { _status: 'published', slug: 'new-slug', slugLock: false },
      doc: { id: 55, _status: 'published', slug: 'new-slug' },
      originalDoc: { id: 55, _status: 'published', slug: 'old-slug' },
      publishedSlug: 'old-slug',
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ from: '/articles/old-slug' }),
      }),
    )
  })

  it('writes nothing on a first publish — no published row exists', async () => {
    // Asserted on the ABSENCE OF A PUBLISHED ROW, not on previousDoc._status:
    // a first publish and a renamed autosaved draft are indistinguishable
    // through previousDoc.
    const { create, update } = await publish({
      data: { _status: 'published', slug: 'hello' },
      doc: { id: 56, _status: 'published', slug: 'hello' },
      originalDoc: { id: 56, _status: 'draft', slug: 'hello' },
      publishedSlug: null,
    })

    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('writes nothing for a draft save, and does not probe for a published row', async () => {
    const harness = await publish({
      data: { _status: 'draft', slug: 'renamed-in-draft' },
      doc: { id: 55, _status: 'draft', slug: 'renamed-in-draft' },
      originalDoc: { id: 55, _status: 'draft', slug: 'renamed-in-draf' },
      publishedSlug: 'live',
    })

    expect(harness.create).not.toHaveBeenCalled()
    expect(harness.findRedirects).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('writes nothing when the slug did not change', async () => {
    const { create, findRedirects } = await publish({
      data: { _status: 'published', slug: 'same' },
      doc: { id: 55, _status: 'published', slug: 'same' },
      originalDoc: { id: 55, _status: 'published', slug: 'same' },
      publishedSlug: 'same',
    })

    expect(findRedirects).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('updates the existing row instead of stacking a second one', async () => {
    const { create, update } = await publish({
      data: { _status: 'published', slug: 'c' },
      doc: { id: 55, _status: 'published', slug: 'c' },
      existing: { docs: [{ id: 9 }] },
      originalDoc: { id: 55, _status: 'draft', slug: 'c' },
      publishedSlug: 'b',
    })

    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        id: 9,
        data: expect.objectContaining({ from: '/articles/b', type: '301' }),
      }),
    )
  })

  it('uses the bare path for pages', async () => {
    const { create } = await publish({
      collectionSlug: 'pages',
      data: { _status: 'published', slug: 'now' },
      doc: { id: 7, _status: 'published', slug: 'now' },
      originalDoc: { id: 7, _status: 'draft', slug: 'now' },
      publishedSlug: 'before',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          from: '/before',
          to: {
            type: 'reference',
            reference: { relationTo: 'pages', value: 7 },
          },
          type: '301',
        },
      }),
    )
  })

  /**
   * THE #150 regression, from the measured residue on issue #150
   * (comment 5530738984): a post placed at `work2/dup` renamed to `dup2` used
   * to write `from: /articles/…-dup`, leaving `/work2/…-dup` a hard 404.
   */
  it('keys the row on the placed path for a placed post, not on /articles', async () => {
    const { create } = await publish({
      data: { _status: 'published', slug: 'dup2' },
      doc: { id: 5, _status: 'published', path: 'work2/dup2', slug: 'dup2' },
      originalDoc: { id: 5, _status: 'draft', path: 'work2/dup', slug: 'dup2' },
      publishedPath: 'work2/dup',
      publishedSlug: 'dup',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          from: '/work2/dup',
          to: {
            type: 'reference',
            reference: { relationTo: 'posts', value: 5 },
          },
          type: '301',
        },
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/work2/dup')
  })

  it('keys the row on the nested path for a nested page, not on the bare slug', async () => {
    const { create } = await publish({
      collectionSlug: 'pages',
      data: { _status: 'published', slug: 'bcore' },
      doc: { id: 7, _status: 'published', path: 'work/bcore', slug: 'bcore' },
      originalDoc: {
        id: 7,
        _status: 'draft',
        path: 'work/brytecore',
        slug: 'bcore',
      },
      publishedPath: 'work/brytecore',
      publishedSlug: 'brytecore',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ from: '/work/brytecore' }),
      }),
    )
  })

  /**
   * A re-parent moves the URL without touching the slug. A slug-keyed writer
   * saw `from === to` and wrote nothing; a path-keyed one sees the move.
   */
  it('writes a row when only the parent moved and the slug did not', async () => {
    const { create } = await publish({
      collectionSlug: 'pages',
      data: { _status: 'published', slug: 'brytecore' },
      doc: {
        id: 7,
        _status: 'published',
        path: 'experience/brytecore',
        slug: 'brytecore',
      },
      originalDoc: {
        id: 7,
        _status: 'draft',
        path: 'work/brytecore',
        slug: 'brytecore',
      },
      publishedPath: 'work/brytecore',
      publishedSlug: 'brytecore',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ from: '/work/brytecore' }),
      }),
    )
  })

  /**
   * The second #150 residue: un-placing clears `path`, so the article returns
   * to `/articles/<slug>` and the section URL it vacated used to 404. The slug
   * never moves, so a slug-keyed writer computed `from === to` and wrote
   * nothing — this is the case that proves `to` is read off the document and
   * not off its slug.
   */
  it('writes a row when a placed post is un-placed and the slug did not move', async () => {
    const { create } = await publish({
      data: { _status: 'published', parent: null, slug: 'dup' },
      doc: { id: 5, _status: 'published', path: null, slug: 'dup' },
      originalDoc: { id: 5, _status: 'draft', path: 'work2/dup', slug: 'dup' },
      publishedPath: 'work2/dup',
      publishedSlug: 'dup',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          from: '/work2/dup',
          to: {
            type: 'reference',
            reference: { relationTo: 'posts', value: 5 },
          },
          type: '301',
        },
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/work2/dup')
  })

  it('falls back to the captured slug when no path was stashed', async () => {
    const harness = makeHarness()
    const req = harness.makeReq('old')
    // A stash written by a capture hook from before the path stash existed.
    Object.assign(harness.rawReq.context, {
      previousPublishedSlugs: { 'posts:55': 'old' },
    })

    await createPathRedirect({
      collection: { slug: 'posts' },
      context: harness.rawReq.context,
      doc: { id: 55, _status: 'published', slug: 'new' },
      operation: 'update',
      req,
    } as never)

    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ from: '/articles/old' }),
      }),
    )
  })

  it('ignores collections whose slug is not a public URL', async () => {
    const { create } = await publish({
      collectionSlug: 'categories',
      data: { _status: 'published', slug: 'design-systems' },
      doc: { id: 3, _status: 'published', slug: 'design-systems' },
      originalDoc: { id: 3, _status: 'published', slug: 'design' },
      publishedSlug: 'design',
    })

    expect(create).not.toHaveBeenCalled()
  })

  it('writes nothing on create', async () => {
    const harness = makeHarness()
    const req = harness.makeReq(null)

    await createPathRedirect({
      collection: { slug: 'posts' },
      context: {},
      doc: { id: 55, _status: 'published', slug: 'brand-new' },
      operation: 'create',
      req,
    } as never)

    expect(harness.create).not.toHaveBeenCalled()
  })

  it('honours context.disableSlugRedirect', async () => {
    const { create } = await publish({
      context: { disableSlugRedirect: true },
      data: { _status: 'published', slug: 'new' },
      doc: { id: 55, _status: 'published', slug: 'new' },
      originalDoc: { id: 55, _status: 'published', slug: 'old' },
      publishedSlug: 'old',
    })

    expect(create).not.toHaveBeenCalled()
  })

  it('honours context.disableRevalidate for the path purge only', async () => {
    const { create } = await publish({
      context: { disableRevalidate: true },
      data: { _status: 'published', slug: 'new' },
      doc: { id: 55, _status: 'published', slug: 'new' },
      originalDoc: { id: 55, _status: 'published', slug: 'old' },
      publishedSlug: 'old',
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('never fails the editor’s publish when the redirect write throws', async () => {
    const harness = makeHarness()
    const req = harness.makeReq('old')
    harness.findRedirects.mockRejectedValueOnce(new Error('db down') as never)
    const context: Record<string, unknown> = {}
    const doc = { id: 55, _status: 'published', slug: 'new' }

    await capturePublishedSlug({
      collection: { slug: 'posts' },
      context,
      data: { _status: 'published', slug: 'new' },
      operation: 'update',
      originalDoc: { id: 55, _status: 'published', slug: 'old' },
      req,
    } as never)

    await expect(
      createPathRedirect({
        collection: { slug: 'posts' },
        context,
        doc,
        operation: 'update',
        req,
      } as never),
    ).resolves.toBe(doc)
    expect(harness.logger.error).toHaveBeenCalled()
  })
})
