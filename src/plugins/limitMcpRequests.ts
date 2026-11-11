import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type {
  Config,
  Endpoint,
  PayloadHandler,
  PayloadRequest,
  Plugin,
} from 'payload'

import { MCP_ENDPOINT_PATH } from './bufferMcpResponses'

/**
 * Largest `POST /api/mcp` body accepted, in bytes: 2 MiB (#312).
 *
 * @remarks Half the 4 MiB cap the SDK puts on its own SSE transport
 * (`MAXIMUM_MESSAGE_SIZE`, `@modelcontextprotocol/sdk` 1.30.0
 * `server/sse.js`), which this endpoint does not use: `mcp-handler` 1.1.0
 * reads the whole body with `req.json()` and hands the parsed message to the
 * web-standard transport, which has no size check. A tool call here is
 * JSON-RPC carrying CMS document data. The synthetic Lexical paragraph in the
 * test is about 450 bytes, so a 300-paragraph article would be about 135 KB.
 * That is an estimate from a synthetic fixture, not a measurement of
 * production rows. No MCP tool takes file bytes (Media enters through uploads
 * or `/api/media/ingest`, `docs/SECURITY.md` § Media uploads).
 */
export const MAX_MCP_BODY_BYTES = 2 * 1024 * 1024

/**
 * Largest JSON-RPC batch accepted: 100 messages, the upstream sample.
 *
 * @remarks MCP clients send one message per POST, and the 2025-06-18 protocol
 * dropped batching, so this only bounds a hostile array of cheap messages.
 */
export const MAX_MCP_BATCH_MESSAGES = 100

/**
 * Most JSON values (array items plus object members, counted over the whole
 * body) accepted: 200,000.
 *
 * @remarks Twenty times the upstream 10,000 sample, because that sample would
 * refuse the synthetic Lexical fixture well below the byte cap. The test
 * fixture spends about 32 values on each 450-byte paragraph, so a body of
 * that shape filling 2 MiB stays under 200,000 and the byte cap binds first.
 * This is derived from the synthetic fixture, not from production rows. What
 * this refuses is the dense hostile shape, such as a 2 MiB `[0,0,0,…]` of
 * about a million values that schema validation would walk one by one.
 */
export const MAX_MCP_JSON_ELEMENTS = 200_000

/**
 * Deepest JSON nesting accepted: 128 levels.
 *
 * @remarks `mcp-handler` re-serialises the parsed body with `JSON.stringify`,
 * which recurses, so a body nested deeply enough fails with a stack overflow
 * that it does not catch. The JSON-RPC envelope is 3 levels, a block layout
 * adds a few more, and each nested Lexical list adds 4.
 */
export const MAX_MCP_JSON_DEPTH = 128

/** The limits {@link createMcpRequestLimits} enforces. */
export type McpRequestLimits = {
  /** Most JSON-RPC messages in one batch (a top-level array). */
  maxBatchMessages: number
  /** Most body bytes, counted as they arrive, whatever `Content-Length` says. */
  maxBodyBytes: number
  /** Deepest nesting of arrays and objects. */
  maxJsonDepth: number
  /** Most array items plus object members across the whole body. */
  maxJsonElements: number
}

/** The limits in force on `POST /api/mcp`. */
export const DEFAULT_MCP_REQUEST_LIMITS = Object.freeze<McpRequestLimits>({
  maxBatchMessages: MAX_MCP_BATCH_MESSAGES,
  maxBodyBytes: MAX_MCP_BODY_BYTES,
  maxJsonDepth: MAX_MCP_JSON_DEPTH,
  maxJsonElements: MAX_MCP_JSON_ELEMENTS,
})

/**
 * Why a request was refused. `parse` is a JSON body that does not parse,
 * refused here because `mcp-handler` 1.1.0 would otherwise reject inside a
 * handler it never awaits.
 */
export type McpLimitViolation =
  'batch' | 'body' | 'depth' | 'elements' | 'parse'

type Describe = (limits: McpRequestLimits) => string

/** What the refusal says: the limit, never the body. */
const VIOLATION_MESSAGES: Record<McpLimitViolation, Describe> = {
  batch: (l) => `MCP request batch exceeds ${l.maxBatchMessages} messages`,
  body: (l) => `MCP request body exceeds ${l.maxBodyBytes} bytes`,
  depth: (l) => `MCP request JSON nests deeper than ${l.maxJsonDepth} levels`,
  elements: (l) => `MCP request JSON exceeds ${l.maxJsonElements} values`,
  parse: () => 'MCP request body is not valid JSON',
}

/**
 * The error `overrideAuth` throws when a request breaks a limit.
 *
 * @remarks Thrown from inside the plugin's awaited `resolveAccessSettings`,
 * before `mcp-handler` is created, so it rejects the endpoint handler's own
 * promise and nothing is left unhandled. The endpoint wrapper turns it into
 * the JSON-RPC reply. Its message names the limit and never any of the body.
 */
