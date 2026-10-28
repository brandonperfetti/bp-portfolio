import type { Config, Endpoint, Plugin } from 'payload'

/** The path `@payloadcms/plugin-mcp` mounts its JSON-RPC endpoint on, under `/api`. */
export const MCP_ENDPOINT_PATH = '/mcp'

/**
 * Read a response's body to the end and return an equivalent response that
 * carries the bytes instead of the stream.
 *
 * @param response - The response to buffer. A response without a body (a 202
 * for a JSON-RPC notification, say) is returned as it is.
 * @returns A response with the same status and headers whose body is already
 * complete, so whoever awaits it has also waited for every byte the producer
 * wrote.
 */
export const bufferResponse = async (response: Response): Promise<Response> => {
  if (!response.body) return response
  const body = await response.arrayBuffer()
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

/**
 * Make `POST /api/mcp` return only after the tool call, and so its hooks'
 * purges, has finished (#274).
 *
 * @returns A plugin that replaces the MCP plugin's POST handler with one that
 * buffers its response. Its `order` is the largest safe integer: Payload runs
 * plugins sorted by `order` (`mcpPlugin` declares 10), and the endpoint has to
 * exist before it can be wrapped.
 *
 * @remarks **Why.** Next sends a route handler's pending `revalidatePath` /
 * `revalidateTag` calls once, as soon as the handler's `Response` resolves
 * (`resolvePendingRevalidations()`, next 16.3.4
 * `dist/server/route-modules/app-route/module.js`). The MCP transport
 * (`mcp-handler` 1.1.0 over `@modelcontextprotocol/sdk` 1.30.0, SSE mode)
 * returns its streaming `Response` before it runs the tool, so the purges the
 * write's `afterChange`/`afterDelete` hooks queue land after that flush and are
 * dropped without an error. Measured on a local production build: the MCP
 * handler resolved 279 ms before the page hook queued its purges, and Next
 * flushed nothing for `/api/mcp`; on `PATCH /api/pages/:id` the hook queued
 * them 4 ms before the handler resolved (#274).
 *
 * Reading the body to the end waits for the transport to close the stream,
 * which it does only after writing the tool's result, so the hooks have run
 * by the time this handler returns. A tool call's reply is one small JSON-RPC
 * message, so holding it costs nothing. Only `POST` is wrapped: it is the only
 * method that runs tools, and the plugin's `GET` answers "method not allowed".
 *
 * Throws at config build when there is not exactly one `POST /mcp` endpoint,
 * so a plugin upgrade that moves or renames it fails the build rather than
 * silently bringing the dropped purges back.
 */
export const bufferMcpResponses = (): Plugin =>
  Object.assign(
    (config: Config): Config => {
      let wrapped = 0
      const endpoints = (config.endpoints ?? []).map((endpoint): Endpoint => {
        if (endpoint.path !== MCP_ENDPOINT_PATH || endpoint.method !== 'post') {
          return endpoint
        }
        wrapped += 1
        const { handler } = endpoint
        return {
          ...endpoint,
          handler: async (req) => bufferResponse(await handler(req)),
        }
      })
      if (wrapped !== 1) {
        throw new Error(
          `bufferMcpResponses: expected one POST ${MCP_ENDPOINT_PATH} endpoint from @payloadcms/plugin-mcp, found ${wrapped}; MCP writes would skip their cache purges (#274)`,
        )
      }
      return { ...config, endpoints }
    },
    { order: Number.MAX_SAFE_INTEGER },
  )
