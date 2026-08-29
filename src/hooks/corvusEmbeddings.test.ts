import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The seven hook non-negotiables (#82 research §3.7), one describe block each.
 *
 * These are the properties that decide whether wiring an embedding refresh
 * onto every content save is safe or reckless: a hook that throws breaks
 * publishing, a hook that skips nothing burns tokens on every autosave tick,
 * and a hook that ignores unpublishing leaves Corvus quoting withdrawn
 * articles. Following `revalidateCollection.test.ts`'s factory-and-fake-args
 * pattern.
 */
const syncDocumentEmbeddingsMock = vi.fn()
const deleteDocumentEmbeddingsMock = vi.fn()

vi.mock('@/lib/ai/embeddingsStore', () => ({
  syncDocumentEmbeddings: (...args: unknown[]) =>
    syncDocumentEmbeddingsMock(...args),
  deleteDocumentEmbeddings: (...args: unknown[]) =>
    deleteDocumentEmbeddingsMock(...args),
}))

import {
  HOOK_EMBEDDING_TIMEOUT_MS,
  deleteCorvusEmbeddings,
  isAutosaveRequest,
  refreshCorvusEmbeddings,
} from '@/hooks/corvusEmbeddings'

const execute = vi.fn(async () => ({ rows: [] }))

const logger = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })

const changeArgs = (
  over: {
    doc?: Record<string, unknown>
    previousDoc?: Record<string, unknown>
    context?: Record<string, unknown>
    query?: Record<string, unknown>
    drizzle?: unknown
  } = {},
) => {
  const log = logger()
  const args = {
    doc: over.doc ?? { id: 7, _status: 'published', title: 'T' },
    previousDoc: over.previousDoc ?? { id: 7, _status: 'published' },
    req: {
      payload: {
        logger: log,
        db: { drizzle: 'drizzle' in over ? over.drizzle : { execute } },
      },
      context: over.context ?? {},
      query: over.query ?? {},
    },
  }
  return { args: args as never, log }
}

const deleteArgs = (
  over: {
    doc?: Record<string, unknown>
    context?: Record<string, unknown>
  } = {},
) => {
  const log = logger()
  const args = {
    doc: over.doc ?? { id: 7 },
    req: {
      payload: { logger: log, db: { drizzle: { execute } } },
      context: over.context ?? {},
    },
  }
  return { args: args as never, log }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('1. honours context.disableRevalidate', () => {
  it('afterChange does nothing when the seed suppresses revalidation', async () => {
    const { args } = changeArgs({ context: { disableRevalidate: true } })
    await refreshCorvusEmbeddings('posts')(args)

    expect(syncDocumentEmbeddingsMock).not.toHaveBeenCalled()
    expect(deleteDocumentEmbeddingsMock).not.toHaveBeenCalled()
  })

  it('afterDelete does nothing when the seed suppresses revalidation', async () => {
    const { args } = deleteArgs({ context: { disableRevalidate: true } })
    await deleteCorvusEmbeddings('posts')(args)

    expect(deleteDocumentEmbeddingsMock).not.toHaveBeenCalled()
  })
})

describe('2. skips drafts, unpublished saves, and autosave ticks', () => {
  it('delegates the draft skip to the store rather than duplicating the rule', async () => {
    // `syncDocumentEmbeddings` owns eligibility (and deletes an ineligible
    // doc's rows); the hook must not fork that logic.
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 0,
      deleted: 1,
      metadataUpdated: 0,
      skipped: false,
    })
    const { args } = changeArgs({
      doc: { id: 7, _status: 'draft' },
      previousDoc: { id: 7, _status: 'draft' },
    })

    await refreshCorvusEmbeddings('posts')(args)

    expect(syncDocumentEmbeddingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'posts' }),
    )
  })

  it('short-circuits an autosave tick before any store call', async () => {
    const { args } = changeArgs({ query: { autosave: 'true' } })
    await refreshCorvusEmbeddings('posts')(args)

    expect(syncDocumentEmbeddingsMock).not.toHaveBeenCalled()
  })

  it('recognizes the autosave flag as a string or a boolean', () => {
    expect(isAutosaveRequest({ query: { autosave: 'true' } })).toBe(true)
    expect(isAutosaveRequest({ query: { autosave: true } })).toBe(true)
    expect(isAutosaveRequest({ query: { autosave: 'false' } })).toBe(false)
    expect(isAutosaveRequest({ query: {} })).toBe(false)
    expect(isAutosaveRequest({})).toBe(false)
    expect(isAutosaveRequest(null)).toBe(false)
  })
})

