// @vitest-environment node
import { createRequire } from 'node:module'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * The `github-repos` collection against REAL Postgres + pgvector (#147).
 *
 * @remarks `src/lib/ai/githubReposSync.test.ts` counts what the sync CALLS —
 * that a no-op re-sync makes zero provider calls, that a stale document is
 * deleted. This file answers the question those counts cannot: after the
 * delete, is the repository still RETRIEVABLE?
 *
 * The distinction is the whole never-leak bar. "`deleteDocumentEmbeddings` was
 * called" is a statement about this code; "an anonymous retrieval over real
 * pgvector no longer returns that README" is a statement about what a visitor
 * can get, and only the second one is the acceptance criterion #147 wrote. A
 * DELETE scoped to the wrong collection, or a sweep that removed some chunks of
 * a multi-chunk repository and left the rest, would pass the unit tier and fail
 * here.
 *
 * Environment mirrors `pgvector-integration.test.ts` exactly: it runs in the
 * `e2e` job, which has `pgvector/pgvector:pg16`, a real `pnpm migrate` and no
 * provider key. `embedQuery` is mocked to THROW, so a path that quietly started
 * embedding at query time fails the build rather than billing for it.
 *
 * Every row written carries a `doc_id` at or above {@link DOC_ID_OFFSET} and
 * `afterAll` deletes exactly those.
 */

/** Keeps every row this file writes in its own id range, for exact cleanup. */
const DOC_ID_OFFSET = 910_000

const { stubVector, embedChunksStub, embedQueryStub } = vi.hoisted(() => {
  const dimensions = 1536

  /**
   * A deterministic unit vector for a string — one-hot on a hashed axis.
   *
   * @remarks Cosine similarity is exactly 1 against the same text and exactly
   * 0 against anything hashing elsewhere, so every score below is an
   * arithmetic fact. That is what makes "the row came back" provably a
   * statement about the WHERE clause and not about embedding quality. Copied
   * from `pgvector-integration.test.ts` rather than imported: a `vi.mock`
   * factory is hoisted above this module's imports, so it can only close over
   * `vi.hoisted` values.
   */
  const toVector = (text: string): number[] => {
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    const vector = new Array<number>(dimensions).fill(0)
    vector[hash % dimensions] = 1
    return vector
  }

  return {
    stubVector: toVector,
    embedChunksStub: vi.fn(async (contents: readonly string[]) =>
      contents.map((content) => toVector(content)),
    ),
    embedQueryStub: vi.fn(async () => {
      throw new Error(
        'PG TIER: embedQuery was called. This tier must never reach a provider.',
      )
    }),
  }
})

vi.mock('../src/lib/ai/embeddings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/lib/ai/embeddings')>()
  return { ...actual, embedChunks: embedChunksStub, embedQuery: embedQueryStub }
})

import { toVectorLiteral } from '../src/lib/ai/embeddings'
import type { CorvusEmbeddingsDb } from '../src/lib/ai/embeddingsStore'
import { chunkGithubRepo } from '../src/lib/ai/githubRepos'
import {
  deleteGithubRepoDocuments,
  readIndexedRepoDocIds,
  staleRepoDocIds,
  syncGithubRepoEmbeddings,
} from '../src/lib/ai/githubReposSync'
import {
  applySimilarityFloor,
  buildRetrievalQuery,
  toRows,
} from '../src/lib/ai/retrieval'
import { GITHUB_REPO_FIXTURES } from './fixtures/github-repos'

/** `pg` + `drizzle-orm` through the adapter that depends on them. */
const requireFromRoot = createRequire(import.meta.url)
const requireFromAdapter = createRequire(
  requireFromRoot.resolve('@payloadcms/db-postgres'),
)
const { Pool } = requireFromAdapter('pg')
const { drizzle } = requireFromAdapter('drizzle-orm/node-postgres')

const connectionString = process.env.DATABASE_URI

let pool: { end: () => Promise<void> }
let db: CorvusEmbeddingsDb & { execute: (query: unknown) => Promise<unknown> }

/** The fixture repos, id-shifted into this file's private range. */
const repos = GITHUB_REPO_FIXTURES.map((repo) => ({
  ...repo,
  id: repo.id + DOC_ID_OFFSET,
}))

const bpPortfolio = repos.find((repo) => repo.name === 'bp-portfolio')!
const macos = repos.find((repo) => repo.name === 'macos-portfolio')!

/** Retrieve exactly as `retrieveCorvusContext` would, minus the embed call. */
async function retrieve(
  queryText: string,
  isAuthenticated: boolean,
  { topK = 5, floor = 0.5 } = {},
) {
  const result = await db.execute(
    buildRetrievalQuery(
      toVectorLiteral(stubVector(queryText)),
      isAuthenticated,
      topK * 4,
    ),
  )
  return applySimilarityFloor(toRows(result), topK, floor)
}

/**
 * The tier skips without a database — so CI is not allowed to be without one.
 *
 * @remarks Same guard `pgvector-integration.test.ts` carries, for the same
 * reason: drop `DATABASE_URI` from the `e2e` job and this whole file turns into
 * silent skips with a green tick beside them. This one assertion runs
 * unconditionally so the skip can only ever be a local convenience.
 */
it('refuses to be skipped in CI', () => {
  if (!process.env.CI) return
  expect(
    connectionString,
    'the e2e job must set DATABASE_URI, or the github-repos tier silently skips',
  ).toBeTruthy()
})

