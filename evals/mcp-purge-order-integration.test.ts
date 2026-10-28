// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createFixturePage } from './fixtures/payload-fixtures'

/**
 * An MCP write's purges must be queued before the route handler's response
 * resolves (#274), against the REAL MCP endpoint on a REAL Payload.
 *
 * @remarks **What this pins.** Next sends a route handler's pending
 * `revalidatePath`/`revalidateTag` calls once, when the handler's `Response`
 * resolves; anything queued later is dropped without an error. The MCP
 * transport (`mcp-handler` over the MCP SDK, SSE mode) returns its streaming
 * response before it runs the tool, so without `bufferMcpResponses` the page
 * hook's purges arrive after that moment (measured on a local production
 * build, #274). This test drives `POST /api/mcp` through Payload's own
 * endpoint dispatcher, `handleEndpoints`, which is exactly what the
 * `[...slug]` route handler awaits, and records the order of two events: each
 * purge call, and the dispatcher's response resolving. A purge recorded after
 * the response resolved is a purge production would drop.
 *
 * Everything between the route and the hook is real: the plugin's endpoint and
 * API-key auth, `mcp-handler`, the SDK transport, the `updatePages` tool, the
 * update operation and `revalidatePage`. So an upgrade of any of them that
 * brings the early return back fails here. Only Next's flush itself is
 * modelled (as "the response resolved"); `next/cache` is stubbed, as in every
 * file of this tier, because the real one throws outside a Next request scope.
 */

const events = vi.hoisted(() => [] as string[])

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => events.push(`purge path ${path}`),
  revalidateTag: (tag: string) => events.push(`purge tag ${tag}`),
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-mcp-purge-order'

describe('MCP purge-order integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'POST /api/mcp purge order (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let config: Awaited<typeof import('../src/payload.config').default>
    let pageId: number | string
    const apiKey = randomUUID()

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `${MARKER}%` } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'payload-mcp-api-keys',
        where: { label: { equals: MARKER } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'users',
        where: { email: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      config = await (await import('../src/payload.config')).default
      payload = await getPayload({ config })
      await cleanup()

      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: `${MARKER}@example.test`,
          name: MARKER,
          password: randomUUID(),
        },
      })
      await payload.create({
        collection: 'payload-mcp-api-keys',
        overrideAccess: true,
        data: {
          apiKey,
          enableAPIKey: true,
          label: MARKER,
          pages: { find: true, update: true },
          user: user.id,
        } as never,
      })
      const page = await createFixturePage(payload, {
        data: {
          title: MARKER,
          slug: MARKER,
          _status: 'draft',
          layout: [{ blockType: 'spacer', size: 'md' }],
        },
      })
      pageId = page.id
    }, 120_000)

    // Destroy the pool in a `finally`, as the siblings do: an open Postgres
    // connection keeps vitest waiting, and a rejected cleanup must not hang
    // the run on the failure worth reporting.
    afterAll(async () => {
      try {
        await cleanup()
      } finally {
        await payload?.db?.destroy?.()
      }
    }, 60_000)

    it('queues the publish purges before the endpoint response resolves', async () => {
      const { handleEndpoints } = await import('payload')
      events.length = 0

      const response = await handleEndpoints({
        config,
        path: '/api/mcp',
        request: new Request('http://localhost:3000/api/mcp', {
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              arguments: { id: pageId, _status: 'published', slugLock: true },
              name: 'updatePages',
            },
          }),
          headers: {
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      })
      events.push('response resolved')
      // Reading the body lets an unbuffered tool call finish, so a regression
      // shows up as purges AFTER 'response resolved' rather than as none.
      const body = await response.text()

      expect(response.status).toBe(200)
      expect(body).toContain('updated successfully')
      expect(events).toContain('purge tag pages')
      expect(events).toContain(`purge path /${MARKER}`)
      expect(
        events.at(-1),
        `every purge must precede the response (#274); order was: ${events.join(' → ')}`,
      ).toBe('response resolved')
    }, 60_000)
  },
)
