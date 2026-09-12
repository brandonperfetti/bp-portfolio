// @vitest-environment node
import { createRequire } from 'node:module'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createFixturePage } from './fixtures/payload-fixtures'

/**
 * Candidate (c) for #209, measured: does `getPublishedPagePaths` itself ever
 * omit a freshly published parent whose children are already published?
 *
 * @remarks **The question this file answers, and the one it does not.**
 * `[measured, prod 2026-09-09 21:56Z]` a freshly generated `/sitemap.xml`
 * (`x-vercel-cache: MISS`, `age: 0`) omitted `/work` 28.5 h after page 18 went
 * `_status: published`, while listing its four children and `/now`. The emit
 * filter was ruled out by a unit probe over the real production paths, which
 * leaves three candidates for the surviving value; (c) is the only one that can
 * be settled without a deployment, because it lives in the READ rather than in
 * the cache: `getPublishedPagePaths` runs `overrideAccess: false` (so
 * `authenticatedOrPublished` adds its own `_status` constraint on top of the
 * explicit one) with `draft: false`, against a `pages` main-table row whose
 * `_status` could in principle lag the version table right after a publish.
 *
 * If that reproduces, the cache is innocent and #209's fix changes shape
 * entirely. So it is measured first, against a real Payload on a real Postgres,
 * with the cache OUT of the picture: `next/cache` is stubbed, so `'use cache'`
 * is an inert string directive in this environment and `cacheTag`/`cacheLife`
 * are no-ops. What runs is the function's body — one `payload.find` and the
 * filter — and nothing else.
 *
 * **The state is seeded the way production reached it**, which is the whole
 * point: children published UNDER A DRAFT PARENT. The #180 guards refuse that
 * through the API by design, and production only has it because the rows
 * predate them, so the children are flipped to `published` by direct SQL — the
 * same technique, for the same reason, as
 * `evals/audit-served-prefix-integration.test.ts`. The parent is then published
 * through the real Local API, which is the transition whose after-effect #209
 * is about.
 *
 * What this file cannot answer: whether a CACHED value survived the purges on
 * production. That is candidates (a) and (b), it needs a deployment, and it is
 * Brandon's isolation step. This test is the regression guard for the half that
 * can be pinned here.
 */

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

/**
 * `pg`, resolved through the adapter that depends on it.
 *
 * @remarks Not a direct dependency of this repo; same shim and same reasoning
 * as `pgvector-integration.test.ts` and the audit eval.
 */
const requireFromRoot = createRequire(import.meta.url)
const requireFromAdapter = createRequire(
  requireFromRoot.resolve('@payloadcms/db-postgres'),
)
const { Client } = requireFromAdapter('pg') as {
  Client: new (config: { connectionString?: string }) => {
    connect: () => Promise<void>
    end: () => Promise<void>
    query: (
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
  }
}

const connectionString = process.env.DATABASE_URI

/** Marks every row this file writes, for exact cleanup. */
const MARKER = 'zz-sitemap-page-paths'

/** A minimal valid `layout` — the field is `required`, so `[]` is rejected. */
const layout = [{ blockType: 'spacer', size: 'md' }]

describe('sitemap page paths integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'getPublishedPagePaths after a parent publish (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let client: InstanceType<typeof Client>
    let getPublishedPagePaths: () => Promise<string[]>
    let parentId: number | string

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      ;({ getPublishedPagePaths } = await import('../src/lib/cms/pagesRepo'))

      client = new Client({ connectionString })
      await client.connect()
      await cleanup()

      // 1. The parent, DRAFT — production's `/work` before 2026-09-08 17:20Z.
      const parent = await createFixturePage(payload, {
        data: {
          title: `${MARKER}-parent`,
          slug: `${MARKER}-parent`,
          _status: 'draft',
          layout,
        },
      })
      parentId = parent.id

      // 2. Two children, created as drafts because #180 refuses to publish a
      //    page under an unpublished parent through the API…
      for (const child of ['a', 'b']) {
        await createFixturePage(payload, {
          data: {
            title: `${MARKER}-child-${child}`,
            slug: `${MARKER}-child-${child}`,
            parent: parent.id,
            _status: 'draft',
            layout,
          },
        })
      }

      // 3. …and then published by direct SQL, which is exactly how production
      //    came to serve four 200s under a 404: the rows predate the guards.
      await client.query(
        `UPDATE pages SET _status = 'published' WHERE slug LIKE $1`,
        [`${MARKER}-child-%`],
      )
    }, 180_000)

    afterAll(async () => {
      try {
        await cleanup()
      } finally {
        // Optional-call: when `beforeAll` failed before `new Client`, an
        // unguarded `client.end()` throws a TypeError here and REPLACES the
        // real setup error in the report.
        await client?.end()
      }
    })

    it('lists the children while the parent is still a draft', async () => {
      // The control. If this failed, the reproduction below would prove nothing
      // — the seeded state has to match production's before the publish.
      const paths = await getPublishedPagePaths()
      expect(paths).toContain(`${MARKER}-parent/${MARKER}-child-a`)
      expect(paths).toContain(`${MARKER}-parent/${MARKER}-child-b`)
      expect(paths).not.toContain(`${MARKER}-parent`)
    }, 60_000)

    it('lists the parent as soon as it is published (candidate (c))', async () => {
      await payload.update({
        collection: 'pages',
        id: parentId,
        overrideAccess: true,
        draft: false,
        data: { _status: 'published' } as never,
      })

      const paths = await getPublishedPagePaths()

      // A FAILURE here is the #209 cause: the read itself would be omitting a
      // published parent, the cache would be innocent, and the fix would move
      // from "purge the route" to "fix the query".
      expect(paths).toContain(`${MARKER}-parent`)
      expect(paths).toContain(`${MARKER}-parent/${MARKER}-child-a`)
    }, 60_000)

    it('agrees with the main table, so the projection is not the filter', async () => {
      // Belt and braces on the same measurement, from the other side: whatever
      // `_status` the main row carries is what the repo reports. If these two
      // ever disagreed, the repo's `draft: false` + `overrideAccess: false`
      // pair would be the thing to look at.
      const { rows } = await client.query(
        `SELECT path, _status FROM pages WHERE slug = $1`,
        [`${MARKER}-parent`],
      )
      expect(rows[0]).toMatchObject({
        path: `${MARKER}-parent`,
        _status: 'published',
      })
      expect(await getPublishedPagePaths()).toContain(`${MARKER}-parent`)
    }, 60_000)
  },
)
