// @vitest-environment node
import type { Config, Endpoint, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { plugins } from '@/plugins'

import {
  bufferMcpResponses,
  bufferResponse,
  MCP_ENDPOINT_PATH,
} from './bufferMcpResponses'

/**
 * Unit pins for the #274 fix. The end-to-end pin (the real MCP endpoint on a
 * real Payload, with the hooks' purges ordered against the handler's return)
 * is `evals/mcp-purge-order-integration.test.ts`.
 */

/** A stream that writes `chunks` one macrotask apart, logging when it closes. */
const slowStream = (chunks: string[], events: string[]) =>
  new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      events.push('stream closed')
      controller.close()
    },
  })

const endpoint = (method: Endpoint['method'], path: string): Endpoint => ({
  handler: () => new Response(`${method} ${path}`),
  method,
  path,
})

const apply = (config: Partial<Config>) =>
  bufferMcpResponses()(config as Config) as Config

describe('bufferResponse', () => {
  it('resolves only after the producer has closed the stream', async () => {
    const events: string[] = []
    const streamed = new Response(
      slowStream(['event: message\n', 'data: {"id":1}\n\n'], events),
      {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
        statusText: 'OK',
      },
    )

    const buffered = await bufferResponse(streamed)
    events.push('buffered')

    expect(events).toEqual(['stream closed', 'buffered'])
    expect(buffered.status).toBe(200)
    expect(buffered.statusText).toBe('OK')
    expect(buffered.headers.get('content-type')).toBe('text/event-stream')
    expect(await buffered.text()).toBe('event: message\ndata: {"id":1}\n\n')
  })

  it('returns a bodiless response (a 202 for a notification) unchanged', async () => {
    const accepted = new Response(null, { status: 202 })
    expect(await bufferResponse(accepted)).toBe(accepted)
  })
})

describe('bufferMcpResponses', () => {
  it('wraps only POST /mcp and leaves every other endpoint as it was', async () => {
    const get = endpoint('get', MCP_ENDPOINT_PATH)
    const other = endpoint('post', '/revalidate')
    const events: string[] = []
    const post: Endpoint = {
      handler: () => new Response(slowStream(['data: ok\n\n'], events)),
      method: 'post',
      path: MCP_ENDPOINT_PATH,
    }

    const { endpoints = [] } = apply({ endpoints: [get, post, other] })

    expect(endpoints[0]).toBe(get)
    expect(endpoints[2]).toBe(other)
    expect(endpoints[1]).not.toBe(post)
    const response = await endpoints[1].handler({} as PayloadRequest)
    events.push('handler returned')
    expect(events).toEqual(['stream closed', 'handler returned'])
    expect(await response.text()).toBe('data: ok\n\n')
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
    // A plugin upgrade that moves the endpoint must not quietly bring the
    // dropped purges back.
    expect(() => apply({ endpoints })).toThrow(/#274/)
  })

  it('runs after @payloadcms/plugin-mcp in the real plugins array', async () => {
    // Payload's buildConfig sorts plugins by `order` and applies them in turn
    // (payload/dist/config/build.js). Applying them the same way proves the
    // MCP endpoint exists when the wrapper looks for it: if it ran first, it
    // would throw.
    const sorted = [...plugins].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    let config = { collections: [] } as unknown as Config
    for (const plugin of sorted) config = await plugin(config)

    const mcpPosts = (config.endpoints ?? []).filter(
      (e) => e.path === MCP_ENDPOINT_PATH && e.method === 'post',
    )
    expect(mcpPosts).toHaveLength(1)
    expect(sorted.at(-1)?.order).toBe(Number.MAX_SAFE_INTEGER)
  })
})
