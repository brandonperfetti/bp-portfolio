// @vitest-environment node
import type { MCPAccessSettings } from '@payloadcms/plugin-mcp'
import type {
  CollectionConfig,
  Config,
  Endpoint,
  PayloadHandler,
  PayloadRequest,
  SanitizedConfig,
} from 'payload'

import { createHmac } from 'node:crypto'
import { getLocalI18n, sanitizeConfig } from 'payload'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { plugins } from '@/plugins'

import { bufferMcpResponses, MCP_ENDPOINT_PATH } from './bufferMcpResponses'
import {
  createMcpRequestLimits,
  DEFAULT_MCP_REQUEST_LIMITS,
  inspectMcpJson,
  MAX_MCP_BATCH_MESSAGES,
  MAX_MCP_BODY_BYTES,
  MAX_MCP_JSON_DEPTH,
  MAX_MCP_JSON_ELEMENTS,
} from './limitMcpRequests'

/**
 * Pins for the #312 partial mitigation.
 *
 * The authority here is "the real plugin chain": the exported `plugins` list,
 * applied and sanitized as Payload does, so the request goes through the real
 * `@payloadcms/plugin-mcp` handler, its default API-key resolver, the
 * `overrideAuth` this repo installs, `mcp-handler` 1.1.0 and the SDK. Only the
 * database is stubbed: one synthetic API-key document, found only for the
 * HMAC of the synthetic key, as the plugin looks it up. Bodies are native
 * `ReadableStream`s that count their pulls, because "nothing read before the
 * key is checked" depends on how real streams pull.
 *
 * Every test also fails on any unhandled rejection. `mcp-handler` 1.1.0 does
 * not await its own request handler, so a failure that reaches it surfaces
 * only as an unhandled rejection; a refusal must be thrown before it exists.
 */

const MCP_URL = 'http://localhost:3000/api/mcp'
const CHUNK = 64 * 1024
const SECRET = 'test-secret-not-real'
const API_KEY = 'synthetic-mcp-key-for-tests'
const encoder = new TextEncoder()

// ---------------------------------------------------------------------------
// Unhandled-rejection detector (observes only; it handles nothing for the
// code under test).

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}
beforeAll(() => {
  process.on('unhandledRejection', onUnhandled)
})
afterAll(() => {
  process.off('unhandledRejection', onUnhandled)
})
afterEach(async () => {
  // Let any orphaned promise settle and be reported before checking.
  await new Promise((resolve) => setTimeout(resolve, 25))
  const seen = unhandled.splice(0)
  expect(seen).toEqual([])
})

// ---------------------------------------------------------------------------
// Bodies.

type SourceState = { cancelled: boolean; pulls: number }

/**
 * A body that records every pull. `highWaterMark: 0` keeps the stream itself
 * from pulling at construction, so a pull here is always a real read.
 */
const countingSource = (
  next: (pull: number) => Uint8Array | null,
): { state: SourceState; stream: ReadableStream<Uint8Array> } => {
  const state: SourceState = { cancelled: false, pulls: 0 }
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls += 1
        const chunk = next(state.pulls)
        if (chunk) controller.enqueue(chunk)
        else controller.close()
      },
      cancel() {
        state.cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { state, stream }
}

/** `bytes` served in 64 KiB chunks, with no `Content-Length`. */
const chunked = (bytes: Uint8Array) =>
  countingSource((pull) => {
    const start = (pull - 1) * CHUNK
    return start < bytes.length ? bytes.subarray(start, start + CHUNK) : null
  })

/** A chunked body that never ends: 64 KiB of spaces per pull. */
const endless = () => countingSource(() => new Uint8Array(CHUNK).fill(0x20))

const bytesOf = (value: unknown) => encoder.encode(JSON.stringify(value))

// ---------------------------------------------------------------------------
// JSON-RPC fixtures.

const toolCall = (args: unknown, id = 1) => ({
  id,
  jsonrpc: '2.0',
  method: 'tools/call',
  params: { arguments: args, name: 'updatePosts' },
})

/** A JSON-RPC batch of `n` small tool calls. */
const batchOf = (n: number) =>
  Array.from({ length: n }, (_, i) => toolCall({ id: i }, i))

/** `[[[…0…]]]`, `depth` arrays deep. */
const nested = (depth: number): unknown =>
  Array.from({ length: depth }).reduce<unknown>((inner) => [inner], 0)

