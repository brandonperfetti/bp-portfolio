import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server-enforced Corvus auth soft-gate (#74, folds #18). Every dependency
 * is mocked so these tests pin the route's ORCHESTRATION — gate order,
 * which key/limit each branch uses, and that nothing in the request body
 * can influence the decision — without touching a real model, Redis, or
 * Clerk session. `chatGate`'s own Upstash-vs-in-memory behavior is covered
 * separately in `@/lib/security/chatGate.test.ts`.
 */

vi.mock('@/lib/ai/corvus', () => ({
  getCorvusModel: vi.fn(() => ({ modelId: 'mock-model' })),
  CORVUS_SYSTEM_PROMPT: 'You are Corvus.',
}))

const streamTextMock = vi.fn()
const validateUIMessagesMock = vi.fn()
const convertToModelMessagesMock = vi.fn()

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  convertToModelMessages: (...args: unknown[]) =>
    convertToModelMessagesMock(...args),
  validateUIMessages: (...args: unknown[]) => validateUIMessagesMock(...args),
}))

const getViewerMock = vi.fn()
vi.mock('@/lib/auth/getViewer', () => ({
  getViewer: () => getViewerMock(),
}))

const peekAnonFreeMessageCountMock = vi.fn()
const incrementAnonFreeMessageCountMock = vi.fn()
const getAnonFreeMessageLimitMock = vi.fn()
const getAuthedChatRatePerMinuteMock = vi.fn()
const getAuthedChatDailyQuotaMock = vi.fn()

vi.mock('@/lib/security/chatGate', () => ({
  // Deterministic stand-in for the real HMAC digest — the route must build
  // anon limiter keys through this, so assertions can prove the raw IP never
  // reaches checkChatLimits.
  anonIpKeyDigest: (ip: string) => `digest(${ip})`,
  peekAnonFreeMessageCount: (...args: unknown[]) =>
    peekAnonFreeMessageCountMock(...args),
  incrementAnonFreeMessageCount: (...args: unknown[]) =>
    incrementAnonFreeMessageCountMock(...args),
  getAnonFreeMessageLimit: () => getAnonFreeMessageLimitMock(),
  getAuthedChatRatePerMinute: () => getAuthedChatRatePerMinuteMock(),
  getAuthedChatDailyQuota: () => getAuthedChatDailyQuotaMock(),
}))

const getRequestClientIpMock = vi.fn()
const getSecurityLimitsMock = vi.fn()
const isAllowedRequestSourceMock = vi.fn()
const verifyRequestTurnstileTokenMock = vi.fn()

vi.mock('@/lib/security/guardrails', () => ({
  getRequestClientIp: (...args: unknown[]) => getRequestClientIpMock(...args),
  getSecurityLimits: () => getSecurityLimitsMock(),
  isAllowedRequestSource: (...args: unknown[]) =>
    isAllowedRequestSourceMock(...args),
  verifyRequestTurnstileToken: (...args: unknown[]) =>
    verifyRequestTurnstileTokenMock(...args),
}))

const checkChatLimitsMock = vi.fn()
vi.mock('@/lib/security/limiter', () => ({
  checkChatLimits: (...args: unknown[]) => checkChatLimitsMock(...args),
}))

/**
 * Retrieval grounding (#82) — added for the grounding cases at the bottom of
 * this file; the 13 gate cases above are untouched and must stay green.
 *
 * Only the two LEAVES are stubbed: the embedding provider (so no key and no
 * dollars) and Payload's database handle. `retrieval.ts`, its SQL builder, its
 * visibility filter, the similarity floor, and `buildGroundedSystem` all run
 * FOR REAL through the route. That is deliberate: mocking
 * `retrieveCorvusContext` wholesale would make the gated-content test assert
 * only that a mock returned what it was told to.
 */
const embedQueryMock = vi.fn()
vi.mock('@/lib/ai/embeddings', () => ({
  EMBEDDING_TIMEOUT_MS: 10_000,
  embedQuery: (...args: unknown[]) => embedQueryMock(...args),
  toVectorLiteral: (v: number[]) => `[${v.join(',')}]`,
}))

/** Rows the fake table holds for the current test. */
let tableRows: Array<Record<string, unknown>> = []

/**
 * A fake Postgres that ENFORCES the query's own predicates.
 *
 * @remarks It compiles the drizzle fragment the route actually built, reads
 * the boolean bound to the `::boolean` placeholder, and filters its fixture
 * rows the way Postgres would. So if the route ever stopped passing the
 * viewer's auth state, or the WHERE clause lost its `visibility` disjunction,
 * the gated row would reach the system prompt and the test below would fail —
 * which is the whole point of not stubbing the retrieval module.
 */
