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

import { ABOUT_CORVUS_COLLECTION } from '@/lib/ai/aboutCorvus'
import type { CorvusSnippet } from '@/lib/ai/retrieval'
import {
  CORVUS_SIMILARITY_FLOOR,
  isSiteSubjectQuestion,
  markSiteSubject,
  DEFAULT_RETRIEVAL_TOP_K,
  RETRIEVAL_OVERFETCH_FACTOR,
  RETRIEVAL_QUERY_TIMEOUT_MS,
  applySimilarityFloor,
  buildRetrievalQuery,
  extractRetrievalQuery,
  getRetrievalTopK,
  isRetrievalDisabled,
  retrieveCorvusContext,
  toRows,
  withTimeout,
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

describe('withTimeout', () => {
  it('passes a value through when the work settles in time', async () => {
    await expect(
      withTimeout(Promise.resolve('ok'), 1_000, 'late'),
    ).resolves.toBe('ok')
  })

  it('passes the original rejection through, not the timeout message', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('real failure')), 1_000, 'late'),
    ).rejects.toThrow('real failure')
  })

  it('rejects with the given message once the bound elapses', async () => {
    vi.useFakeTimers()
    try {
      // Attach the rejection handler BEFORE advancing the clock: the timer
      // fires inside `advanceTimersByTimeAsync`, and a promise that rejects
      // with nothing listening yet is reported as an unhandled rejection.
      const assertion = expect(
        withTimeout(new Promise(() => {}), 500, 'too slow'),
      ).rejects.toThrow('too slow')
      await vi.advanceTimersByTimeAsync(501)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears its timer on the success path so the event loop can drain', async () => {
    vi.useFakeTimers()
    try {
      const clear = vi.spyOn(globalThis, 'clearTimeout')
      await withTimeout(Promise.resolve('ok'), 1_000, 'late')
      expect(clear).toHaveBeenCalled()
      clear.mockRestore()
    } finally {
      vi.useRealTimers()
    }
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

  /**
   * Retrieval is awaited BEFORE `streamText`, so an unbounded vector query
   * does not just make retrieval slow — it holds time-to-first-token for the
   * whole answer up to the route's `maxDuration = 60`. The embedding call was
   * already bounded; this pins the other half, and pins that hitting the
   * bound degrades to an ungrounded answer rather than failing the turn.
   */
  it('gives up on a HANGING query and degrades to ungrounded', async () => {
    vi.useFakeTimers()
    try {
      embedQueryMock.mockResolvedValue([0.1])
      // Never settles: exactly the case an abort signal cannot reach, because
      // drizzle's `execute` takes none.
      executeMock.mockReturnValue(new Promise(() => {}))

      const assertion = expect(
        retrieveCorvusContext({ query: 'q', isAuthenticated: false }),
      ).resolves.toEqual([])
      await vi.advanceTimersByTimeAsync(RETRIEVAL_QUERY_TIMEOUT_MS + 1)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT time out a query that answers inside the bound', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [row({ score: 0.9 })] })

    await expect(
      retrieveCorvusContext({ query: 'q', isAuthenticated: false }),
    ).resolves.toHaveLength(1)
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

/**
 * The about-Corvus passage, offered rather than retrieved (#167).
 *
 * @remarks It is a pure decision about the QUESTION, not about an embedding
 * neighbourhood — which is exactly why it is testable here, with no provider
 * key and no Postgres, and why the daily-driver retrieval boost #165 floated
 * is not.
 */
describe('retrieveCorvusContext — the about-Corvus passage (#167)', () => {
  it('leads the context on a question addressed to Corvus', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [row({ score: 0.9 })] })

    const result = await retrieveCorvusContext({
      query: 'What tech do you use?',
      isAuthenticated: false,
    })

    expect(result[0].collection).toBe(ABOUT_CORVUS_COLLECTION)
    expect(result).toHaveLength(2)
  })

  it('answers even when the provider is down', async () => {
    // The one subject where an ungrounded turn has no excuse: the answer was
    // never in the database, so a provider outage is no reason to lose it.
    embedQueryMock.mockRejectedValue(new Error('provider down'))

    const result = await retrieveCorvusContext({
      query: 'What are you built with?',
      isAuthenticated: false,
    })

    expect(result).toHaveLength(1)
    expect(result[0].collection).toBe(ABOUT_CORVUS_COLLECTION)
  })

  it('answers even when the database is down', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockRejectedValue(new Error('relation does not exist'))

    const result = await retrieveCorvusContext({
      query: 'What model do you run on?',
      isAuthenticated: false,
    })

    expect(result[0].collection).toBe(ABOUT_CORVUS_COLLECTION)
  })

  it('answers even when the vector query returns nothing at all', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [] })

    const result = await retrieveCorvusContext({
      query: 'What are you made with?',
      isAuthenticated: false,
    })

    expect(result).toHaveLength(1)
  })

  it('stays out of a question about Brandon or the site', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [row({ score: 0.9 })] })

    const brandon = await retrieveCorvusContext({
      query: 'What technologies does Brandon use?',
      isAuthenticated: false,
    })
    const site = await retrieveCorvusContext({
      query: 'What does this site run on?',
      isAuthenticated: false,
    })

    expect(brandon.map((s) => s.collection)).not.toContain(
      ABOUT_CORVUS_COLLECTION,
    )
    expect(site.map((s) => s.collection)).not.toContain(ABOUT_CORVUS_COLLECTION)
  })

  it('respects the kill switch — a one-flag revert stays one flag', async () => {
    // `CORVUS_DISABLE_RETRIEVAL` is documented as a true revert to the pre-#82
    // chat path. A flag that left one passage behind would not be that.
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', 'true')

    expect(
      await retrieveCorvusContext({
        query: 'What tech do you use?',
        isAuthenticated: false,
      }),
    ).toEqual([])
  })

  it('still returns [] for an empty query', async () => {
    expect(
      await retrieveCorvusContext({ query: '   ', isAuthenticated: false }),
    ).toEqual([])
  })

  it('leaves the ungrounded contract intact for everything else', async () => {
    // The #82 invariant this sits directly upstream of: a turn that retrieves
    // nothing and is not about Corvus still hands `buildGroundedSystem` an
    // empty array.
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({ rows: [] })

    expect(
      await retrieveCorvusContext({
        query: 'Where has Brandon worked?',
        isAuthenticated: false,
      }),
    ).toEqual([])
  })
})