describe.skipIf(!connectionString)(
  'github-repos against real Postgres + pgvector',
  () => {
    beforeAll(async () => {
      pool = new Pool({ connectionString })
      db = drizzle(pool)
      const { sql } = await import('@payloadcms/db-postgres')
      await db.execute(
        sql`DELETE FROM "corvus_embeddings" WHERE "doc_id" >= ${DOC_ID_OFFSET}`,
      )
    })

    afterAll(async () => {
      if (!pool) return
      const { sql } = await import('@payloadcms/db-postgres')
      await db.execute(
        sql`DELETE FROM "corvus_embeddings" WHERE "doc_id" >= ${DOC_ID_OFFSET}`,
      )
      await pool.end()
    })

    it('indexes every fixture repo under collection github-repos', async () => {
      const { sql } = await import('@payloadcms/db-postgres')
      embedChunksStub.mockClear()

      for (const repo of repos) {
        const outcome = await syncGithubRepoEmbeddings({ db, repo })
        expect(outcome.written).toBeGreaterThan(0)
      }

      const rows = toRows(
        await db.execute(sql`
          SELECT "collection", "doc_id", "source_url", "visibility"
          FROM "corvus_embeddings" WHERE "doc_id" >= ${DOC_ID_OFFSET}
        `),
      )
      expect(rows.length).toBeGreaterThanOrEqual(repos.length)
      for (const row of rows) {
        expect(row.collection).toBe('github-repos')
        expect(row.visibility).toBe('public')
        expect(String(row.source_url)).toMatch(
          /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/,
        )
      }
      expect(embedQueryStub).not.toHaveBeenCalled()
    })

    it('re-syncing an unchanged repo makes ZERO provider calls', async () => {
      // The spend acceptance criterion, asserted against the real stored rows
      // rather than a fake's row map — so it also proves the hash round-trips
      // through Postgres unchanged.
      embedChunksStub.mockClear()

      for (const repo of repos) {
        const outcome = await syncGithubRepoEmbeddings({ db, repo })
        expect(outcome.skipped, `${repo.fullName} must be a no-op`).toBe(true)
      }

      expect(embedChunksStub).not.toHaveBeenCalled()
    })

    it('an anonymous turn can retrieve a public repo document', async () => {
      const chunk = chunkGithubRepo(bpPortfolio)[0]
      const snippets = await retrieve(chunk.content, false)

      expect(snippets.length).toBeGreaterThan(0)
      expect(snippets[0].collection).toBe('github-repos')
      expect(snippets[0].sourceUrl).toBe(
        `https://github.com/${bpPortfolio.fullName}`,
      )
    })

    it('a repo dropped from the listing is DELETED and no longer retrievable', async () => {
      // The never-leak bar as #147 states it. `macos-portfolio` stands in for
      // a repository made private: it simply stops appearing in the listing,
      // so the sweep must remove it — and "removed" has to mean a retrieval
      // over real pgvector cannot return it, not merely that a DELETE ran.
      const chunk = chunkGithubRepo(macos)[0]
      const before = await retrieve(chunk.content, false)
      expect(
        before.some((snippet) =>
          snippet.sourceUrl?.includes('macos-portfolio'),
        ),
        'the fixture must be retrievable before the sweep, or this proves nothing',
      ).toBe(true)

      const indexed = (await readIndexedRepoDocIds(db)).filter(
        (id) => id >= DOC_ID_OFFSET,
      )
      const stillListed = repos
        .filter((repo) => repo.id !== macos.id)
        .map((repo) => repo.id)
      const stale = staleRepoDocIds(indexed, stillListed)
      expect(stale).toEqual([macos.id])

      await deleteGithubRepoDocuments(db, stale)

      const after = await retrieve(chunk.content, false)
      expect(
        after.some((snippet) => snippet.sourceUrl?.includes('macos-portfolio')),
        'a repo removed from the listing must not be retrievable',
      ).toBe(false)

      // And an AUTHENTICATED turn must not reach it either: this is a deletion,
      // not a gating flip, so there is no viewer for whom it comes back.
      const authenticated = await retrieve(chunk.content, true)
      expect(
        authenticated.some((snippet) =>
          snippet.sourceUrl?.includes('macos-portfolio'),
        ),
      ).toBe(false)
    })

    it('the sweep never touches a CMS collection’s rows', async () => {
      const { sql } = await import('@payloadcms/db-postgres')

      // A row that is NOT a repo, sharing this file's id range, written
      // directly so its survival is a statement about the DELETE's scoping.
      const sentinelId = DOC_ID_OFFSET + 99_000
      await db.execute(sql`
        INSERT INTO "corvus_embeddings"
          ("collection", "doc_id", "chunk_index", "title", "content",
           "content_hash", "source_url", "visibility", "published_at",
           "embedding", "model", "updated_at")
        VALUES
          ('posts', ${sentinelId}, 0, 'Sentinel', 'SENTINEL_BODY',
           'sentinel-hash', '/articles/sentinel', 'public', NULL,
           ${toVectorLiteral(stubVector('SENTINEL_BODY'))}::vector,
           'text-embedding-3-small', now())
      `)

      await deleteGithubRepoDocuments(db, [sentinelId])

      const [{ n }] = toRows(
        await db.execute(
          sql`SELECT count(*)::int AS n FROM "corvus_embeddings" WHERE "doc_id" = ${sentinelId}`,
        ),
      ) as Array<{ n: number }>
      expect(
        n,
        'deleting a repo doc_id must not remove a posts row that shares it',
      ).toBe(1)
    })
  },
)
