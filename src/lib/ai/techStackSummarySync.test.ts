import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CORVUS_TECH_STACK_SUMMARY_COLLECTION,
  TECH_STACK_SUMMARY_DOC_ID,
  chunkTechStackSummary,
} from '@/lib/ai/chunking'
import {
  readTechStackSummaryRows,
  refreshTechStackSummary,
  syncTechStackSummaryEmbeddings,
} from '@/lib/ai/techStackSummarySync'
import { createDeadline } from '@/lib/ai/withDeadline'

/**
 * The `tech-stack-summary` write path (#165).
 *
 * @remarks Two acceptance criteria live here, and both are asserted as COUNTS
 * rather than as outcomes:
 *
 * - a re-emit whose daily tier did not change makes **zero** embedding-provider
 *   calls, which is what makes the hook re-emit affordable on every save;
 * - a tier that shrinks to nothing DELETES the summary row rather than leaving
 *   a stale list in the index.
 *
 * The database is the same recording fake `githubReposSync.test.ts` uses, and
 * for the same reason: this tier is about the ORCHESTRATION — what is called,
 * how many times — and a fake is the only thing that can count a provider call
 * that must not happen. There is no provider key in this sandbox, so the
 * RETRIEVAL half of #165 is Brandon's keyed run; see `docs/AI.md` §Corvus.
 */

const { embedChunksMock } = vi.hoisted(() => ({
  embedChunksMock: vi.fn(async (values: readonly string[]) =>
    values.map(() => new Array(1536).fill(0.001)),
  ),
}))

vi.mock('@/lib/ai/embeddings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/embeddings')>()
  return { ...actual, embedChunks: embedChunksMock }
})

/** One executed statement, reduced to the text drizzle would emit. */
interface Executed {
  text: string
  params: unknown[]
}