/**
 * Classifying the "this site" subject from the QUESTION (#167 addendum).
 *
 * @remarks Gating the prompt rule on retrieved passages alone left the
 * ticket's own failing case uncovered — "what tech was this site built on?"
 * with no repository in the top-k. This classifier is the second trigger, and
 * it is pure, so the case that has no repository is testable without one.
 */
describe('isSiteSubjectQuestion (#167 addendum)', () => {
  it.each([
    'What tech was this site built on?',
    'What does this site run on?',
    'What is this site built with?',
    'What powers this site?',
    'What is under the hood on this site?',
    'What is this website made with?',
    'What stack is brandonperfetti.com built on?',
  ])('classifies %s as the site subject', (query) => {
    expect(isSiteSubjectQuestion(query)).toBe(true)
  })

  it.each([
    ['What technologies does Brandon use?', "#147's mirror case"],
    ['What tech do you use?', 'addressed to Corvus'],
    ['What was TopTimelines built with?', 'a project, not this site'],
    ['What is this site about?', 'a referent with no stack phrase'],
    ['Where has Brandon worked?', 'unrelated'],
    ['', 'empty'],
  ])('does not claim %s (%s)', (query) => {
    expect(isSiteSubjectQuestion(query)).toBe(false)
  })

  it('requires BOTH a site referent and a stack phrase', () => {
    // Either half alone is a different question, and marking it would put a
    // three-way subject rule in front of a turn that has no subject to pick.
    expect(isSiteSubjectQuestion('what is the stack')).toBe(false)
    expect(isSiteSubjectQuestion('tell me about this site')).toBe(false)
  })

  it('handles a missing query without throwing', () => {
    expect(isSiteSubjectQuestion(null)).toBe(false)
    expect(isSiteSubjectQuestion(undefined)).toBe(false)
  })
})

describe('markSiteSubject (#167 addendum)', () => {
  const s = (over: Partial<CorvusSnippet> = {}): CorvusSnippet => ({
    collection: 'projects',
    title: 'Portfolio',
    content: 'body',
    sourceUrl: '/projects',
    score: 0.5,
    ...over,
  })

  it('stamps the passages for a site-stack question', () => {
    const marked = markSiteSubject('What tech was this site built on?', [s()])
    expect(marked[0].questionSubject).toBe('site')
  })

  it('leaves other questions unmarked', () => {
    expect(
      markSiteSubject('What technologies does Brandon use?', [s()])[0]
        .questionSubject,
    ).toBeUndefined()
  })

  it('copies rather than mutating what it was handed', () => {
    const snippets = [s()]
    markSiteSubject('What powers this site?', snippets)
    expect(snippets[0].questionSubject).toBeUndefined()
  })

  it('keeps the empty contract', () => {
    expect(markSiteSubject('What powers this site?', [])).toEqual([])
  })
})

describe('retrieveCorvusContext — marking the site subject (#167 addendum)', () => {
  it('marks the passages a site-stack question came back with', async () => {
    // The measured gap: the passages here are a project entry and a tech-stack
    // row, exactly the wrong two sources, and no repository at all.
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({
      rows: [row({ score: 0.5, collection: 'projects' })],
    })

    const result = await retrieveCorvusContext({
      query: 'What tech was this site built on?',
      isAuthenticated: false,
    })

    expect(result[0].questionSubject).toBe('site')
  })

  it('does not mark an unrelated question with the same passages', async () => {
    embedQueryMock.mockResolvedValue([0.1])
    executeMock.mockResolvedValue({
      rows: [row({ score: 0.5, collection: 'projects' })],
    })

    const result = await retrieveCorvusContext({
      query: 'What projects has Brandon shipped?',
      isAuthenticated: false,
    })

    expect(result[0].questionSubject).toBeUndefined()
  })
})