describe('3. skips unchanged content before any provider call', () => {
  it('logs nothing extra when the store reports a hash skip', async () => {
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 0,
      deleted: 0,
      metadataUpdated: 0,
      skipped: true,
    })
    const { args, log } = changeArgs()

    await refreshCorvusEmbeddings('projects')(args)

    expect(log.info).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('logs a metadata correction DISTINCTLY from a re-embed', async () => {
    // A public → gated flip repairs the retrieval-filter columns without any
    // provider call. Operators need to be able to tell that apart from a
    // re-embed in the logs, both for cost and for auditing a gating change.
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 0,
      deleted: 0,
      metadataUpdated: 3,
      skipped: false,
    })
    const { args, log } = changeArgs()

    await refreshCorvusEmbeddings('posts')(args)

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('metadata corrected'),
    )
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('rows=3'))
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('no re-embed'),
    )
    expect(log.info).not.toHaveBeenCalledWith(
      expect.stringContaining('embeddings refreshed'),
    )
  })

  it('logs what changed when the store actually wrote', async () => {
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 3,
      deleted: 0,
      metadataUpdated: 0,
      skipped: false,
    })
    const { args, log } = changeArgs()

    await refreshCorvusEmbeddings('projects')(args)

    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('written=3'))
  })
})

describe('4. NEVER throws', () => {
  it('swallows a store failure and logs through req.payload.logger', async () => {
    syncDocumentEmbeddingsMock.mockRejectedValue(new Error('provider down'))
    const { args, log } = changeArgs()

    await expect(refreshCorvusEmbeddings('posts')(args)).resolves.toBeDefined()
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('provider down'),
    )
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('backfill-corvus-embeddings'),
    )
  })

  it('returns the document unchanged even after a failure, so the save completes', async () => {
    syncDocumentEmbeddingsMock.mockRejectedValue(new Error('boom'))
    const doc = { id: 7, _status: 'published', title: 'T' }
    const { args } = changeArgs({ doc })

    expect(await refreshCorvusEmbeddings('posts')(args)).toBe(doc)
  })

  it('afterDelete swallows its failure too', async () => {
    deleteDocumentEmbeddingsMock.mockRejectedValue(new Error('db gone'))
    const { args, log } = deleteArgs()

    await expect(deleteCorvusEmbeddings('posts')(args)).resolves.toBeDefined()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('db gone'))
  })

  it('no-ops safely when the adapter exposes no drizzle handle', async () => {
    const { args } = changeArgs({ drizzle: undefined })

    await expect(refreshCorvusEmbeddings('posts')(args)).resolves.toBeDefined()
    expect(syncDocumentEmbeddingsMock).not.toHaveBeenCalled()
  })

  it('no-ops on a document with no numeric id', async () => {
    const { args } = changeArgs({ doc: { _status: 'published' } })

    await refreshCorvusEmbeddings('posts')(args)
    expect(syncDocumentEmbeddingsMock).not.toHaveBeenCalled()
  })
})