// A SYNTHETIC Lexical tree shaped like a migrated article: about 450 bytes and
// 32 values a paragraph. It is not a measurement of production rows. The
// strings are short, which makes it denser in values per byte than prose, so
// it is a hard case for the element limit. Every paragraph is the same size,
// so the padding below comes out exact.
const textNode = (text: string) => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})
const paragraph = () => ({
  children: [
    textNode('Each paragraph opens with a sentence, '),
    { ...textNode('then a bold phrase'), format: 1 },
    textNode(' and closes the thought.'),
  ],
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  version: 1,
})
const richText = (paragraphs: number) => ({
  root: {
    children: Array.from({ length: paragraphs }, paragraph),
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

/** A synthetic rich-text `updatePosts` call padded to exactly `bytes`. */
const richTextCallOf = (bytes: number, id = 1) => {
  const build = (paragraphs: number, pad: string) =>
    toolCall(
      {
        data: { content: richText(paragraphs), excerpt: pad, title: 'Long' },
        id: 1,
      },
      id,
    )
  const size = (value: unknown) => bytesOf(value).length
  const empty = size(build(0, ''))
  const perParagraph = size(build(2, '')) - size(build(1, ''))
  const paragraphs = Math.floor((bytes - empty) / perParagraph) - 1
  const unpadded = size(build(paragraphs, ''))
  const message = build(paragraphs, 'x'.repeat(bytes - unpadded))
  return { message, paragraphs }
}

/** Array items plus object members, as `inspectMcpJson` counts them. */
const countValues = (value: unknown): number => {
  if (value === null || typeof value !== 'object') return 0
  let count = 0
  for (const child of Object.values(value)) count += 1 + countValues(child)
  return count
}

// ---------------------------------------------------------------------------
// The real plugin chain.

// Every collection `mcpPlugin` enables in `src/plugins/index.ts`, plus the
// auth collection API keys belong to. Stubs: one text field each. The MCP
// handler builds a JSON schema for each enabled slug on every request, so
// each has to exist for a request to reach the SDK at all.
const STUB_SLUGS = [
  'posts',
  'pages',
  'projects',
  'tech-stack',
  'uses',
  'categories',
  'tags',
  'work-history',
  'media',
]

const stubCollection = (slug: string): CollectionConfig => ({
  fields: [{ name: 'title', type: 'text' }],
  slug,
})

type Chain = { config: SanitizedConfig; post: PayloadHandler }

let chain: Promise<Chain> | undefined

/**
 * Apply every exported plugin as `buildConfig` does (sorted by `order`, each
 * to the previous output), sanitize the result, and return it with the one
 * `POST /mcp` handler. Built once per file.
 */
const realChain = (): Promise<Chain> => {
  chain ??= (async () => {
    const sorted = [...plugins].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    let config = {
      admin: { user: 'users' },
      collections: [
        { auth: true, fields: [], slug: 'users' },
        ...STUB_SLUGS.map(stubCollection),
      ],
      secret: SECRET,
    } as unknown as Config
    for (const plugin of sorted) config = await plugin(config)
    const sanitized = await sanitizeConfig(config)
    const posts = (sanitized.endpoints || []).filter(
      (e) => e.path === MCP_ENDPOINT_PATH && e.method === 'post',
    )
    expect(posts).toHaveLength(1)
    return { config: sanitized, post: posts[0].handler }
  })()
  return chain
}

/** The synthetic API-key document: a user, and no tool capability at all. */
const apiKeyDoc = () => ({ id: 1, user: { email: 'mcp@example.test', id: 7 } })

type Probe = { mcpHandlerBuilt: number }

/** The one query shape the plugin's default resolver sends. */
type FindArgs = { where: { apiKeyIndex: { equals: string } } }

/**
 * A native `Request` dressed as the `PayloadRequest` Payload hands an
 * endpoint. `payload.find` finds the synthetic key only by its HMAC, as the
 * plugin's resolver looks it up. `payload.db` is read by the plugin only when
 * it builds the `mcp-handler`, so reading it is the probe for "the request
 * got past the limits to the SDK".
 */
const mcpRequest = async (
  body: ReadableStream<Uint8Array> | string | null,
  headers: Record<string, string> = {},
) => {
  const { config } = await realChain()
  const index = createHmac('sha256', SECRET).update(API_KEY).digest('hex')
  const probe: Probe = { mcpHandlerBuilt: 0 }
  const find = vi.fn(async (args: FindArgs) => ({
    docs: args.where.apiKeyIndex.equals === index ? [apiKeyDoc()] : [],
  }))
  const payload = {
    config,
    find,
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    secret: SECRET,
  }
  Object.defineProperty(payload, 'db', {
    get() {
      probe.mcpHandlerBuilt += 1
      return { defaultIDType: 'number' }
    },
  })
  const request = new Request(MCP_URL, {
    body,
    duplex: 'half',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  } as RequestInit)
  const i18n = await getLocalI18n({ config, language: 'en' })
  const req = Object.assign(request, { i18n, payload })
  return { find, probe, req: req as unknown as PayloadRequest }
}

const authorized = { authorization: `Bearer ${API_KEY}` }

const expectRefusal = async (response: Response, status = 413) => {
  expect(response.status).toBe(status)
  const body = (await response.json()) as {
    error: { code: number; message: string }
    id: null
    jsonrpc: string
  }
  expect(body).toMatchObject({ id: null, jsonrpc: '2.0' })
  expect(body.error.code).toBe(status === 400 ? -32700 : -32600)
  return body.error.message
}

// ---------------------------------------------------------------------------

describe('the limits', () => {
  it('are the documented values', () => {
    expect(MAX_MCP_BODY_BYTES).toBe(2 * 1024 * 1024)
    expect(MAX_MCP_BATCH_MESSAGES).toBe(100)
    expect(MAX_MCP_JSON_ELEMENTS).toBe(200_000)
    expect(MAX_MCP_JSON_DEPTH).toBe(128)
    expect(Object.isFrozen(DEFAULT_MCP_REQUEST_LIMITS)).toBe(true)
  })

  it('leave the byte cap binding for a synthetic rich-text body at the cap', () => {
    const { message, paragraphs } = richTextCallOf(MAX_MCP_BODY_BYTES)
    expect(paragraphs).toBeGreaterThan(4_000)
    expect(countValues(message)).toBeLessThan(MAX_MCP_JSON_ELEMENTS)
    expect(inspectMcpJson(message)).toBeNull()
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('refuse a %s limit when the kit is built', (_, value) => {
    const limits = { ...DEFAULT_MCP_REQUEST_LIMITS, maxBodyBytes: value }
    expect(() => createMcpRequestLimits(limits)).toThrow(/#312/)
  })
})

describe('the real plugin chain: wiring', () => {
  it('orders mcpPlugin, then the limits, then the buffer', () => {
    const orders = plugins.map((plugin) => plugin.order ?? 0)
    const [mcp, limits, buffer] = orders.slice(-3)
    expect(mcp).toBeLessThan(limits)
    expect(limits).toBe(Number.MAX_SAFE_INTEGER - 1)
    expect(buffer).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('the real plugin chain: authentication comes first', () => {
  it.each<[string, Record<string, string>, number]>([
    ['no key', {}, 0],
    ['an unknown key', { authorization: 'Bearer not-a-real-key' }, 1],
  ])(
    'refuses %s as before, without reading one byte',
    async (_, headers, lookups) => {
      const { post } = await realChain()
      const { state, stream } = endless()
      const { find, probe, req } = await mcpRequest(stream, headers)

      await expect(post(req)).rejects.toMatchObject({ status: 401 })
      expect(state.pulls).toBe(0)
      expect(state.cancelled).toBe(false)
      expect(find).toHaveBeenCalledTimes(lookups)
      expect(probe.mcpHandlerBuilt).toBe(0)
    },
  )

  it('refuses an oversized Content-Length from the header, before the key lookup', async () => {
    const { post } = await realChain()
    const { state, stream } = endless()
    const { find, probe, req } = await mcpRequest(stream, {
      ...authorized,
      'content-length': String(MAX_MCP_BODY_BYTES + 1),
    })

    await expectRefusal(await post(req))
    expect(find).not.toHaveBeenCalled()
    expect(state.pulls).toBe(0)
    expect(probe.mcpHandlerBuilt).toBe(0)
  })
})

describe('the real plugin chain: authenticated refusals', () => {
  it('answers 413 to a finite chunked body one chunk over the cap, before mcp-handler', async () => {
    // Red-capable regression: without the overrideAuth half, this valid JSON
    // body reaches mcp-handler and is answered 200; with the earlier racing
    // design, it was answered 413 but left an unhandled rejection behind.
    const { post } = await realChain()
    const { message } = richTextCallOf(MAX_MCP_BODY_BYTES + CHUNK)
    const { state, stream } = chunked(bytesOf(message))
    const { find, probe, req } = await mcpRequest(stream, authorized)

    const text = await expectRefusal(await post(req))

    expect(text).toMatch(/^MCP request body exceeds \d+ bytes$/)
    expect(find).toHaveBeenCalledTimes(1)
    expect(probe.mcpHandlerBuilt).toBe(0)
    expect(state.pulls).toBeLessThanOrEqual(MAX_MCP_BODY_BYTES / CHUNK + 1)
    expect(state.cancelled).toBe(true)
  }, 20_000)

  it('stops an endless chunked body at the cap and cancels the sender', async () => {
    const { post } = await realChain()
    const { state, stream } = endless()
    const { probe, req } = await mcpRequest(stream, authorized)

    await expectRefusal(await post(req))
    expect(probe.mcpHandlerBuilt).toBe(0)
    expect(state.pulls).toBeLessThanOrEqual(MAX_MCP_BODY_BYTES / CHUNK + 1)
    expect(state.cancelled).toBe(true)
  }, 20_000)

  it.each<[string, unknown, RegExp]>([
    ['a batch over the limit', batchOf(MAX_MCP_BATCH_MESSAGES + 1), /batch/],
    [
      'more values than the limit, under the byte cap',
      toolCall({ ids: new Array(MAX_MCP_JSON_ELEMENTS).fill(0) }),
      /values/,
    ],
    [
      // The message and its `params` sit two levels above `arguments`, so the
      // innermost array of `nested(n)` is at depth n + 2.
      'nesting deeper than the limit',
      toolCall(nested(MAX_MCP_JSON_DEPTH - 1)),
      /deeper/,
    ],
  ])(
    'answers 413 to %s, before mcp-handler',
    async (_, value, pattern) => {
      const { post } = await realChain()
      const { state, stream } = chunked(bytesOf(value))
      const { find, probe, req } = await mcpRequest(stream, authorized)

      expect(await expectRefusal(await post(req))).toMatch(pattern)
      expect(find).toHaveBeenCalledTimes(1)
      expect(probe.mcpHandlerBuilt).toBe(0)
      expect(state.cancelled).toBe(false)
    },
    20_000,
  )

  it('checks a body behind a byte-order mark the same as one without', async () => {
    const { post } = await realChain()
    const batch = JSON.stringify(batchOf(MAX_MCP_BATCH_MESSAGES + 1))
    const { stream } = chunked(encoder.encode(`﻿${batch}`))
    const { probe, req } = await mcpRequest(stream, authorized)

    expect(await expectRefusal(await post(req))).toMatch(/batch/)
    expect(probe.mcpHandlerBuilt).toBe(0)
  })

  it('answers 400 to a JSON body that does not parse, before mcp-handler', async () => {
    // mcp-handler 1.1.0 would call req.json() inside a handler it never
    // awaits: an unhandled rejection and a reply that never comes.
    const { post } = await realChain()
    const { stream } = chunked(encoder.encode('{"jsonrpc":"2.0",'))
    const { probe, req } = await mcpRequest(stream, authorized)

    expect(await expectRefusal(await post(req), 400)).toMatch(/not valid JSON/)
    expect(probe.mcpHandlerBuilt).toBe(0)
  })

  it('never echoes the body in the refusal', async () => {
    const { post } = await realChain()
    const secret = 'sk-do-not-echo-0123456789'
    const body = bytesOf(toolCall({ note: secret.repeat(100_000) }))
    const { stream } = chunked(body)
    const { req } = await mcpRequest(stream, authorized)

    const response = await post(req)
    expect(await response.clone().text()).not.toContain(secret)
    await expectRefusal(response)
  }, 20_000)
})

describe('the real plugin chain: accepted requests', () => {
  it('passes a synthetic rich-text call of exactly the cap to mcp-handler, buffered', async () => {
    // No tool is registered (the synthetic key grants none), so the SDK
    // answers with a JSON-RPC error for the call's id: the body was replayed
    // intact, parsed by mcp-handler and dispatched, and no tool ran.
    const { post } = await realChain()
    const { message } = richTextCallOf(MAX_MCP_BODY_BYTES, 4242)
    const bytes = bytesOf(message)
    expect(bytes.length).toBe(MAX_MCP_BODY_BYTES)
    const { state, stream } = chunked(bytes)
    const { find, probe, req } = await mcpRequest(stream, authorized)

    const response = await post(req)

    expect(response.status).toBe(200)
    expect(find).toHaveBeenCalledTimes(1)
    expect(probe.mcpHandlerBuilt).toBeGreaterThanOrEqual(1)
    expect(state.cancelled).toBe(false)
    // bufferMcpResponses has already read the stream: the text is complete.
    const text = await response.text()
    expect(text).toContain('"id":4242')
    expect(text).toContain('"error"')
  }, 20_000)
})

// ---------------------------------------------------------------------------
// The kit on its own. These drive `overrideAuth` through the kit's plugin and
// a stand-in endpoint that awaits it as the real plugin does; they pin the
// boundaries and the replay, while the real chain above is the authority on
// the end-to-end behaviour.

const settings = { user: { id: 7 } } as unknown as MCPAccessSettings

/** The kit's plugin over one endpoint that awaits `overrideAuth`, then reads the body. */
const kitEndpoint = (
  getDefault: () => Promise<MCPAccessSettings> = async () => settings,
) => {
  const kit = createMcpRequestLimits()
  const read = vi.fn<(text: string) => void>()
  const post: Endpoint = {
    handler: async (req) => {
      const resolved = await kit.overrideAuth(req, getDefault)
      expect(resolved).toBe(settings)
      const text = await new Response(req.body).text()
      read(text)
      return new Response(text, { status: 200 })
    },
    method: 'post',
    path: MCP_ENDPOINT_PATH,
  }
  const config = kit.plugin({ endpoints: [post] } as Config) as Config
  const [wrapped] = config.endpoints ?? []
  return { handler: wrapped.handler, kit, read }
}

const plainRequest = (
  body: ReadableStream<Uint8Array> | string | null,
  headers: Record<string, string> = {},
) =>
  new Request(MCP_URL, {
    body,
    duplex: 'half',
    headers: { 'content-type': 'application/json', ...headers },
    method: 'POST',
  } as RequestInit) as unknown as PayloadRequest

describe('createMcpRequestLimits: overrideAuth', () => {
  it('calls the default resolver with no argument and returns its settings', async () => {
    const getDefault = vi.fn(async () => settings)
    const { handler } = kitEndpoint(getDefault)
    const response = await handler(plainRequest('{"a":1}'))
    expect(response.status).toBe(200)
    expect(getDefault).toHaveBeenCalledExactlyOnceWith()
  })

  it('propagates a refused key unchanged, reading nothing', async () => {
    const denied = Object.assign(new Error('Unauthorized'), { status: 401 })
    const { handler, read } = kitEndpoint(async () => {
      throw denied
    })
    const { state, stream } = endless()
    await expect(handler(plainRequest(stream))).rejects.toBe(denied)
    expect(state.pulls).toBe(0)
    expect(read).not.toHaveBeenCalled()
  })

  it('refuses to read a body for a request the endpoint wrapper did not mark', async () => {
    const kit = createMcpRequestLimits()
    const { state, stream } = endless()
    await expect(
      kit.overrideAuth(plainRequest(stream), async () => settings),
    ).rejects.toThrow(/without the endpoint wrapper.*#312/)
    expect(state.pulls).toBe(0)
  })

  it('returns the settings untouched for a body-less request', async () => {
    const kit = createMcpRequestLimits()
    const req = plainRequest(null)
    expect(await kit.overrideAuth(req, async () => settings)).toBe(settings)
  })

  it('replays the checked bytes exactly, at the byte cap', async () => {
    const { message } = richTextCallOf(MAX_MCP_BODY_BYTES)
    const bytes = bytesOf(message)
    const { handler, read } = kitEndpoint()
    const response = await handler(plainRequest(chunked(bytes).stream))
    expect(response.status).toBe(200)
    expect(read).toHaveBeenCalledExactlyOnceWith(JSON.stringify(message))
  }, 20_000)

  it('refuses one byte over the cap', async () => {
    const { message } = richTextCallOf(MAX_MCP_BODY_BYTES + 1)
    const { handler, read } = kitEndpoint()
    const { stream } = chunked(bytesOf(message))
    await expectRefusal(await handler(plainRequest(stream)))
    expect(read).not.toHaveBeenCalled()
  }, 20_000)

  it.each<[string, unknown]>([
    ['a batch of the limit', batchOf(MAX_MCP_BATCH_MESSAGES)],
    ['nesting of the limit', toolCall(nested(MAX_MCP_JSON_DEPTH - 2))],
  ])('accepts %s', async (_, value) => {
    const { handler, read } = kitEndpoint()
    const { stream } = chunked(bytesOf(value))
    const response = await handler(plainRequest(stream))
    expect(response.status).toBe(200)
    expect(read).toHaveBeenCalledOnce()
  })

  it('passes a body that is not declared JSON through unchanged', async () => {
    // mcp-handler reads a non-JSON content type with req.text(), which cannot
    // fail on content, so only a declared-JSON body is parsed strictly.
    const { handler, read } = kitEndpoint()
    const req = plainRequest('not json', { 'content-type': 'text/plain' })
    const response = await handler(req)
    expect(response.status).toBe(200)
    expect(read).toHaveBeenCalledExactlyOnceWith('not json')
  })

  it('fails closed if anything reads the original body afterwards', async () => {
    const kit = createMcpRequestLimits()
    const post: Endpoint = {
      handler: async (req) => {
        await kit.overrideAuth(req, async () => settings)
        await Request.prototype.text.call(req as unknown as Request)
        return new Response('read the original body')
      },
      method: 'post',
      path: MCP_ENDPOINT_PATH,
    }
    const config = kit.plugin({ endpoints: [post] } as Config) as Config
    const [wrapped] = config.endpoints ?? []
    await expect(wrapped.handler(plainRequest('{"a":1}'))).rejects.toThrow(
      TypeError,
    )
  })
})

describe('createMcpRequestLimits: plugin', () => {
  const endpoint = (method: Endpoint['method'], path: string): Endpoint => ({
    handler: () => new Response(`${method} ${path}`),
    method,
    path,
  })
  const apply = (config: Partial<Config>) =>
    createMcpRequestLimits().plugin(config as Config) as Config

  it('wraps only POST /mcp and leaves every other endpoint as it was', () => {
    const get = endpoint('get', MCP_ENDPOINT_PATH)
    const del = endpoint('delete', MCP_ENDPOINT_PATH)
    const other = endpoint('post', '/revalidate')
    const post = endpoint('post', MCP_ENDPOINT_PATH)

    const { endpoints = [] } = apply({ endpoints: [get, del, post, other] })

    expect(endpoints[0]).toBe(get)
    expect(endpoints[1]).toBe(del)
    expect(endpoints[3]).toBe(other)
    expect(endpoints[2]).not.toBe(post)
    expect(endpoints[2]).toMatchObject({ method: 'post', path: '/mcp' })
  })

  it.each([
    ['no MCP endpoint', [endpoint('get', MCP_ENDPOINT_PATH)]],
    [
      'two MCP endpoints',
      [
        endpoint('post', MCP_ENDPOINT_PATH),
        endpoint('post', MCP_ENDPOINT_PATH),
      ],
    ],
  ])('fails the config build when it finds %s', (_, endpoints) => {
    expect(() => apply({ endpoints })).toThrow(/#312/)
  })

  it('composes under bufferMcpResponses: a refusal and a streamed reply both come through', async () => {
    const kit = createMcpRequestLimits()
    const events: string[] = []
    const post: Endpoint = {
      // Stream the reply after the work, as the SSE transport does.
      handler: async (req) => {
        await kit.overrideAuth(req, async () => settings)
        const text = await new Response(req.body).text()
        return new Response(
          new ReadableStream({
            async start(controller) {
              await new Promise((resolve) => setTimeout(resolve, 5))
              controller.enqueue(encoder.encode(text))
              events.push('stream closed')
              controller.close()
            },
          }),
        )
      },
      method: 'post',
      path: MCP_ENDPOINT_PATH,
    }
    // Listed in the wrong order on purpose: `order` decides, as in buildConfig.
    const list = [bufferMcpResponses(), kit.plugin]
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    let config = { endpoints: [post] } as unknown as Config
    for (const plugin of list) config = await plugin(config)
    const [wrapped] = config.endpoints ?? []

    const ok = await wrapped.handler(plainRequest('{"id":1}'))
    events.push('handler returned')
    expect(events).toEqual(['stream closed', 'handler returned'])
    expect(await ok.json()).toEqual({ id: 1 })

    await expectRefusal(await wrapped.handler(plainRequest(endless().stream)))
  }, 20_000)
})