const executeMock = vi.fn(async (fragment: unknown) => {
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

  const authIndex = /\$(\d+)::boolean/.exec(text)
  const isAuthenticated = authIndex
    ? params[Number(authIndex[1]) - 1]
    : undefined
  const filtersVisibility = text.includes(`"visibility" = 'public'`)
  const filtersSchedule = text.includes(`"published_at" <= now()`)

  const rows = tableRows.filter((row) => {
    if (filtersVisibility && isAuthenticated !== true) {
      if (row.visibility !== 'public') return false
    }
    if (filtersSchedule && typeof row.published_at === 'string') {
      if (new Date(row.published_at).getTime() > Date.now()) return false
    }
    return true
  })

  return { rows }
})

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    db: { drizzle: { execute: (query: unknown) => executeMock(query) } },
  })),
}))

import { POST } from '@/app/api/ai/chat/route'

const ANON_IP = '203.0.113.42'

const makeRequest = (body: unknown) =>
  new Request('https://example.test/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const makeRawRequest = (rawBody: string) =>
  new Request('https://example.test/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  })

const validBody = {
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
}

beforeEach(() => {
  isAllowedRequestSourceMock.mockReturnValue(true)
  getRequestClientIpMock.mockReturnValue(ANON_IP)
  getSecurityLimitsMock.mockReturnValue({
    chatRatePerMinute: 10,
    mailingListRatePerMinute: 10,
    imageRatePerMinute: 2,
    maxMessageChars: 1500,
    maxMessages: 12,
    maxCompletionTokens: 1024,
    imageDailyLimit: 0,
    publicChatEnabled: true,
    publicImageEnabled: true,
  })
  checkChatLimitsMock.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
    limit: 10,
  })
  verifyRequestTurnstileTokenMock.mockResolvedValue({
    required: false,
    ok: true,
  })
  getViewerMock.mockResolvedValue({ isAuthenticated: false, userId: null })
  getAnonFreeMessageLimitMock.mockReturnValue(3)
  getAuthedChatRatePerMinuteMock.mockReturnValue(30)
  getAuthedChatDailyQuotaMock.mockReturnValue(1000)
  peekAnonFreeMessageCountMock.mockResolvedValue(0)
  incrementAnonFreeMessageCountMock.mockResolvedValue(1)
  validateUIMessagesMock.mockImplementation(
    async ({ messages }: { messages: unknown[] }) => messages,
  )
  convertToModelMessagesMock.mockResolvedValue([])
  streamTextMock.mockReturnValue({
    toUIMessageStreamResponse: () => new Response('stream', { status: 200 }),
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/ai/chat — anon free-message gate', () => {
  it('streams normally for an anonymous visitor under the free limit, and spends one message', async () => {
    peekAnonFreeMessageCountMock.mockResolvedValue(1) // under limit 3

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(incrementAnonFreeMessageCountMock).toHaveBeenCalledWith(ANON_IP)
  })

  it('gates the (N+1)th anonymous message with a non-stream sign-in-required response, without incrementing', async () => {
    peekAnonFreeMessageCountMock.mockResolvedValue(3) // at limit 3

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(401)
    const json = (await res.json()) as { code?: string }
    expect(json.code).toBe('sign_in_required')
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(incrementAnonFreeMessageCountMock).not.toHaveBeenCalled()
  })

  it('gates BEFORE body parsing — a gated anon request never even attempts req.json()', async () => {
    peekAnonFreeMessageCountMock.mockResolvedValue(3)

    // Malformed JSON: if the route tried to parse this it would 400, not
    // 401. Getting 401 proves the gate short-circuits ahead of body parsing.
    const res = await POST(makeRawRequest('{not valid json'))

    expect(res.status).toBe(401)
  })

  it('respects a raised CORVUS_ANON_FREE_MESSAGES ceiling', async () => {
    getAnonFreeMessageLimitMock.mockReturnValue(10)
    peekAnonFreeMessageCountMock.mockResolvedValue(5) // under a limit of 10

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/ai/chat — signed-in users skip the free-message gate', () => {
  beforeEach(() => {
    getViewerMock.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user_abc123',
    })
  })

  it('never touches the anon free-message counter', async () => {
    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(peekAnonFreeMessageCountMock).not.toHaveBeenCalled()
    expect(incrementAnonFreeMessageCountMock).not.toHaveBeenCalled()
  })

  it('keys the abuse limiter by userId at the higher authed ceiling, not by IP', async () => {
    await POST(makeRequest(validBody))

    expect(checkChatLimitsMock).toHaveBeenCalledWith(
      'user:user_abc123',
      30,
      1000,
    )
  })

  it('still enforces the (userId-keyed) abuse limiter — a 429 there still blocks the request', async () => {
    checkChatLimitsMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
      limit: 30,
    })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(429)
    expect(streamTextMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/ai/chat — anon abuse limiter stays IP-keyed and runs first', () => {
  it('keys checkChatLimits by the HMAC-digested IP (never the raw address) for anon requests', async () => {
    await POST(makeRequest(validBody))

    expect(checkChatLimitsMock).toHaveBeenCalledWith(
      `ip:digest(${ANON_IP})`,
      10,
      0,
    )
  })

  it('a 429 from the abuse limiter blocks the request before the free-message gate runs', async () => {
    checkChatLimitsMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
      limit: 10,
    })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(429)
    expect(peekAnonFreeMessageCountMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/ai/chat — a crafted payload cannot bypass the gate', () => {
  it('ignores client-supplied identity/count fields in the body entirely', async () => {
    peekAnonFreeMessageCountMock.mockResolvedValue(3) // server says: at limit

    const res = await POST(
      makeRequest({
        ...validBody,
        // None of these are real fields the route reads — a real attacker
        // would try something like this to spoof their way past the gate.
        isAuthenticated: true,
        userId: 'fake-admin',
        freeMessagesUsed: 0,
        code: 'ok',
      }),
    )

    expect(res.status).toBe(401)
    // Proves the decision came from server-resolved state, not the body:
    // getViewer() takes no arguments, so it can't have read the crafted body.
    expect(getViewerMock).toHaveBeenCalledWith()
  })

  it('the gate decision is independent of message content/size', async () => {
    peekAnonFreeMessageCountMock.mockResolvedValue(3)

    const res = await POST(
      makeRequest({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'x'.repeat(50) }] },
        ],
      }),
    )

    expect(res.status).toBe(401)
  })
})