export class McpRequestLimitError extends Error {
  /** The HTTP status the endpoint answers with. */
  readonly status: 400 | 413
  /** The limit that tripped. */
  readonly violation: McpLimitViolation

  /**
   * @param violation - The limit that tripped.
   * @param limits - The limits in force, for the message.
   */
  constructor(violation: McpLimitViolation, limits: McpRequestLimits) {
    super(VIOLATION_MESSAGES[violation](limits))
    this.name = 'McpRequestLimitError'
    this.status = violation === 'parse' ? 400 : 413
    this.violation = violation
  }
}

type Frame = { depth: number; node: unknown }

/**
 * Check a parsed JSON-RPC body against the batch, element and depth limits.
 *
 * @param value - The parsed body.
 * @param limits - The limits to check against.
 * @returns The first limit broken, or `null` if none is.
 *
 * @remarks Iterative with an explicit stack, so a deeply nested hostile body
 * cannot overflow the stack here, which is the failure it exists to prevent
 * downstream. Stops as soon as a limit is crossed.
 */
export const inspectMcpJson = (
  value: unknown,
  limits: McpRequestLimits = DEFAULT_MCP_REQUEST_LIMITS,
): McpLimitViolation | null => {
  if (Array.isArray(value) && value.length > limits.maxBatchMessages) {
    return 'batch'
  }
  let elements = 0
  const stack: Frame[] = [{ depth: 1, node: value }]
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const { depth, node } = frame
    if (node === null || typeof node !== 'object') continue
    if (depth > limits.maxJsonDepth) return 'depth'
    const children = Array.isArray(node) ? node : Object.values(node)
    elements += children.length
    if (elements > limits.maxJsonElements) return 'elements'
    for (const child of children) stack.push({ depth: depth + 1, node: child })
  }
  return null
}

/**
 * Read a body to the end, refusing it as soon as it passes the byte cap.
 *
 * @remarks On overflow the source is cancelled, so the rest of the body is
 * never read. A chunk that is not bytes cannot be counted and is refused.
 */
const readBounded = async (
  source: ReadableStream<Uint8Array>,
  limits: McpRequestLimits,
): Promise<Uint8Array[]> => {
  const reader = source.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return chunks
    received += value instanceof Uint8Array ? value.byteLength : Infinity
    if (received > limits.maxBodyBytes) {
      chunks.length = 0
      await reader.cancel('MCP request body limit').catch(() => {})
      throw new McpRequestLimitError('body', limits)
    }
    chunks.push(value)
  }
}

/**
 * Check the complete body's structure.
 *
 * @remarks Mirrors what `mcp-handler` 1.1.0 does next: a body whose
 * `Content-Type` contains `application/json` goes to `req.json()`, so one that
 * does not parse is refused here; any other body goes to `req.text()` and is
 * passed through unchanged. The decoder strips a leading byte-order mark, as
 * `Request.json()` does, so a BOM cannot make a body unparseable here and
 * parseable there.
 */
const inspectBody = (
  chunks: Uint8Array[],
  isJson: boolean,
  limits: McpRequestLimits,
): McpLimitViolation | null => {
  const decoder = new TextDecoder('utf-8')
  let text = ''
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true })
  text += decoder.decode()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return isJson ? 'parse' : null
  }
  return inspectMcpJson(parsed, limits)
}

/** A stream that serves the already-checked bytes again, one chunk a pull. */
const replay = (chunks: Uint8Array[]): ReadableStream<Uint8Array> => {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++])
      else controller.close()
    },
  })
}

/** A `Content-Length` value, or `null` when absent or not a plain integer. */
const declaredLength = (header: string | null): number | null =>
  header !== null && /^\d+$/.test(header.trim()) ? Number(header) : null

const refusal = (
  violation: McpLimitViolation,
  limits: McpRequestLimits,
  status: number,
) =>
  Response.json(
    {
      error: {
        code: violation === 'parse' ? -32700 : -32600,
        message: VIOLATION_MESSAGES[violation](limits),
      },
      id: null,
      jsonrpc: '2.0',
    },
    { status },
  )

const assertLimits = (limits: McpRequestLimits) => {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(
        `limitMcpRequests: ${name} must be a positive integer, got ${String(value)} (#312)`,
      )
    }
  }
}

/** The `overrideAuth` option of `mcpPlugin`. */
export type McpOverrideAuth = NonNullable<MCPPluginConfig['overrideAuth']>

/** The two halves of the #312 mitigation; both must be installed. */
export type McpRequestLimitsKit = {
  /** Pass as `mcpPlugin({ overrideAuth })`: bounds the body after the key check. */
  overrideAuth: McpOverrideAuth
  /** Add to the plugin list: maps a refusal to its status, and pairs the halves. */
  plugin: Plugin
}

