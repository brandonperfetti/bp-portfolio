// @vitest-environment node
import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  captureWorkHistorySurfaces,
  readCapturedWorkHistorySurfaces,
  WORK_HISTORY_SURFACES_CONTEXT_KEY,
  workHistoryCardPaths,
} from './workHistorySurfaces'

/**
 * Branching pins for the #207 derivation.
 *
 * @remarks This tier owns the SHAPE of the query and the fail-open branch; it
 * cannot own whether the query works, because a mocked `find` answers whatever
 * it is told to (`docs/TESTING.md`, "Mock `payload.find` at your peril"). That
 * half — `layout.entry` resolving through the Postgres block table, and the
 * `ON DELETE SET NULL` timing the `beforeDelete` capture exists for — is pinned
 * against a real database in
 * `evals/work-history-revalidation-integration.test.ts`.
 */
const mkReq = (
  find: ReturnType<typeof vi.fn>,
  context: Record<string, unknown> = {},
) => {
  const logger = { error: vi.fn(), info: vi.fn() }
  return {
    req: {
      payload: { find, logger },
      context,
    } as unknown as PayloadRequest,
    logger,
  }
}

const emptyResult = { docs: [] }

describe('workHistoryCardPaths', () => {
  let find: ReturnType<typeof vi.fn>

  beforeEach(() => {
    find = vi.fn().mockResolvedValue(emptyResult)
  })

  it('asks BOTH layout-capable collections, published only, by layout.entry', async () => {
    const { req } = mkReq(find)
    await workHistoryCardPaths({ id: 7, req })

    expect(find.mock.calls.map(([args]) => args.collection)).toEqual([
      'pages',
      'posts',
    ])
    for (const [args] of find.mock.calls) {
      // The block-scoped spelling `layout.workHistoryCard.entry` is rejected by
      // Payload outright; the unscoped one is what resolves.
      expect(args.where).toEqual({
        and: [
          { 'layout.entry': { equals: 7 } },
          { _status: { equals: 'published' } },
        ],
      })
      expect(args.pagination).toBe(false)
      expect(args.overrideAccess).toBe(true)
      // `limit: 0`, not merely `pagination: false` — the default cap survives
      // the latter, and a capped list is #207 with a higher threshold.
      expect(args.limit).toBe(0)
    }
  })

  it('does NOT forward req, so a failed lookup cannot poison the write transaction', () => {
    // The #156 contract's teeth: a statement that errors inside the write's
    // Postgres transaction aborts it, and no JS try/catch can un-abort it. The
    // absence of `req` here is load-bearing, not an omission.
    const { req } = mkReq(find)
    void workHistoryCardPaths({ id: 7, req })
    for (const [args] of find.mock.calls) {
      expect(args.req).toBeUndefined()
    }
  })

  it('maps hosting documents to their public paths and dedupes', async () => {
    find = vi.fn(async ({ collection }: { collection: string }) =>
      collection === 'pages'
        ? {
            docs: [
              { slug: 'brytecore', path: 'work/brytecore' },
              { slug: 'home', path: 'home' },
              // A second page at the same path cannot exist, but a page and a
              // placed post can both resolve to one string; the Set is what
              // keeps `revalidatePath` from firing twice inside a transaction.
              { slug: 'brytecore', path: 'work/brytecore' },
            ],
          }
        : { docs: [{ slug: 'a-post', path: null }] },
    )
    const { req } = mkReq(find)

    expect(await workHistoryCardPaths({ id: 7, req })).toEqual([
      '/work/brytecore',
      // The root page is `/`, resolved by `publicPathFor`, never `/home`.
      '/',
      // An unplaced post keeps its v3 URL shape.
      '/articles/a-post',
    ])
  })

  it('returns [] for a missing id rather than querying for null', async () => {
    const { req } = mkReq(find)
    expect(await workHistoryCardPaths({ id: undefined, req })).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })

  it('fails open on a lookup error, logging it and keeping the other collection', async () => {
    find = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'pages') throw new Error('connection terminated')
      return { docs: [{ slug: 'a-post', path: 'work/a-post' }] }
    })
    const { req, logger } = mkReq(find)

    const paths = await workHistoryCardPaths({ id: 7, req })

    // The half that answered still purges — a broken Pages read must not cost
    // the Posts surfaces too.
    expect(paths).toEqual(['/work/a-post'])
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][1]).toContain('work-history#7')
  })
})

describe('captureWorkHistorySurfaces (beforeDelete) / readCapturedWorkHistorySurfaces', () => {
  it('parks the derived paths on req.context, keyed by id', async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) =>
      collection === 'pages'
        ? { docs: [{ slug: 'brytecore', path: 'work/brytecore' }] }
        : emptyResult,
    )
    const { req } = mkReq(find)

    await captureWorkHistorySurfaces({ id: 7, req } as never)

    expect(req.context[WORK_HISTORY_SURFACES_CONTEXT_KEY]).toEqual({
      '7': ['/work/brytecore'],
    })
    expect(await readCapturedWorkHistorySurfaces({ id: 7, req })).toEqual([
      '/work/brytecore',
    ])
  })

  it('keys by id so the bulk delete loop cannot cross two documents', async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) =>
      collection === 'pages'
        ? { docs: [{ slug: 'one', path: 'work/one' }] }
        : emptyResult,
    )
    const { req } = mkReq(find)

    await captureWorkHistorySurfaces({ id: 1, req } as never)
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'pages'
        ? { docs: [{ slug: 'two', path: 'work/two' }] }
        : emptyResult,
    )
    await captureWorkHistorySurfaces({ id: 2, req } as never)

    expect(await readCapturedWorkHistorySurfaces({ id: 1, req })).toEqual([
      '/work/one',
    ])
    expect(await readCapturedWorkHistorySurfaces({ id: 2, req })).toEqual([
      '/work/two',
    ])
  })

  it('reads back [] when nothing was captured, degrading to the static list', async () => {
    const { req } = mkReq(vi.fn())
    expect(await readCapturedWorkHistorySurfaces({ id: 7, req })).toEqual([])
  })

  it('skips the capture query entirely when disableRevalidate is set', async () => {
    // Mirrors the afterChange side: a seed or migration that opted out of the
    // purge must not pay for the lookup, and the `afterDelete` resolver it
    // would have fed is never called either.
    const find = vi.fn()
    const { req } = mkReq(find, { disableRevalidate: true })

    await captureWorkHistorySurfaces({ id: 7, req } as never)

    expect(find).not.toHaveBeenCalled()
    expect(req.context[WORK_HISTORY_SURFACES_CONTEXT_KEY]).toBeUndefined()
  })

  it('does not throw SYNCHRONOUSLY on a req with no context', async () => {
    // The resolver is called before there is a promise for the builder's
    // `catch` to attach to, so a synchronous throw here would escape the
    // fail-open path entirely.
    const req = {} as never
    expect(() => readCapturedWorkHistorySurfaces({ id: 7, req })).not.toThrow()
    expect(await readCapturedWorkHistorySurfaces({ id: 7, req })).toEqual([])
  })
})
