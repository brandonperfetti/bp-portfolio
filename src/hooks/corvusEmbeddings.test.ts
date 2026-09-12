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
const refreshTechStackSummaryMock = vi.fn()

vi.mock('@/lib/ai/embeddingsStore', () => ({
  syncDocumentEmbeddings: (...args: unknown[]) =>
    syncDocumentEmbeddingsMock(...args),
  deleteDocumentEmbeddings: (...args: unknown[]) =>
    deleteDocumentEmbeddingsMock(...args),
}))

vi.mock('@/lib/ai/techStackSummarySync', () => ({
  refreshTechStackSummary: (...args: unknown[]) =>
    refreshTechStackSummaryMock(...args),
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

describe('8. re-emits the daily-driver summary on tech-stack writes (#165)', () => {
  const synced = {
    written: 1,
    deleted: 0,
    metadataUpdated: 0,
    skipped: false,
  }

  it('runs the summary step AFTER the per-row sync, on tech-stack only', async () => {
    // The order is the assertion, not a detail: the summary is a view of the
    // collection this save just changed, so composing it first would embed
    // the previous tier.
    const order: string[] = []
    syncDocumentEmbeddingsMock.mockImplementation(async () => {
      order.push('per-row')
      return synced
    })
    refreshTechStackSummaryMock.mockImplementation(async () => {
      order.push('summary')
      return synced
    })
    const { args } = changeArgs({ doc: { id: 9 }, previousDoc: { id: 9 } })

    await refreshCorvusEmbeddings('tech-stack')(args)

    expect(order).toEqual(['per-row', 'summary'])
  })

  it('forwards the hook’s `req` so the summary reads THIS transaction', async () => {
    // Transactions are on by default under `@payloadcms/db-postgres`, so a
    // summary `find` without `req` takes its own connection and composes from
    // PRE-save rows — the save that triggered the refresh would be invisible
    // to it. Identity, not `expect.anything()`: a fresh object would be a
    // different transaction.
    syncDocumentEmbeddingsMock.mockResolvedValue(synced)
    refreshTechStackSummaryMock.mockResolvedValue(synced)
    const { args } = changeArgs({ doc: { id: 9 }, previousDoc: { id: 9 } })

    await refreshCorvusEmbeddings('tech-stack')(args)

    expect(refreshTechStackSummaryMock.mock.calls[0][0].req).toBe(
      (args as unknown as { req: unknown }).req,
    )
  })

  it('afterDelete forwards the hook’s `req` too', async () => {
    // Same reason, opposite direction: without `req` the read runs outside the
    // delete's transaction and still SEES the row that was just deleted.
    refreshTechStackSummaryMock.mockResolvedValue(synced)
    const { args } = deleteArgs()

    await deleteCorvusEmbeddings('tech-stack')(args)

    expect(refreshTechStackSummaryMock.mock.calls[0][0].req).toBe(
      (args as unknown as { req: unknown }).req,
    )
  })

  it.each(['posts', 'projects', 'uses', 'work-history'] as const)(
    'does not re-emit on a %s write',
    async (collection) => {
      syncDocumentEmbeddingsMock.mockResolvedValue(synced)
      const { args } = changeArgs({
        doc: { id: 9, _status: 'published' },
        previousDoc: { id: 9, _status: 'published' },
      })

      await refreshCorvusEmbeddings(collection)(args)

      expect(refreshTechStackSummaryMock).not.toHaveBeenCalled()
    },
  )

  it('honours context.disableRevalidate', async () => {
    const { args } = changeArgs({ context: { disableRevalidate: true } })
    await refreshCorvusEmbeddings('tech-stack')(args)

    expect(refreshTechStackSummaryMock).not.toHaveBeenCalled()
  })

  it('gives the summary step the SAME deadline object as the per-row sync', async () => {
    // One deadline for the whole hook. A second, independent
    // `AbortSignal.timeout(HOOK_EMBEDDING_TIMEOUT_MS)` here would silently
    // double a tech-stack save's worst case while the docblock went on naming
    // one constant — so the assertion is object IDENTITY, not "an AbortSignal
    // was passed", which any number of timeouts would satisfy.
    syncDocumentEmbeddingsMock.mockResolvedValue(synced)
    refreshTechStackSummaryMock.mockResolvedValue(synced)
    const { args } = changeArgs({ doc: { id: 9 }, previousDoc: { id: 9 } })

    await refreshCorvusEmbeddings('tech-stack')(args)

    const syncSignal = syncDocumentEmbeddingsMock.mock.calls[0][0].abortSignal
    const summarySignal =
      refreshTechStackSummaryMock.mock.calls[0][0].abortSignal
    expect(syncSignal).toBeInstanceOf(AbortSignal)
    expect(summarySignal).toBe(syncSignal)
  })

  it('bounds the WHOLE hook at ONE HOOK_EMBEDDING_TIMEOUT_MS, not 2x', async () => {
    // The test the previous version of this case could not be: it asserted
    // `expect.any(AbortSignal)` and a constant, and would have passed
    // unchanged against `AbortSignal.timeout(600_000)` or against two
    // independent deadlines.
    //
    // The shape is what makes it discriminating. The per-row sync spends
    // almost the WHOLE budget and then succeeds; the summary step then hangs
    // forever and honours no signal, so the only thing that can settle this
    // hook is the hook's own deadline.
    //
    // - One shared deadline: 1ms of budget is left when the summary starts, so
    //   the hook fails open at exactly HOOK_EMBEDDING_TIMEOUT_MS.
    // - A second, independent deadline for the summary step: it starts with a
    //   fresh full budget, so at HOOK_EMBEDDING_TIMEOUT_MS the hook is STILL
    //   pending and the `resolves` assertion below fails. That is the
    //   regression this case exists to catch, and the reason the previous
    //   version of it — `expect.any(AbortSignal)` plus a constant — could not.
    vi.useFakeTimers()
    try {
      syncDocumentEmbeddingsMock.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(synced), HOOK_EMBEDDING_TIMEOUT_MS - 1),
          ),
      )
      refreshTechStackSummaryMock.mockImplementation(
        () => new Promise(() => {}),
      )
      const doc = { id: 9 }
      const { args, log } = changeArgs({ doc, previousDoc: { id: 9 } })

      const pending = refreshCorvusEmbeddings('tech-stack')(args)
      let settled = false
      void pending.then(() => {
        settled = true
      })

      // The per-row sync has just returned; the summary step is running and
      // the hook is still waiting on it.
      await vi.advanceTimersByTimeAsync(HOOK_EMBEDDING_TIMEOUT_MS - 1)
      expect(refreshTechStackSummaryMock).toHaveBeenCalledTimes(1)
      expect(settled).toBe(false)

      // One more millisecond spends the SHARED budget: failed open, with the
      // save's own document returned so the save completes.
      await vi.advanceTimersByTimeAsync(1)
      await expect(pending).resolves.toBe(doc)
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('backfill-corvus-embeddings.ts'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds the afterDelete hook the same way', async () => {
    vi.useFakeTimers()
    try {
      deleteDocumentEmbeddingsMock.mockResolvedValue(undefined)
      refreshTechStackSummaryMock.mockImplementation(
        () => new Promise(() => {}),
      )
      const doc = { id: 9 }
      const { args, log } = deleteArgs({ doc })

      const pending = deleteCorvusEmbeddings('tech-stack')(args)
      await vi.advanceTimersByTimeAsync(HOOK_EMBEDDING_TIMEOUT_MS)

      await expect(pending).resolves.toBe(doc)
      expect(log.error).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('FAILS OPEN: a throwing summary step does not fail the save', async () => {
    // The whole point of putting the step inside the existing `try`. A
    // failure logs, leaves the STALE summary row in place, and the save
    // completes — the backfill is the repair path, exactly as it is for every
    // other failure in this hook.
    syncDocumentEmbeddingsMock.mockResolvedValue(synced)
    refreshTechStackSummaryMock.mockRejectedValue(new Error('provider down'))
    const { args, log } = changeArgs({ doc: { id: 9 }, previousDoc: { id: 9 } })

    await expect(
      refreshCorvusEmbeddings('tech-stack')(args),
    ).resolves.toBeDefined()

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('backfill-corvus-embeddings.ts'),
    )
    // And the per-row work still happened: the summary failure is downstream
    // of it, so the technology's own chunk is already written.
    expect(syncDocumentEmbeddingsMock).toHaveBeenCalledTimes(1)
  })

  it('re-emits on afterDelete too — the tier can SHRINK', async () => {
    refreshTechStackSummaryMock.mockResolvedValue(synced)
    const { args } = deleteArgs({ doc: { id: 9 } })

    await deleteCorvusEmbeddings('tech-stack')(args)

    expect(deleteDocumentEmbeddingsMock).toHaveBeenCalledTimes(1)
    expect(refreshTechStackSummaryMock).toHaveBeenCalledTimes(1)
  })

  it('fails open on afterDelete as well', async () => {
    refreshTechStackSummaryMock.mockRejectedValue(new Error('db gone'))
    const { args, log } = deleteArgs({ doc: { id: 9 } })

    await expect(
      deleteCorvusEmbeddings('tech-stack')(args),
    ).resolves.toBeDefined()
    expect(log.error).toHaveBeenCalled()
  })

  it('does not re-emit on a non-tech-stack delete', async () => {
    const { args } = deleteArgs({ doc: { id: 9 } })
    await deleteCorvusEmbeddings('posts')(args)

    expect(refreshTechStackSummaryMock).not.toHaveBeenCalled()
  })
})