/** A recording stand-in for `payload.db.drizzle`; see githubReposSync.test.ts. */
function createFakeDb(storedRows: Array<Record<string, unknown>> = []): {
  execute: (query: unknown) => Promise<unknown>
  statements: Executed[]
} {
  const statements: Executed[] = []
  const rows = [...storedRows]

  return {
    statements,
    execute: async (query: unknown) => {
      const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
      const isStringChunk = (part: unknown): boolean =>
        Array.isArray((part as { value?: unknown } | null)?.value)

      const text = chunks
        .filter(isStringChunk)
        .map((part) => (part as { value: string[] }).value.join(''))
        .join(' ')
      const params = chunks.filter((part) => !isStringChunk(part))

      statements.push({ text, params })

      if (text.includes('SELECT') && text.includes('chunk_index')) {
        return { rows }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

const daily = (names: string[]) =>
  names.map((name, index) => ({ id: index + 1, name, proficiency: 'daily' }))

const FOURTEEN = daily([
  'TypeScript',
  'Node.js',
  'React',
  'Next.js',
  'GraphQL',
  'Tailwind CSS',
  'Clerk',
  'Supabase',
  'Vercel',
  'AI SDK',
  'Payload',
  'Vitest',
  'Playwright',
  'Storybook',
])

/** The row a stored, already-current summary would read back as. */
const storedRow = (rows: Array<Record<string, unknown>>) => {
  const [chunk] = chunkTechStackSummary(rows).chunks
  return {
    chunk_index: 0,
    content_hash: chunk.contentHash,
    visibility: chunk.visibility,
    published_at: null,
    source_url: chunk.sourceUrl,
    model: 'text-embedding-3-small',
  }
}

/** A minimal Payload stand-in: just `find` and `logger`. */
const fakePayload = (docs: Array<Record<string, unknown>>) => {
  const find = vi.fn(async () => ({ docs }))
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { find, logger } as unknown as Parameters<
    typeof refreshTechStackSummary
  >[0]['payload'] & {
    find: ReturnType<typeof vi.fn>
    logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }
  }
}

beforeEach(() => {
  embedChunksMock.mockClear()
  vi.stubEnv('AI_EMBEDDING_MODEL', 'text-embedding-3-small')
})

describe('syncTechStackSummaryEmbeddings · first write', () => {
  it('embeds and upserts one row under the pseudo-collection', async () => {
    const db = createFakeDb([])

    const result = await syncTechStackSummaryEmbeddings({
      db,
      rows: FOURTEEN,
    })

    expect(result).toMatchObject({ written: 1, skipped: false })
    expect(embedChunksMock).toHaveBeenCalledTimes(1)

    const insert = db.statements.find((s) => s.text.includes('INSERT INTO'))
    expect(insert).toBeDefined()
    const bound = JSON.stringify(insert?.params)
    expect(bound).toContain(CORVUS_TECH_STACK_SUMMARY_COLLECTION)
    expect(bound).toContain('/tech')
    // The identity, bound as data rather than asserted from a constant: the
    // whole point of the pseudo-collection is that nothing else writes here.
    expect(insert?.params).toContain(TECH_STACK_SUMMARY_DOC_ID)
  })

  it('goes through the SAME upsert key the rest of the index uses', async () => {
    const db = createFakeDb([])
    await syncTechStackSummaryEmbeddings({ db, rows: FOURTEEN })

    const insert = db.statements.find((s) => s.text.includes('INSERT INTO'))
    expect(insert?.text).toContain(
      'ON CONFLICT ("collection", "doc_id", "chunk_index")',
    )
  })
})

describe('syncTechStackSummaryEmbeddings · nothing changed', () => {
  it('makes ZERO embedding-provider calls', async () => {
    // The acceptance criterion about spend. `isContentUnchanged` compares
    // `content_hash` BEFORE the provider is called, so a re-emit over an
    // unchanged tier is one indexed SELECT and nothing else.
    const db = createFakeDb([storedRow(FOURTEEN)])

    const result = await syncTechStackSummaryEmbeddings({
      db,
      rows: FOURTEEN,
    })

    expect(result.skipped).toBe(true)
    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(db.statements.some((s) => s.text.includes('INSERT INTO'))).toBe(
      false,
    )
  })

  it('spends nothing when only a NOTES edit changed the source rows', async () => {
    // The common `tech-stack` save: editing a technology's notes does not
    // change the line of names, so the summary re-composes to the same text,
    // finds the same hash, and costs no tokens. This is what makes wiring the
    // re-emit onto every save affordable.
    const db = createFakeDb([storedRow(FOURTEEN)])
    const edited = FOURTEEN.map((row) => ({
      ...row,
      notes: 'Rewritten notes that say nothing about the tier.',
      category: 'frontend',
      url: 'https://example.com',
    }))

    const result = await syncTechStackSummaryEmbeddings({ db, rows: edited })

    expect(result.skipped).toBe(true)
    expect(embedChunksMock).not.toHaveBeenCalled()
  })

  it('re-embeds when the tier actually changes', async () => {
    const db = createFakeDb([storedRow(FOURTEEN)])

    const result = await syncTechStackSummaryEmbeddings({
      db,
      rows: [...FOURTEEN, ...daily(['Drizzle'])],
    })

    expect(result).toMatchObject({ written: 1, skipped: false })
    expect(embedChunksMock).toHaveBeenCalledTimes(1)
  })
})

describe('syncTechStackSummaryEmbeddings · the tier empties', () => {
  it('DELETES the row rather than embedding an empty tier', async () => {
    const db = createFakeDb([storedRow(FOURTEEN)])

    const result = await syncTechStackSummaryEmbeddings({
      db,
      rows: [{ id: 1, name: 'PostgreSQL', proficiency: 'proficient' }],
    })

    expect(result).toMatchObject({ deleted: 1, written: 0 })
    expect(embedChunksMock).not.toHaveBeenCalled()
    const del = db.statements.find((s) => s.text.includes('DELETE FROM'))
    expect(del?.params).toContain(CORVUS_TECH_STACK_SUMMARY_COLLECTION)
  })
})

describe('readTechStackSummaryRows', () => {
  it('reads EVERY row — limit 0 is Payload’s only unlimited form', async () => {
    // A `limit: N` still caps the result even with `pagination: false`, so a
    // capped read here would silently shorten the daily-driver tier.
    const payload = fakePayload(FOURTEEN)

    await readTechStackSummaryRows(payload)

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'tech-stack',
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
  })

  it('omits the `req` key entirely when the caller has no request', async () => {
    // The backfill is that caller. An explicit `req: undefined` is not the same
    // thing as an absent key, so the shape is pinned rather than the value.
    const payload = fakePayload(FOURTEEN)

    await readTechStackSummaryRows(payload)

    const args = payload.find.mock.calls[0][0] as Record<string, unknown>
    expect(Object.hasOwn(args, 'req')).toBe(false)
  })

  it('forwards `req` so the read joins the caller’s transaction', async () => {
    // `@payloadcms/db-postgres` runs with transactions on by default, so a
    // Local API call without `req` takes a separate connection and would read
    // the collection as it was BEFORE the save that triggered the refresh.
    const payload = fakePayload(FOURTEEN)
    const req = { id: 'req-1' } as unknown as Parameters<
      typeof readTechStackSummaryRows
    >[1]

    await readTechStackSummaryRows(payload, req)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tech-stack', req }),
    )
  })
})

describe('refreshTechStackSummary', () => {
  it('forwards its `req` down to the `find`', async () => {
    const db = createFakeDb([])
    const payload = fakePayload(FOURTEEN)
    const req = { id: 'req-2' } as unknown as Parameters<
      typeof readTechStackSummaryRows
    >[1]

    await refreshTechStackSummary({ payload, db, req })

    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ req }))
  })

  it('NAMES every row it had to skip, at warn level', async () => {
    // The wave-7 learning-10 trap, made loud: a technology Brandon believes is
    // a daily driver whose stored `proficiency` is `''` silently drops out of
    // the tier, and the short answer then reads as a retrieval problem.
    const db = createFakeDb([])
    const payload = fakePayload([
      { id: 1, name: 'Next.js', proficiency: 'daily' },
      { id: 2, name: 'React', proficiency: '' },
    ])

    await refreshTechStackSummary({ payload, db })

    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('React'),
    )
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped 1 row(s)'),
    )
  })

  it('stays quiet when every row carries a known tier', async () => {
    const db = createFakeDb([storedRow(FOURTEEN)])
    const payload = fakePayload(FOURTEEN)

    await refreshTechStackSummary({ payload, db })

    expect(payload.logger.warn).not.toHaveBeenCalled()
    expect(payload.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('daily=14'),
    )
  })

  it('throws for its caller to decide — the hook swallows, the backfill does not', async () => {
    embedChunksMock.mockRejectedValueOnce(new Error('provider down'))
    const db = createFakeDb([])
    const payload = fakePayload(FOURTEEN)

    await expect(refreshTechStackSummary({ payload, db })).rejects.toThrow(
      'provider down',
    )
  })
})

