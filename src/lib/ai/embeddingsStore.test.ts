import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The shared write path. The property that matters most here is the
 * `content_hash` skip: it is what makes a hook fire on every save without
 * spending a token on the common no-op edit.
 */
const embedChunksMock = vi.fn()

vi.mock('@/lib/ai/embeddings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/embeddings')>(
    '@/lib/ai/embeddings',
  )
  return {
    ...actual,
    embedChunks: (...args: unknown[]) => embedChunksMock(...args),
  }
})

import { chunkDocument, hashChunkContent } from '@/lib/ai/chunking'
import {
  type CorvusEmbeddingsDb,
  deleteDocumentEmbeddings,
  hasMetadataDrift,
  isContentUnchanged,
  readStoredChunks,
  syncDocumentEmbeddings,
  toEpoch,
  updateDocumentMetadata,
  upsertChunk,
} from '@/lib/ai/embeddingsStore'

/** Render a drizzle fragment to comparable `{ text, params }`. */
const renderSql = (fragment: unknown) => {
  const chunks = (fragment as { queryChunks: unknown[] }).queryChunks
  const params: unknown[] = []
  let text = ''
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown } | null)?.value
    if (Array.isArray(value)) text += (value as string[]).join('')
    else {
      params.push(chunk)
      text += `$${params.length}`
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), params }
}

/** A fake drizzle whose `execute` returns a queued result per call. */
const fakeDb = (results: unknown[] = []) => {
  const calls: unknown[] = []
  let index = 0
  const db: CorvusEmbeddingsDb = {
    execute: vi.fn(async (query: unknown) => {
      calls.push(query)
      return results[index++] ?? { rows: [] }
    }),
  }
  return { db, calls, sql: () => calls.map(renderSql) }
}

const project = { id: 42, title: 'Portfolio', description: 'This site.' }

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('readStoredChunks', () => {
  it('keys stored hashes by chunk index', async () => {
    const { db } = fakeDb([
      {
        rows: [
          {
            chunk_index: 0,
            content_hash: 'aaa',
            visibility: 'public',
            published_at: null,
            model: 'text-embedding-3-small',
          },
          {
            chunk_index: 1,
            content_hash: 'bbb',
            visibility: 'public',
            published_at: null,
            model: 'text-embedding-3-small',
          },
        ],
      },
    ])

    const stored = await readStoredChunks(db, 'posts', 7)
    expect(stored.get(0)?.contentHash).toBe('aaa')
    expect(stored.get(1)?.contentHash).toBe('bbb')
  })

  it('also reads the visibility and schedule retrieval filters on', async () => {
    const { db } = fakeDb([
      {
        rows: [
          {
            chunk_index: 0,
            content_hash: 'aaa',
            visibility: 'gated',
            published_at: new Date('2026-01-01T00:00:00.000Z'),
            model: 'text-embedding-3-small',
          },
        ],
      },
    ])

    const stored = await readStoredChunks(db, 'posts', 7)
    expect(stored.get(0)?.visibility).toBe('gated')
    expect(stored.get(0)?.publishedAt).toBe(
      Date.parse('2026-01-01T00:00:00.000Z'),
    )
  })

  it('treats a row written by a DIFFERENT model as absent, forcing a re-embed', async () => {
    // Otherwise a model swap would leave two vector spaces mixed in one index
    // and degrade retrieval silently instead of failing.
    const { db } = fakeDb([
      {
        rows: [
          {
            chunk_index: 0,
            content_hash: 'aaa',
            visibility: 'public',
            published_at: null,
            model: 'text-embedding-3-large',
          },
        ],
      },
    ])

    expect((await readStoredChunks(db, 'posts', 7)).size).toBe(0)
  })

  it('scopes the lookup to one document', async () => {
    const { db, sql } = fakeDb()
    await readStoredChunks(db, 'projects', 42)

    const { text, params } = sql()[0]
    expect(text).toContain('"collection" = $1 AND "doc_id" = $2')
    expect(params).toEqual(['projects', 42])
  })
})