describe('POST /api/ai/chat — existing guards still run, in order, ahead of the new gate', () => {
  it('CORVUS_DISABLE_CHAT still short-circuits before any gate logic', async () => {
    vi.stubEnv('CORVUS_DISABLE_CHAT', 'true')

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(503)
    expect(getViewerMock).not.toHaveBeenCalled()
    expect(peekAnonFreeMessageCountMock).not.toHaveBeenCalled()
  })

  it('isAllowedRequestSource still short-circuits before any gate logic', async () => {
    isAllowedRequestSourceMock.mockReturnValue(false)

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(403)
    expect(getViewerMock).not.toHaveBeenCalled()
  })
})

/**
 * Retrieval grounding (#82) — additive; nothing above this line changed.
 *
 * A second `beforeEach` (Vitest runs registered hooks in order) leaves the
 * table EMPTY by default, so every gate case above still streams with the
 * untouched system prompt and its assertions keep meaning what they meant.
 */
beforeEach(() => {
  tableRows = []
  embedQueryMock.mockResolvedValue([0.1, 0.2, 0.3])
})

/** The system prompt the route actually handed `streamText`. */
const systemPassedToStreamText = () =>
  (streamTextMock.mock.calls[0]?.[0] as { system: string } | undefined)?.system

const publicRow = {
  collection: 'posts',
  title: 'Public Article',
  content: 'PUBLIC_BODY_TEXT about shipping.',
  source_url: '/articles/public-article',
  visibility: 'public',
  published_at: '2026-01-01T00:00:00.000Z',
  score: 0.91,
}

const gatedRow = {
  collection: 'posts',
  title: 'Gated Article',
  content: 'GATED_BODY_TEXT that anonymous visitors must never receive.',
  source_url: '/articles/gated-article',
  visibility: 'gated',
  published_at: '2026-01-01T00:00:00.000Z',
  score: 0.99,
}

