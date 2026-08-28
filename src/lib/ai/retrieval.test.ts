import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Retrieval: the SQL the visibility filter lives in, the similarity floor that
 * turns a miss into `[]`, and the never-rejects contract that makes the whole
 * feature dark-safe.
 *
 * The provider and the database are both stubbed; nothing here spends a token
 * or opens a connection.
 */
const embedQueryMock = vi.fn()

vi.mock('@/lib/ai/embeddings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/embeddings')>(
    '@/lib/ai/embeddings',
  )
  return {
    ...actual,
    embedQuery: (...args: unknown[]) => embedQueryMock(...args),
  }
})

const executeMock = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    db: { drizzle: { execute: (...args: unknown[]) => executeMock(...args) } },
  })),
}))

import {
  CORVUS_SIMILARITY_FLOOR,
  DEFAULT_RETRIEVAL_TOP_K,
  RETRIEVAL_OVERFETCH_FACTOR,
  applySimilarityFloor,
  buildRetrievalQuery,
  extractRetrievalQuery,
  getRetrievalTopK,
  isRetrievalDisabled,
  retrieveCorvusContext,
  toRows,
} from '@/lib/ai/retrieval'

/**
 * Render a drizzle SQL fragment to `{ text, params }`.
 *
 * @remarks Drizzle stores literal segments as `StringChunk` (whose `value` is
 * a string array) and embedded values as the raw values themselves, converted
 * to bound parameters by the dialect at execution time. Walking the chunks is
 * how this test asserts the exact predicate text AND that every value is
 * BOUND rather than interpolated — the property that matters for a query whose
 * inputs include a user-controlled embedding.
 */
const renderSql = (fragment: unknown) => {
  const chunks = (fragment as { queryChunks: unknown[] }).queryChunks
  const params: unknown[] = []
  let text = ''
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown } | null)?.value
    if (Array.isArray(value)) {
      text += (value as string[]).join('')
    } else {
      params.push(chunk)
      text += `$${params.length}`
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), params }
}