/** Build a stored-row map matching the given chunks exactly. */
const storedFrom = (
  chunks: ReturnType<typeof chunkDocument>,
  over: Partial<{ visibility: string; publishedAt: number | null }> = {},
) =>
  new Map(
    chunks.map((c) => [
      c.chunkIndex,
      {
        contentHash: c.contentHash,
        visibility: over.visibility ?? c.visibility,
        publishedAt:
          over.publishedAt !== undefined
            ? over.publishedAt
            : toEpoch(c.publishedAt),
      },
    ]),
  )

describe('toEpoch', () => {
  it('normalizes a Date and an ISO string to the same number', () => {
    const iso = '2026-01-02T03:04:05.000Z'
    expect(toEpoch(new Date(iso))).toBe(toEpoch(iso))
  })

  it('treats null, undefined and empty string as no schedule', () => {
    expect(toEpoch(null)).toBeNull()
    expect(toEpoch(undefined)).toBeNull()
    expect(toEpoch('')).toBeNull()
  })

  it('returns null for an unparseable value rather than NaN', () => {
    expect(toEpoch('not a date')).toBeNull()
  })
})

describe('isContentUnchanged', () => {
  const chunks = chunkDocument('projects', project)

  it('is true when every hash matches and the count is identical', () => {
    expect(isContentUnchanged(chunks, storedFrom(chunks))).toBe(true)
  })

  it('is false when a hash differs', () => {
    const stored = new Map([
      [0, { contentHash: 'stale', visibility: 'public', publishedAt: null }],
    ])
    expect(isContentUnchanged(chunks, stored)).toBe(false)
  })

  it('is false when the stored COUNT differs — a shortened doc must re-sync', () => {
    const stored = storedFrom(chunks)
    stored.set(1, {
      contentHash: 'orphan',
      visibility: 'public',
      publishedAt: null,
    })
    expect(isContentUnchanged(chunks, stored)).toBe(false)
  })

  it('is false against an empty index', () => {
    expect(isContentUnchanged(chunks, new Map())).toBe(false)
  })

  it('ignores visibility entirely — that is hasMetadataDrift’s job', () => {
    // Folding visibility into the content hash would make a pure gating flip
    // pay for a re-embed, and would invalidate every existing row on upgrade.
    const stored = storedFrom(chunks, { visibility: 'gated' })
    expect(isContentUnchanged(chunks, stored)).toBe(true)
  })
})

describe('hasMetadataDrift', () => {
  const post = {
    id: 5,
    title: 'A',
    slug: 'a',
    _status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    content: { root: { children: [] } },
  }
  const chunks = chunkDocument('posts', post)

  it('is false when the stored rows already agree', () => {
    expect(hasMetadataDrift(chunks, storedFrom(chunks))).toBe(false)
  })

  it('DETECTS a public → gated flip', () => {
    const gated = chunkDocument('posts', {
      ...post,
      access: { visibility: 'gated' },
    })
    // The index still holds the public rows; content is byte-identical.
    expect(gated[0].contentHash).toBe(chunks[0].contentHash)
    expect(hasMetadataDrift(gated, storedFrom(chunks))).toBe(true)
  })

  it('DETECTS a gated → public flip', () => {
    const gated = chunkDocument('posts', {
      ...post,
      access: { visibility: 'gated' },
    })
    expect(hasMetadataDrift(chunks, storedFrom(gated))).toBe(true)
  })

  it('DETECTS a re-dated publishedAt', () => {
    const redated = chunkDocument('posts', {
      ...post,
      publishedAt: '2027-06-01T00:00:00.000Z',
    })
    expect(hasMetadataDrift(redated, storedFrom(chunks))).toBe(true)
  })

  it('does NOT report drift for equivalent Date vs ISO timestamps', () => {
    // Otherwise every save would rewrite every row forever.
    const stored = storedFrom(chunks, {
      publishedAt: toEpoch(new Date('2026-01-01T00:00:00.000Z')),
    })
    expect(hasMetadataDrift(chunks, stored)).toBe(false)
  })

  it('reports drift when a chunk index is missing from the index', () => {
    expect(hasMetadataDrift(chunks, new Map())).toBe(true)
  })
})