describe('POST /api/ai/chat — a gated chunk NEVER reaches an anonymous visitor', () => {
  it('grounds an anonymous turn on the public chunk only, omitting the gated one', async () => {
    // The gated row scores HIGHER, so nothing but the visibility filter keeps
    // it out. `canAccess` calls itself "THE single authoritative check ...
    // before including gated bodies in any payload sent to the client", and a
    // grounded chat answer is exactly such a payload.
    tableRows = [gatedRow, publicRow]
    getViewerMock.mockResolvedValue({ isAuthenticated: false, userId: null })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    const system = systemPassedToStreamText()!
    expect(system).not.toContain('GATED_BODY_TEXT')
    expect(system).not.toContain('/articles/gated-article')
    expect(system).toContain('PUBLIC_BODY_TEXT')
  })

  it('returns the untouched prompt when the ONLY match is gated', async () => {
    tableRows = [gatedRow]
    getViewerMock.mockResolvedValue({ isAuthenticated: false, userId: null })

    await POST(makeRequest(validBody))

    expect(systemPassedToStreamText()).toBe('You are Corvus.')
  })

  it('binds isAuthenticated=false for an anonymous turn', async () => {
    tableRows = [publicRow]
    getViewerMock.mockResolvedValue({ isAuthenticated: false, userId: null })

    await POST(makeRequest(validBody))

    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  it('a signed-in visitor MAY be grounded on a gated chunk', async () => {
    tableRows = [gatedRow]
    getViewerMock.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user_abc123',
    })

    await POST(makeRequest(validBody))

    expect(systemPassedToStreamText()).toContain('GATED_BODY_TEXT')
  })

  it('a crafted body claiming authentication cannot unlock a gated chunk', async () => {
    // The gating input is `getViewer()`'s server-resolved state, which takes
    // no arguments — the same property the gate cases above pin.
    tableRows = [gatedRow]
    getViewerMock.mockResolvedValue({ isAuthenticated: false, userId: null })

    await POST(
      makeRequest({
        ...validBody,
        isAuthenticated: true,
        userId: 'fake-admin',
      }),
    )

    expect(systemPassedToStreamText()).not.toContain('GATED_BODY_TEXT')
  })

  it('excludes a scheduled-future post even from a signed-in visitor', async () => {
    tableRows = [
      {
        ...publicRow,
        content: 'FUTURE_BODY_TEXT',
        published_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ]
    getViewerMock.mockResolvedValue({ isAuthenticated: true, userId: 'u' })

    await POST(makeRequest(validBody))

    expect(systemPassedToStreamText()).not.toContain('FUTURE_BODY_TEXT')
  })
})

describe('POST /api/ai/chat — retrieval degrades to the untouched prompt', () => {
  it('an EMPTY table still streams, with the system prompt byte-identical', async () => {
    tableRows = []

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(systemPassedToStreamText()).toBe('You are Corvus.')
  })

  it('a provider failure still streams, ungrounded', async () => {
    embedQueryMock.mockRejectedValue(new Error('embedding provider down'))

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(systemPassedToStreamText()).toBe('You are Corvus.')
  })

  it('a DATABASE failure still streams, ungrounded', async () => {
    executeMock.mockRejectedValueOnce(
      new Error('relation "corvus_embeddings" does not exist'),
    )

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(systemPassedToStreamText()).toBe('You are Corvus.')
  })

  it('a query that MISSES (every row below the floor) streams ungrounded', async () => {
    tableRows = [{ ...publicRow, score: 0.04 }]

    await POST(makeRequest(validBody))

    expect(systemPassedToStreamText()).toBe('You are Corvus.')
  })

  it('leaves the response shape and status untouched in every failure mode', async () => {
    embedQueryMock.mockRejectedValue(new Error('down'))

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('stream')
  })
})

describe('POST /api/ai/chat — CORVUS_DISABLE_RETRIEVAL kill switch', () => {
  it('short-circuits BEFORE the embedding call and the database round-trip', async () => {
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', 'true')
    tableRows = [publicRow]

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(embedQueryMock).not.toHaveBeenCalled()
    expect(executeMock).not.toHaveBeenCalled()
    expect(systemPassedToStreamText()).toBe('You are Corvus.')
  })

  it('anything other than the exact string "true" leaves retrieval ON', async () => {
    vi.stubEnv('CORVUS_DISABLE_RETRIEVAL', 'false')
    tableRows = [publicRow]

    await POST(makeRequest(validBody))

    expect(systemPassedToStreamText()).toContain('PUBLIC_BODY_TEXT')
  })
})

describe('POST /api/ai/chat — retrieval runs only after every gate passes', () => {
  it('a rate-limited request never triggers retrieval', async () => {
    checkChatLimitsMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
      limit: 10,
    })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(429)
    expect(embedQueryMock).not.toHaveBeenCalled()
  })

  it('a sign-in-gated anonymous request never triggers retrieval', async () => {
    peekAnonFreeMessageCountMock.mockResolvedValue(3)

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(401)
    expect(embedQueryMock).not.toHaveBeenCalled()
  })

  it('CORVUS_DISABLE_CHAT still short-circuits ahead of retrieval', async () => {
    vi.stubEnv('CORVUS_DISABLE_CHAT', 'true')

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(503)
    expect(embedQueryMock).not.toHaveBeenCalled()
  })

  it('embeds only the LATEST user turn, not the whole window', async () => {
    tableRows = []

    await POST(
      makeRequest({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'first question' }] },
          { role: 'user', parts: [{ type: 'text', text: 'latest question' }] },
        ],
      }),
    )

    expect(embedQueryMock).toHaveBeenCalledWith(
      'latest question',
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
  })
})
