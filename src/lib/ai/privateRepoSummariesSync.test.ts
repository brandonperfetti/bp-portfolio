import { describe, expect, it, vi } from 'vitest'

import {
  type PrivateRepoSummary,
  chunkPrivateRepoSummary,
  privateRepoSummaryDocId,
} from '@/lib/ai/privateRepoSummaries'
import { syncPrivateRepoSummaries } from '@/lib/ai/privateRepoSummariesSync'

/**
 * The `github-private-summary` write path (#193), asserted as counts: what is
 * embedded, what is skipped for free, and what an allowlist removal deletes.
 * The database is a recording fake, as in `techStackSummarySync.test.ts`.
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

const entry: PrivateRepoSummary = {
  name: 'sample-private',
  description: 'Reusable review checklists.',
  topics: ['code-review'],
  blurb: 'Where the review checklists live while they become a toolkit.',
}

/** A recording fake: `indexed` doc ids, and stored rows per doc id. */
function createFakeDb(
  indexed: number[] = [],
  stored: Record<number, Array<Record<string, unknown>>> = {},
) {
  const statements: string[] = []
  return {
    statements,
    execute: async (query: unknown) => {
      const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
      const isText = (part: unknown) =>
        Array.isArray((part as { value?: unknown } | null)?.value)
      const text = chunks
        .filter(isText)
        .map((part) => (part as { value: string[] }).value.join(''))
        .join(' ')
      const params = chunks.filter((part) => !isText(part))
      statements.push(text)
      if (text.includes('DISTINCT')) {
        return { rows: indexed.map((doc_id) => ({ doc_id })) }
      }
      if (text.includes('SELECT') && text.includes('chunk_index')) {
        const docId = params.find(
          (value): value is number =>
            typeof value === 'number' && stored[value] !== undefined,
        )
        return { rows: docId === undefined ? [] : stored[docId] }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

const storedRowFor = (summary: PrivateRepoSummary) => {
  const chunk = chunkPrivateRepoSummary(summary)
  return {
    chunk_index: 0,
    content_hash: chunk.contentHash,
    visibility: chunk.visibility,
    published_at: null,
    source_url: chunk.sourceUrl,
    model: 'text-embedding-3-small',
  }
}

describe('syncPrivateRepoSummaries', () => {
  it('writes nothing and calls no provider for the default empty allowlist', async () => {
    embedChunksMock.mockClear()
    const db = createFakeDb()

    const totals = await syncPrivateRepoSummaries({ db, summaries: [] })

    expect(totals).toEqual({
      listed: 0,
      written: 0,
      skipped: 0,
      metadataUpdated: 0,
      deleted: 0,
    })
    expect(embedChunksMock).not.toHaveBeenCalled()
  })

  it('embeds a new summary once', async () => {
    embedChunksMock.mockClear()
    const db = createFakeDb()

    const totals = await syncPrivateRepoSummaries({ db, summaries: [entry] })

    expect(totals.written).toBe(1)
    expect(embedChunksMock).toHaveBeenCalledTimes(1)
    expect(embedChunksMock.mock.calls[0][0]).toEqual([
      chunkPrivateRepoSummary(entry).content,
    ])
  })

  it('skips an unchanged summary with zero provider calls', async () => {
    embedChunksMock.mockClear()
    const id = privateRepoSummaryDocId(entry.name)
    const db = createFakeDb([id], { [id]: [storedRowFor(entry)] })

    const totals = await syncPrivateRepoSummaries({ db, summaries: [entry] })

    expect(totals.skipped).toBe(1)
    expect(totals.written).toBe(0)
    expect(embedChunksMock).not.toHaveBeenCalled()
  })

  it('removes a summary that left the allowlist, even when it is now empty', async () => {
    const id = privateRepoSummaryDocId(entry.name)
    const db = createFakeDb([id], { [id]: [storedRowFor(entry)] })

    const totals = await syncPrivateRepoSummaries({ db, summaries: [] })

    expect(totals.deleted).toBe(1)
    expect(db.statements.some((text) => text.includes('DELETE'))).toBe(true)
  })

  it('reports without writing on a dry run', async () => {
    embedChunksMock.mockClear()
    const stale = privateRepoSummaryDocId('gone')
    const db = createFakeDb([stale])

    const totals = await syncPrivateRepoSummaries({
      db,
      summaries: [entry],
      dryRun: true,
    })

    expect(totals).toMatchObject({ listed: 1, deleted: 1, written: 0 })
    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(
      db.statements.some((text) => /INSERT|DELETE|UPDATE/.test(text)),
    ).toBe(false)
  })

  it('revokes a removed entry even when another entry’s embed fails (#193 review)', async () => {
    embedChunksMock.mockClear()
    embedChunksMock.mockRejectedValueOnce(new Error('provider down'))
    const removed = privateRepoSummaryDocId('gone')
    const db = createFakeDb([removed])

    await expect(
      syncPrivateRepoSummaries({ db, summaries: [entry] }),
    ).rejects.toThrow(/provider down/)
    expect(db.statements.some((text) => text.includes('DELETE'))).toBe(true)
  })

  it('refuses two entries that derive the same doc_id (#193 review)', async () => {
    embedChunksMock.mockClear()
    // A measured sha256 collision in the first 31 bits.
    expect(privateRepoSummaryDocId('fixture-2607')).toBe(
      privateRepoSummaryDocId('fixture-70509'),
    )
    const db = createFakeDb()

    await expect(
      syncPrivateRepoSummaries({
        db,
        summaries: [
          { ...entry, name: 'fixture-2607' },
          { ...entry, name: 'fixture-70509' },
        ],
      }),
    ).rejects.toThrow(/doc_id/)
    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(db.statements).toEqual([])
  })

  it('validates every entry before writing any', async () => {
    embedChunksMock.mockClear()
    const db = createFakeDb()

    await expect(
      syncPrivateRepoSummaries({
        db,
        summaries: [entry, { ...entry, name: 'owner/leak' }],
      }),
    ).rejects.toThrow(/bare repository name/)
    expect(embedChunksMock).not.toHaveBeenCalled()
  })
})