describe('refreshTechStackSummary · the deadline covers the find (#165 rider 1)', () => {
  it('gives up on a hung payload.find at the caller’s deadline', async () => {
    // `payload.find` takes no AbortSignal, so on a slow database this read —
    // one statement over the whole collection — is the likeliest stall in the
    // refresh. Left unbounded, the hook's "one HOOK_EMBEDDING_TIMEOUT_MS"
    // promise would have been true only of the provider call.
    vi.useFakeTimers()
    try {
      const db = createFakeDb([])
      const payload = fakePayload([])
      payload.find.mockImplementation(() => new Promise(() => {}))
      const deadline = createDeadline(1_000)

      const pending = refreshTechStackSummary({
        payload,
        db,
        abortSignal: deadline.signal,
      })
      const caught = pending.catch((error: unknown) => error)

      await vi.advanceTimersByTimeAsync(1_000)

      expect(String(await caught)).toContain('deadline of 1000ms exceeded')
      expect(embedChunksMock).not.toHaveBeenCalled()
      deadline.done()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the find UNBOUNDED with no signal — the backfill path', async () => {
    // A repair tool should fail loudly and be re-run, not abandon the corpus
    // on a clock.
    const db = createFakeDb([])
    const payload = fakePayload(FOURTEEN)

    await expect(
      refreshTechStackSummary({ payload, db }),
    ).resolves.toMatchObject({ written: 1 })
  })
})