describe('updateDocumentMetadata', () => {
  it('updates only the two filter columns, for every row of the doc', async () => {
    const { db, sql } = fakeDb()

    await updateDocumentMetadata(
      db,
      'posts',
      7,
      'gated',
      '2026-01-01T00:00:00.000Z',
    )

    const { text, params } = sql()[0]
    expect(text).toContain('UPDATE "corvus_embeddings"')
    expect(text).toContain('SET "visibility" = $1')
    expect(text).toContain('"published_at" = $2::timestamptz')
    expect(text).toContain('"collection" = $3 AND "doc_id" = $4')
    // The vector is NOT touched — this path costs zero provider dollars.
    expect(text).not.toContain('"embedding"')
    expect(params).toEqual(['gated', '2026-01-01T00:00:00.000Z', 'posts', 7])
  })
})

describe('deleteDocumentEmbeddings', () => {
  it('deletes every row for one document, by bound parameters', async () => {
    const { db, sql } = fakeDb()
    await deleteDocumentEmbeddings(db, 'posts', 7)

    const { text, params } = sql()[0]
    expect(text).toContain('DELETE FROM "corvus_embeddings"')
    expect(text).toContain('"collection" = $1 AND "doc_id" = $2')
    expect(params).toEqual(['posts', 7])
  })
})

describe('upsertChunk', () => {
  it('upserts on the migration’s exact unique key', async () => {
    const { db, sql } = fakeDb()
    const [chunk] = chunkDocument('projects', project)

    await upsertChunk(db, chunk, [0.1, 0.2], 'text-embedding-3-small')

    const { text, params } = sql()[0]
    expect(text).toContain(
      'ON CONFLICT ("collection", "doc_id", "chunk_index") DO UPDATE SET',
    )
    expect(text).toContain('INSERT INTO "corvus_embeddings"')
    // The vector is a BOUND parameter cast to ::vector, never interpolated.
    expect(text).toContain('::vector')
    expect(params).toContain('[0.1,0.2]')
    expect(params).toContain('projects')
    expect(params).toContain(42)
  })

  it('writes the visibility and published_at the chunker derived', async () => {
    const { db, sql } = fakeDb()
    const [chunk] = chunkDocument('posts', {
      id: 3,
      title: 'Gated one',
      slug: 'g',
      _status: 'published',
      publishedAt: '2026-01-01T00:00:00.000Z',
      access: { visibility: 'gated' },
      content: { root: { children: [] } },
    })

    await upsertChunk(db, chunk, [0.5], 'text-embedding-3-small')

    const { params } = sql()[0]
    expect(params).toContain('gated')
    expect(params).toContain('2026-01-01T00:00:00.000Z')
  })
})