describe('5. bounds the provider call with AbortSignal.timeout', () => {
  it('passes an abort signal into the store', async () => {
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 1,
      deleted: 0,
      metadataUpdated: 0,
      skipped: false,
    })
    const { args } = changeArgs()

    await refreshCorvusEmbeddings('posts')(args)

    const call = syncDocumentEmbeddingsMock.mock.calls[0][0] as {
      abortSignal: AbortSignal
    }
    expect(call.abortSignal).toBeInstanceOf(AbortSignal)
    expect(call.abortSignal.aborted).toBe(false)
  })

  it('keeps the admin-save bound tighter than the read path budget', () => {
    expect(HOOK_EMBEDDING_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
    expect(HOOK_EMBEDDING_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('6. afterDelete AND published → draft delete the rows', () => {
  it('afterDelete removes the document’s rows', async () => {
    deleteDocumentEmbeddingsMock.mockResolvedValue(undefined)
    const { args, log } = deleteArgs({ doc: { id: 12 } })

    await deleteCorvusEmbeddings('work-history')(args)

    expect(deleteDocumentEmbeddingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'work-history',
      12,
    )
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('work-history#12'),
    )
  })

  it('an UNPUBLISH deletes the rows and never re-embeds', async () => {
    deleteDocumentEmbeddingsMock.mockResolvedValue(undefined)
    const { args, log } = changeArgs({
      doc: { id: 7, _status: 'draft' },
      previousDoc: { id: 7, _status: 'published' },
    })

    await refreshCorvusEmbeddings('posts')(args)

    expect(deleteDocumentEmbeddingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'posts',
      7,
    )
    expect(syncDocumentEmbeddingsMock).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('unpublished'),
    )
  })

  /**
   * The ordering regression. Payload autosave writes a DRAFT version of a
   * still-published document, so `afterChange` sees exactly the shape the
   * unpublish branch deletes on: `previousDoc._status: 'published'` against
   * `doc._status: 'draft'`. The `query.autosave` flag is the ONLY thing that
   * tells the two apart, so the guard reading it has to run FIRST. With the
   * guard second, every autosave tick on a published post deleted that post's
   * live embeddings while the published version was still serving.
   */
  it('an AUTOSAVE presenting as published → draft keeps the embeddings', async () => {
    deleteDocumentEmbeddingsMock.mockResolvedValue(undefined)
    const { args } = changeArgs({
      doc: { id: 7, _status: 'draft' },
      previousDoc: { id: 7, _status: 'published' },
      query: { autosave: true },
    })

    await refreshCorvusEmbeddings('posts')(args)

    expect(deleteDocumentEmbeddingsMock).not.toHaveBeenCalled()
    expect(syncDocumentEmbeddingsMock).not.toHaveBeenCalled()
  })

  it('a REAL unpublish — same transition, no autosave flag — still deletes', async () => {
    deleteDocumentEmbeddingsMock.mockResolvedValue(undefined)
    const { args } = changeArgs({
      doc: { id: 7, _status: 'draft' },
      previousDoc: { id: 7, _status: 'published' },
      query: {},
    })

    await refreshCorvusEmbeddings('posts')(args)

    expect(deleteDocumentEmbeddingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'posts',
      7,
    )
  })

  it('a publish (draft → published) refreshes rather than deletes', async () => {
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 2,
      deleted: 0,
      metadataUpdated: 0,
      skipped: false,
    })
    const { args } = changeArgs({
      doc: { id: 7, _status: 'published' },
      previousDoc: { id: 7, _status: 'draft' },
    })

    await refreshCorvusEmbeddings('posts')(args)

    expect(deleteDocumentEmbeddingsMock).not.toHaveBeenCalled()
    expect(syncDocumentEmbeddingsMock).toHaveBeenCalledTimes(1)
  })

  it('a published → published edit refreshes', async () => {
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 1,
      deleted: 0,
      metadataUpdated: 0,
      skipped: false,
    })
    const { args } = changeArgs()

    await refreshCorvusEmbeddings('posts')(args)

    expect(deleteDocumentEmbeddingsMock).not.toHaveBeenCalled()
    expect(syncDocumentEmbeddingsMock).toHaveBeenCalledTimes(1)
  })

  it('a draft-free collection is never mistaken for an unpublish', async () => {
    // Projects/Uses/TechStack/WorkHistory carry no `_status` at all; treating
    // "no _status" as "not published" would delete every one of their rows on
    // every save.
    syncDocumentEmbeddingsMock.mockResolvedValue({
      written: 1,
      deleted: 0,
      metadataUpdated: 0,
      skipped: false,
    })
    const { args } = changeArgs({
      doc: { id: 3, title: 'Portfolio' },
      previousDoc: { id: 3, title: 'Portfolio' },
    })

    await refreshCorvusEmbeddings('projects')(args)

    expect(deleteDocumentEmbeddingsMock).not.toHaveBeenCalled()
    expect(syncDocumentEmbeddingsMock).toHaveBeenCalledTimes(1)
  })
})

describe('7. carries the collection slug through to the store', () => {
  it.each(['posts', 'projects', 'uses', 'tech-stack', 'work-history'] as const)(
    'wires %s',
    async (collection) => {
      syncDocumentEmbeddingsMock.mockResolvedValue({
        written: 1,
        deleted: 0,
        metadataUpdated: 0,
        skipped: false,
      })
      const { args } = changeArgs({
        doc: { id: 1, _status: 'published' },
        previousDoc: { id: 1, _status: 'published' },
      })

      await refreshCorvusEmbeddings(collection)(args)

      expect(syncDocumentEmbeddingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ collection }),
      )
    },
  )
})