const row = (over: Record<string, unknown> = {}) => ({
  collection: 'posts',
  title: 'T',
  content: 'body',
  source_url: '/articles/t',
  score: 0.9,
  ...over,
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('buildRetrievalQuery — the gating filter', () => {
  it('binds every value as a parameter and never interpolates the vector', () => {
    const { text, params } = renderSql(
      buildRetrievalQuery('[0.1,0.2]', false, 20),
    )

    expect(text).not.toContain('0.1,0.2')
    expect(params).toEqual(['[0.1,0.2]', false, '[0.1,0.2]', 20])
  })

  it('carries the visibility disjunction verbatim', () => {
    const { text } = renderSql(buildRetrievalQuery('[1]', false, 20))
    expect(text).toContain(`::boolean OR "visibility" = 'public'`)
  })

  it('excludes scheduled-future rows but keeps NULL published_at', () => {
    const { text } = renderSql(buildRetrievalQuery('[1]', false, 20))
    expect(text).toContain(`"published_at" IS NULL OR "published_at" <= now()`)
  })

  it('uses the cosine operator the HNSW index was built with', () => {
    const { text } = renderSql(buildRetrievalQuery('[1]', false, 20))
    // `<=>` is vector_cosine_ops; `<->`/`<#>` would silently stop using the
    // index the migration created.
    expect(text).toContain('"embedding" <=>')
    expect(text).not.toContain('<->')
    expect(text).not.toContain('<#>')
    expect(text).toContain(`1 - ("embedding" <=> $1::vector) AS "score"`)
  })

  it('reads from corvus_embeddings and orders by distance ascending', () => {
    const { text } = renderSql(buildRetrievalQuery('[1]', false, 20))
    expect(text).toContain('FROM "corvus_embeddings"')
    expect(text).toContain('ORDER BY "embedding" <=> $3::vector')
    expect(text).toContain('LIMIT $4')
  })

  describe('boolean truth table for the visibility predicate', () => {
    // The disjunction is the whole gate. Anonymous MUST bind false (which
    // collapses it to `visibility = 'public'`); signed-in binds true (which
    // short-circuits it). A regression either way is a gated-content bypass.
    it.each([
      { isAuthenticated: false, bound: false },
      { isAuthenticated: true, bound: true },
    ])(
      'isAuthenticated=$isAuthenticated binds $bound',
      ({ isAuthenticated, bound }) => {
        const { params } = renderSql(
          buildRetrievalQuery('[1]', isAuthenticated, 20),
        )
        expect(params[1]).toBe(bound)
      },
    )

    it('never binds a truthy non-boolean for an anonymous turn', () => {
      const { params } = renderSql(buildRetrievalQuery('[1]', false, 20))
      expect(params[1]).not.toBeTruthy()
      expect(typeof params[1]).toBe('boolean')
    })
  })
})

describe('applySimilarityFloor', () => {
  it('drops everything below the floor — a total miss yields []', () => {
    const rows = [row({ score: 0.2 }), row({ score: 0.1 }), row({ score: 0 })]
    expect(applySimilarityFloor(rows, 5)).toEqual([])
  })

  it('keeps rows at or above the floor', () => {
    const rows = [
      row({ score: CORVUS_SIMILARITY_FLOOR }),
      row({ score: CORVUS_SIMILARITY_FLOOR - 0.0001 }),
    ]
    expect(applySimilarityFloor(rows, 5)).toHaveLength(1)
  })

  it('truncates the over-fetched set to topK, best first', () => {
    const rows = [
      row({ score: 0.5, content: 'c' }),
      row({ score: 0.9, content: 'a' }),
      row({ score: 0.7, content: 'b' }),
    ]
    const result = applySimilarityFloor(rows, 2)
    expect(result.map((s) => s.content)).toEqual(['a', 'b'])
  })

  it('maps snake_case source_url onto camelCase sourceUrl', () => {
    const [snippet] = applySimilarityFloor([row()], 5)
    expect(snippet.sourceUrl).toBe('/articles/t')
  })

  it('tolerates a null title and a null source_url', () => {
    const [snippet] = applySimilarityFloor(
      [row({ title: null, source_url: null })],
      5,
    )
    expect(snippet.title).toBeNull()
    expect(snippet.sourceUrl).toBeNull()
  })

  it('discards rows with empty content or a non-numeric score', () => {
    const rows = [row({ content: '' }), row({ score: 'NaN' })]
    expect(applySimilarityFloor(rows, 5)).toEqual([])
  })

  it('accepts an explicit floor override', () => {
    expect(applySimilarityFloor([row({ score: 0.2 })], 5, 0.1)).toHaveLength(1)
  })
})

describe('toRows', () => {
  it('unwraps a node-postgres QueryResult', () => {
    expect(toRows({ rows: [{ a: 1 }] })).toEqual([{ a: 1 }])
  })

  it('accepts a bare array', () => {
    expect(toRows([{ a: 1 }])).toEqual([{ a: 1 }])
  })

  it('returns [] for an unrecognized shape rather than throwing', () => {
    expect(toRows(null)).toEqual([])
    expect(toRows({ rowCount: 0 })).toEqual([])
  })
})

describe('configuration', () => {
  it('defaults topK to 5', () => {
    expect(getRetrievalTopK()).toBe(DEFAULT_RETRIEVAL_TOP_K)
  })

  it('reads CORVUS_RETRIEVAL_TOP_K', () => {
    vi.stubEnv('CORVUS_RETRIEVAL_TOP_K', '3')
    expect(getRetrievalTopK()).toBe(3)
  })

  it('ignores a nonsense or non-positive topK', () => {
    vi.stubEnv('CORVUS_RETRIEVAL_TOP_K', 'lots')
    expect(getRetrievalTopK()).toBe(5)
    vi.stubEnv('CORVUS_RETRIEVAL_TOP_K', '-2')
    expect(getRetrievalTopK()).toBe(5)
  })

  it('is off ONLY for the exact string "true"', () => {
    expect(isRetrievalDisabled()).toBe(false)
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', '')
    expect(isRetrievalDisabled()).toBe(false)
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', 'false')
    expect(isRetrievalDisabled()).toBe(false)
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', '1')
    expect(isRetrievalDisabled()).toBe(false)
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', 'true')
    expect(isRetrievalDisabled()).toBe(true)
  })
})

describe('extractRetrievalQuery', () => {
  const user = (text: string) => ({
    role: 'user',
    parts: [{ type: 'text', text }],
  })

  it('takes the LATEST user turn, not the whole conversation', () => {
    expect(
      extractRetrievalQuery([
        user('first question'),
        { role: 'assistant', parts: [{ type: 'text', text: 'an answer' }] },
        user('second question'),
      ]),
    ).toBe('second question')
  })

  it('joins multiple text parts of one turn', () => {
    expect(
      extractRetrievalQuery([
        {
          role: 'user',
          parts: [
            { type: 'text', text: 'where has' },
            { type: 'text', text: 'brandon worked' },
          ],
        },
      ]),
    ).toBe('where has brandon worked')
  })

  it('skips non-text parts', () => {
    expect(
      extractRetrievalQuery([
        {
          role: 'user',
          parts: [
            { type: 'file', url: 'x' },
            { type: 'text', text: 'hello' },
          ],
        },
      ]),
    ).toBe('hello')
  })

  it('falls back to an earlier user turn when the latest has no text', () => {
    expect(
      extractRetrievalQuery([user('earlier'), { role: 'user', parts: [] }]),
    ).toBe('earlier')
  })

  it('returns empty for no user turns at all', () => {
    expect(extractRetrievalQuery([])).toBe('')
    expect(extractRetrievalQuery([{ role: 'assistant', parts: [] }])).toBe('')
  })

  it('never throws on malformed input', () => {
    expect(extractRetrievalQuery([null, undefined, 42, { role: 'user' }])).toBe(
      '',
    )
  })
})

describe('retrieveCorvusContext — never rejects', () => {
  it('returns snippets on the happy path', async () => {
    embedQueryMock.mockResolvedValue([0.1, 0.2])
    executeMock.mockResolvedValue({ rows: [row({ score: 0.9 })] })

    const result = await retrieveCorvusContext({
      query: 'work history',
      isAuthenticated: false,
    })

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('body')
  })

  it('over-fetches topK × 4 so the similarity floor is meaningful', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [] })

    await retrieveCorvusContext({
      query: 'q',
      isAuthenticated: false,
      topK: 5,
    })

    const { params } = renderSql(executeMock.mock.calls[0][0])
    expect(params[3]).toBe(5 * RETRIEVAL_OVERFETCH_FACTOR)
  })

  it('short-circuits on the kill switch BEFORE embedding or querying', async () => {
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', 'true')

    expect(
      await retrieveCorvusContext({ query: 'q', isAuthenticated: true }),
    ).toEqual([])
    expect(embedQueryMock).not.toHaveBeenCalled()
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('short-circuits on an empty query without calling the provider', async () => {
    expect(
      await retrieveCorvusContext({ query: '   ', isAuthenticated: false }),
    ).toEqual([])
    expect(embedQueryMock).not.toHaveBeenCalled()
  })

  it('returns [] when the provider throws', async () => {
    embedQueryMock.mockRejectedValue(new Error('provider down'))
    await expect(
      retrieveCorvusContext({ query: 'q', isAuthenticated: false }),
    ).resolves.toEqual([])
  })

  it('returns [] when the database throws', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockRejectedValue(new Error('relation does not exist'))
    await expect(
      retrieveCorvusContext({ query: 'q', isAuthenticated: false }),
    ).resolves.toEqual([])
  })

  it('returns [] for an EMPTY table', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [] })
    await expect(
      retrieveCorvusContext({ query: 'q', isAuthenticated: false }),
    ).resolves.toEqual([])
  })

  it('returns [] when every row is below the floor — the query MISSED', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({
      rows: [row({ score: 0.05 }), row({ score: 0.02 })],
    })
    await expect(
      retrieveCorvusContext({ query: 'q', isAuthenticated: false }),
    ).resolves.toEqual([])
  })

  it('bounds the embedding call with an abort signal', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [] })

    await retrieveCorvusContext({ query: 'q', isAuthenticated: false })

    const options = embedQueryMock.mock.calls[0][1] as {
      abortSignal: AbortSignal
    }
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('passes the viewer auth state straight into the bound parameter', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [] })

    await retrieveCorvusContext({ query: 'q', isAuthenticated: true })
    expect(renderSql(executeMock.mock.calls[0][0]).params[1]).toBe(true)

    executeMock.mockClear()
    await retrieveCorvusContext({ query: 'q', isAuthenticated: false })
    expect(renderSql(executeMock.mock.calls[0][0]).params[1]).toBe(false)
  })
})