const limitPlugin = (
  limits: McpRequestLimits,
  guarded: WeakSet<PayloadRequest>,
): Plugin => {
  const wrap =
    (handler: PayloadHandler): PayloadHandler =>
    async (req) => {
      const declared = declaredLength(req.headers.get('content-length'))
      if (declared !== null && declared > limits.maxBodyBytes) {
        return refusal('body', limits, 413)
      }
      guarded.add(req)
      try {
        return await handler(req)
      } catch (error) {
        if (error instanceof McpRequestLimitError) {
          return refusal(error.violation, limits, error.status)
        }
        throw error
      }
    }

  return Object.assign(
    (config: Config): Config => {
      let wrapped = 0
      const endpoints = (config.endpoints ?? []).map((endpoint): Endpoint => {
        if (endpoint.path !== MCP_ENDPOINT_PATH || endpoint.method !== 'post') {
          return endpoint
        }
        wrapped += 1
        return { ...endpoint, handler: wrap(endpoint.handler) }
      })
      if (wrapped !== 1) {
        throw new Error(
          `limitMcpRequests: expected one POST ${MCP_ENDPOINT_PATH} endpoint from @payloadcms/plugin-mcp, found ${wrapped}; MCP request bodies would be unbounded (#312)`,
        )
      }
      return { ...config, endpoints }
    },
    // One below `bufferMcpResponses`: runs after `mcpPlugin` (order 10) and is
    // wrapped by the buffer, so a refusal is buffered like any other reply.
    { order: Number.MAX_SAFE_INTEGER - 1 },
  )
}

/**
 * Bound what an authenticated `POST /api/mcp` reads before `mcp-handler` sees
 * it (#312).
 *
 * @param limits - The limits to enforce. Defaults to
 * {@link DEFAULT_MCP_REQUEST_LIMITS}; every value must be a positive integer.
 * @returns An `overrideAuth` for `mcpPlugin` and a plugin for the plugin list.
 *
 * @remarks **Where the body is read.** `@payloadcms/plugin-mcp` 3.88.0 awaits
 * `resolveAccessSettings` (which calls `overrideAuth`) and only then builds
 * the `mcp-handler` request over `req.body`
 * (`plugin-mcp/dist/endpoints/mcp.js`). `overrideAuth` first awaits the
 * plugin's own default resolver, unchanged and with no argument, so the key
 * check is the plugin's: a missing or unknown key throws before one byte is
 * read. Only then does it read the body, bounded, and check its structure.
 * On success `req.body` is replaced with a replay of the checked bytes; on
 * failure it throws {@link McpRequestLimitError}, which rejects the endpoint
 * handler's awaited promise before `mcp-handler` exists. Nothing races and
 * nothing is left unhandled.
 *
 * **What the plugin half does.** It wraps the one `POST /mcp` endpoint: it
 * refuses a `Content-Length` over the cap from the header alone, before the
 * key check (nothing read; the caller learns only the cap), and maps
 * {@link McpRequestLimitError} to a JSON-RPC reply with its status. It also
 * marks the request, and `overrideAuth` refuses to read a body for a request
 * the wrapper did not mark, so a missing wrapper fails closed instead of
 * producing an unmapped error.
 *
 * Throws at config build when there is not exactly one `POST /mcp` endpoint.
 * This is a partial mitigation in front of the pinned SDK, not a fix in it,
 * and it does not clear an SDK advisory: see `docs/SECURITY.md` for what it
 * leaves open.
 */
export const createMcpRequestLimits = (
  limits: McpRequestLimits = DEFAULT_MCP_REQUEST_LIMITS,
): McpRequestLimitsKit => {
  assertLimits(limits)
  const guarded = new WeakSet<PayloadRequest>()

  const overrideAuth: McpOverrideAuth = async (
    req,
    getDefaultMcpAccessSettings,
  ) => {
    const settings = await getDefaultMcpAccessSettings()
    const source = req.body
    if (!source) return settings
    if (!guarded.has(req)) {
      throw new Error(
        'limitMcpRequests: an MCP request body reached overrideAuth without the endpoint wrapper; refusing to read it (#312)',
      )
    }
    const isJson = (req.headers.get('content-type') ?? '').includes(
      'application/json',
    )
    const chunks = await readBounded(source, limits)
    const violation = inspectBody(chunks, isJson, limits)
    if (violation) throw new McpRequestLimitError(violation, limits)
    // `body` is an accessor on `Request.prototype`; an own property shadows it
    // on this request only. The original stream is already consumed, so
    // anything reading it instead fails rather than getting past the check.
    Object.defineProperty(req, 'body', {
      configurable: true,
      enumerable: true,
      value: replay(chunks),
    })
    return settings
  }

  return { overrideAuth, plugin: limitPlugin(limits, guarded) }
}