describe('syncDocumentEmbeddings', () => {
  /**
   * Metadata-only drift — the gated-content bypass this branch exists to close.
   *
   * `visibility` and `published_at` are DENORMALIZED per-row copies of the
   * source document, and they are exactly what the retrieval query filters on.
   * A public → gated flip changes no body text, so every content hash matches;
   * a hash-only skip would leave the rows saying `visibility = 'public'` and a
   * now-gated article's full text reachable by anonymous chat turns until some
   * unrelated body edit happened to rewrite them. These four cases pin the fix
   * AND its cost: the repair is an UPDATE, never an embed.
   */
  const gatablePost = {
    id: 5,
    title: 'Secret Sauce',
    slug: 'secret-sauce',
    _status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    content: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'the confidential body' }],
          },
        ],
      },
    },
  }

  /** The index as it would look holding `doc`'s rows. */
  const indexHolding = (doc: Record<string, unknown>) => ({
    rows: chunkDocument('posts', doc).map((c) => ({
      chunk_index: c.chunkIndex,
      content_hash: c.contentHash,
      visibility: c.visibility,
      published_at: c.publishedAt === null ? null : new Date(c.publishedAt),
      model: 'text-embedding-3-small',
    })),
  })

  it('public → gated with IDENTICAL content updates every row, with ZERO embed calls', async () => {
    const nowGated = { ...gatablePost, access: { visibility: 'gated' } }
    const { db, sql } = fakeDb([indexHolding(gatablePost)])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'posts',
      doc: nowGated,
    })

    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      written: 0,
      deleted: 0,
      metadataUpdated: chunkDocument('posts', nowGated).length,
      skipped: false,
    })

    const update = sql()[1]
    expect(update.text).toContain('UPDATE "corvus_embeddings"')
    expect(update.params).toEqual([
      'gated',
      '2026-01-01T00:00:00.000Z',
      'posts',
      5,
    ])
  })

  it('gated → public is symmetric', async () => {
    const wasGated = { ...gatablePost, access: { visibility: 'gated' } }
    const { db, sql } = fakeDb([indexHolding(wasGated)])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'posts',
      doc: gatablePost,
    })

    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(result.metadataUpdated).toBeGreaterThan(0)
    expect(sql()[1].params[0]).toBe('public')
  })

  it('a publishedAt re-dated into the future updates the stored schedule, with ZERO embed calls', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const rescheduled = { ...gatablePost, publishedAt: future }
    const { db, sql } = fakeDb([indexHolding(gatablePost)])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'posts',
      doc: rescheduled,
    })

    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(result.metadataUpdated).toBeGreaterThan(0)
    expect(sql()[1].params[1]).toBe(future)
  })

  it('unchanged content AND unchanged metadata still costs one SELECT and nothing else', async () => {
    const { db } = fakeDb([indexHolding(gatablePost)])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'posts',
      doc: gatablePost,
    })

    expect(result.skipped).toBe(true)
    expect(result.metadataUpdated).toBe(0)
    expect(embedChunksMock).not.toHaveBeenCalled()
    expect((db.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('SKIPS everything when content AND metadata already match (the SEO-tweak case)', async () => {
    const [chunk] = chunkDocument('projects', project)
    const { db } = fakeDb([
      {
        rows: [
          {
            chunk_index: 0,
            content_hash: chunk.contentHash,
            visibility: chunk.visibility,
            published_at: null,
            model: 'text-embedding-3-small',
          },
        ],
      },
    ])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'projects',
      doc: project,
    })

    expect(result).toEqual({
      written: 0,
      deleted: 0,
      metadataUpdated: 0,
      skipped: true,
    })
    expect(embedChunksMock).not.toHaveBeenCalled()
    // Exactly one statement: the SELECT. No UPDATE, no upsert.
    expect((db.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('reads the stored hashes BEFORE calling the provider', async () => {
    const { db } = fakeDb()
    embedChunksMock.mockResolvedValue([[0.1]])

    await syncDocumentEmbeddings({ db, collection: 'projects', doc: project })

    // First statement is the hash SELECT; the embed happens after it.
    const first = renderSql(
      (db.execute as ReturnType<typeof vi.fn>).mock.calls[0][0],
    )
    expect(first.text).toContain(
      'SELECT "chunk_index", "content_hash", "visibility", "published_at", "model"',
    )
    expect(embedChunksMock).toHaveBeenCalledTimes(1)
  })

  it('embeds and upserts when the content changed', async () => {
    const { db } = fakeDb([
      {
        rows: [
          {
            chunk_index: 0,
            content_hash: 'stale',
            visibility: 'public',
            published_at: null,
            model: 'text-embedding-3-small',
          },
        ],
      },
    ])
    embedChunksMock.mockResolvedValue([[0.1, 0.2]])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'projects',
      doc: project,
    })

    expect(result.written).toBe(1)
    expect(result.skipped).toBe(false)
    expect(embedChunksMock).toHaveBeenCalledWith(
      [expect.stringContaining('Project: Portfolio')],
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
  })

  it('DELETES the rows of an unpublished post instead of refreshing them', async () => {
    const { db, sql } = fakeDb()

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'posts',
      doc: { id: 9, title: 'Draft', _status: 'draft', content: null },
    })

    expect(result).toEqual({
      written: 0,
      deleted: 1,
      metadataUpdated: 0,
      skipped: false,
    })
    expect(embedChunksMock).not.toHaveBeenCalled()
    expect(sql()[0].text).toContain('DELETE FROM "corvus_embeddings"')
  })

  it('deletes rows for a document that now yields no chunks at all', async () => {
    const { db, sql } = fakeDb()

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'uses',
      doc: { id: 5 },
    })

    expect(result.deleted).toBe(1)
    expect(sql()[0].text).toContain('DELETE FROM "corvus_embeddings"')
  })

  it('deletes trailing chunks after writing, so a shortened doc leaves no orphans', async () => {
    const { db, sql } = fakeDb()
    embedChunksMock.mockResolvedValue([[0.1]])

    await syncDocumentEmbeddings({ db, collection: 'projects', doc: project })

    const last = sql().at(-1)!
    expect(last.text).toContain('"chunk_index" >= $3')
    expect(last.params).toEqual(['projects', 42, 1])
  })

  it('propagates a provider failure — the HOOK, not the store, swallows it', async () => {
    const { db } = fakeDb()
    embedChunksMock.mockRejectedValue(new Error('provider down'))

    await expect(
      syncDocumentEmbeddings({ db, collection: 'projects', doc: project }),
    ).rejects.toThrow('provider down')
  })

  it('refuses a document with no numeric id', async () => {
    const { db } = fakeDb()
    await expect(
      syncDocumentEmbeddings({
        db,
        collection: 'projects',
        doc: { title: 'x' },
      }),
    ).rejects.toThrow(/no numeric id/)
  })

  it('honours a caller-supplied abort signal', async () => {
    const { db } = fakeDb()
    embedChunksMock.mockResolvedValue([[0.1]])
    const signal = AbortSignal.timeout(50)

    await syncDocumentEmbeddings({
      db,
      collection: 'projects',
      doc: project,
      abortSignal: signal,
    })

    expect(embedChunksMock.mock.calls[0][1]).toEqual({ abortSignal: signal })
  })

  it('re-embeds after a model change even with identical content', async () => {
    const [chunk] = chunkDocument('projects', project)
    const { db } = fakeDb([
      {
        rows: [
          {
            chunk_index: 0,
            content_hash: chunk.contentHash,
            visibility: chunk.visibility,
            published_at: null,
            model: 'text-embedding-3-small',
          },
        ],
      },
    ])
    vi.stubEnv('AI_EMBEDDING_MODEL', 'text-embedding-3-large')
    embedChunksMock.mockResolvedValue([[0.9]])

    const result = await syncDocumentEmbeddings({
      db,
      collection: 'projects',
      doc: project,
    })

    expect(result.skipped).toBe(false)
    expect(embedChunksMock).toHaveBeenCalledTimes(1)
  })

  it('hashes exactly the text it embeds', async () => {
    const { db } = fakeDb()
    embedChunksMock.mockResolvedValue([[0.1]])

    await syncDocumentEmbeddings({ db, collection: 'projects', doc: project })

    const [[values]] = embedChunksMock.mock.calls as [[string[]]]
    const [chunk] = chunkDocument('projects', project)
    expect(chunk.contentHash).toBe(hashChunkContent(values[0]))
  })
})
