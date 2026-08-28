// @vitest-environment node
import { createRequire } from 'node:module'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Corvus retrieval against REAL Postgres + pgvector (#82, eval tier 2).
 *
 * @remarks The site-fact evals in `site-facts.eval.ts` answer "does Corvus use
 * what it is given". This file answers the other half — "is what it is given
 * correct, and is it allowed to have it" — and the two need opposite
 * environments. The `evals` job has a provider key and no database; the `e2e`
 * job has `pgvector/pgvector:pg16`, a real `pnpm migrate` and `pnpm seed:e2e`,
 * and no provider key at all. So this runs in `e2e`, and its embedder is a
 * stub. Zero provider dollars, by construction rather than by discipline:
 * `embedQuery` is mocked to THROW, so a code path that quietly started
 * embedding at query time would fail the build rather than bill for it.
 *
 * What is real here: the migrated schema, the HNSW index, `chunkDocument`,
 * `syncDocumentEmbeddings` and every SQL builder in `embeddingsStore.ts`, the
 * `buildRetrievalQuery` predicate pair, `applySimilarityFloor`, and the two
 * hooks from `src/hooks/corvusEmbeddings.ts` invoked exactly as Payload
 * invokes them. What is fake: the embedding vectors, and the `req` the hooks
 * receive — a Payload boot inside Vitest would add minutes and prove nothing
 * these assertions do not.
 *
 * The corpus is the same captured fixture corpus the tier-1 evals use, run
 * through a stub-embedded backfill, plus three clearly synthetic records for
 * the gating and scheduling cases. Synthetic because a probe of the live API
 * on 2026-08-28 found `totalDocs: 0` for `access.visibility = gated`: there is
 * no gated post in production to copy, and inventing one and calling it real
 * content would be worse than labelling it.
 *
 * Every row written carries a `doc_id` at or above {@link DOC_ID_OFFSET}, and
 * `afterAll` deletes exactly those, so the job's later Playwright steps see the
 * database they would have seen anyway.
 */

/** Keeps every row this test writes in its own id range, for exact cleanup. */
const DOC_ID_OFFSET = 900_000

/**
 * The stubbed embedder, hoisted above the module graph.
 *
 * @remarks `vi.mock` is hoisted to the top of the file, so anything its
 * factory closes over has to be hoisted too — hence `vi.hoisted` rather than
 * plain consts. The hash is a hand-rolled FNV-1a instead of `node:crypto`
 * because a hoisted factory runs before this module's imports exist.
 */
const { EMBEDDING_DIMENSIONS, stubVector, embedChunksStub, embedQueryStub } =
  vi.hoisted(() => {
    /** Dimension the migration pins the `embedding` column to. */
    const dimensions = 1536

    /**
     * A deterministic unit vector for a string.
     *
     * One-hot on an axis chosen by hashing the text, so cosine similarity is
     * exactly 1 against the same text and exactly 0 against anything that
     * hashes elsewhere. That makes every score in this file an arithmetic fact
     * rather than an approximation, and it means a row can only be returned
     * because the WHERE clause let it through — the property every gating
     * assertion rests on.
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
      EMBEDDING_DIMENSIONS: dimensions,
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

import { chunkDocument } from '../src/lib/ai/chunking'
import { toVectorLiteral } from '../src/lib/ai/embeddings'
import {
  type CorvusEmbeddingsDb,
  readStoredChunks,
} from '../src/lib/ai/embeddingsStore'
import {
  applySimilarityFloor,
  buildRetrievalQuery,
  toRows,
} from '../src/lib/ai/retrieval'
import {
  deleteCorvusEmbeddings,
  refreshCorvusEmbeddings,
} from '../src/hooks/corvusEmbeddings'
import { SITE_FIXTURE_DOCS } from './fixtures/site-content'

/**
 * `pg` and `drizzle-orm`, resolved through the adapter that depends on them.
 *
 * @remarks Neither is a direct dependency of this repo — they arrive under
 * `@payloadcms/db-postgres`, and pnpm's strict layout means a bare
 * `import 'pg'` from here does not resolve. Resolving them THROUGH the adapter
 * is the version-agnostic way to reach the exact copies Payload itself uses,
 * as opposed to hard-coding a `node_modules/.pnpm/pg@x.y.z/...` path that
 * would rot on the next bump.
 *
 * `drizzle(pool)` then yields a `NodePgDatabase` — the same class
 * `payload.db.drizzle` is — so `execute()` here behaves exactly as it does in
 * production, down to the `QueryResult` shape `toRows` normalises.
 */
const requireFromRoot = createRequire(import.meta.url)
const requireFromAdapter = createRequire(
  requireFromRoot.resolve('@payloadcms/db-postgres'),
)
const { Pool } = requireFromAdapter('pg')
const { drizzle } = requireFromAdapter('drizzle-orm/node-postgres')

const connectionString = process.env.DATABASE_URI

let pool: { end: () => Promise<void>; query: (...args: never[]) => never }
let db: CorvusEmbeddingsDb & {
  execute: (query: unknown) => Promise<unknown>
}

/** A `req` shaped like the one Payload hands an afterChange/afterDelete hook. */
const hookReq = (extra: Record<string, unknown> = {}) =>
  ({
    payload: {
      db: { drizzle: db },
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    },
    context: {},
    ...extra,
  }) as never

/** Run the real afterChange hook for a document. */
async function runAfterChange(
  collection: 'posts' | 'work-history',
  doc: Record<string, unknown>,
  previousDoc?: Record<string, unknown>,
  req = hookReq(),
): Promise<void> {
  const hook = refreshCorvusEmbeddings(collection)
  await hook({ doc, previousDoc, req } as never)
}

/** Run one retrieval exactly as `retrieveCorvusContext` would, minus the embed. */
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
 * @remarks `describe.skipIf` is what lets a developer run this file locally
 * with no Postgres, and it is also exactly how a whole tier rots away
 * unnoticed: drop `DATABASE_URI` from the `e2e` job and eleven assertions turn
 * into eleven silent skips with a green tick beside them. That is the failure
 * `pnpm eval:ci` already had once. This test runs unconditionally so the skip
 * can only ever be a local convenience.
 */
it('refuses to be skipped in CI', () => {
  if (!process.env.CI) return
  expect(
    connectionString,
    'the e2e job must set DATABASE_URI, or this whole tier silently skips',
  ).toBeTruthy()
})

/** A published, public synthetic post. Not site content — see the file header. */
const SYNTHETIC_PUBLIC = {
  id: DOC_ID_OFFSET + 900,
  title: 'Synthetic Public Fixture',
  slug: 'synthetic-public-fixture',
  _status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  access: { visibility: 'public' },
  excerpt: 'SYNTHETIC_PUBLIC_BODY, written for this test and nowhere else.',
}

/** A published but GATED synthetic post — the anonymous filter's target. */
const SYNTHETIC_GATED = {
  id: DOC_ID_OFFSET + 901,
  title: 'Synthetic Gated Fixture',
  slug: 'synthetic-gated-fixture',
  _status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  access: { visibility: 'gated' },
  excerpt: 'SYNTHETIC_GATED_BODY, which anonymous visitors must never receive.',
}

/** A public post dated into the future — the schedule filter's target. */
const SYNTHETIC_FUTURE = {
  id: DOC_ID_OFFSET + 902,
  title: 'Synthetic Scheduled Fixture',
  slug: 'synthetic-scheduled-fixture',
  _status: 'published',
  publishedAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  access: { visibility: 'public' },
  excerpt: 'SYNTHETIC_FUTURE_BODY, not due for another month.',
}

/** The single chunk a synthetic post produces, for building its query vector. */
const chunkTextOf = (doc: Record<string, unknown>): string =>
  chunkDocument('posts', doc)[0].content

describe.skipIf(!connectionString)(
  'corvus retrieval against real Postgres + pgvector',
  () => {
    beforeAll(async () => {
      pool = new Pool({ connectionString })
      db = drizzle(pool)
      // Leave nothing behind from a previous interrupted run.
      await db.execute(
        (await import('@payloadcms/db-postgres'))
          .sql`DELETE FROM "corvus_embeddings" WHERE "doc_id" >= ${DOC_ID_OFFSET}`,
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

    it('the migration created the table retrieval expects', async () => {
      const { sql } = await import('@payloadcms/db-postgres')
      const columns = toRows(
        await db.execute(sql`
          SELECT "column_name", "udt_name" FROM information_schema.columns
          WHERE "table_name" = 'corvus_embeddings' ORDER BY "ordinal_position"
        `),
      )
      expect(columns.map((row) => row.column_name)).toEqual([
        'id',
        'collection',
        'doc_id',
        'chunk_index',
        'title',
        'content',
        'content_hash',
        'source_url',
        'visibility',
        'published_at',
        'embedding',
        'model',
        'updated_at',
      ])
      expect(
        columns.find((row) => row.column_name === 'embedding')?.udt_name,
      ).toBe('vector')

      const indexes = toRows(
        await db.execute(
          sql`SELECT "indexdef" FROM pg_indexes WHERE "tablename" = 'corvus_embeddings'`,
        ),
      )
      expect(
        indexes.some((row) =>
          /USING hnsw.*vector_cosine_ops/i.test(String(row.indexdef)),
        ),
        'the cosine index buildRetrievalQuery sorts against must exist',
      ).toBe(true)

      const rls = toRows(
        await db.execute(sql`
          SELECT "relrowsecurity", "relforcerowsecurity" FROM pg_class
          WHERE "relname" = 'corvus_embeddings'
        `),
      )[0]
      expect(rls.relrowsecurity, 'RLS must be enabled').toBe(true)
      expect(rls.relforcerowsecurity, 'RLS must never be FORCEd').toBe(false)
    })

    it('a stub-embedded backfill of the fixture corpus writes rows', async () => {
      const { sql } = await import('@payloadcms/db-postgres')
      embedChunksStub.mockClear()

      // The captured site corpus, id-shifted into this test's range. Every
      // document goes through the same `syncDocumentEmbeddings` the hooks and
      // `scripts/backfill-corvus-embeddings.ts` use, so "the backfill works"
      // is being asserted about the real write path.
      for (const { collection, doc } of SITE_FIXTURE_DOCS) {
        await runAfterChange(collection as 'posts' | 'work-history', {
          ...doc,
          id: Number(doc.id) + DOC_ID_OFFSET,
        })
      }

      const [{ n }] = toRows(
        await db.execute(
          sql`SELECT count(*)::int AS n FROM "corvus_embeddings" WHERE "doc_id" >= ${DOC_ID_OFFSET}`,
        ),
      ) as Array<{ n: number }>
      expect(n).toBe(SITE_FIXTURE_DOCS.length)
      expect(embedChunksStub).toHaveBeenCalled()
      expect(embedQueryStub).not.toHaveBeenCalled()

      // Re-running is a no-op: the content hash matches, so nothing embeds.
      embedChunksStub.mockClear()
      for (const { collection, doc } of SITE_FIXTURE_DOCS) {
        await runAfterChange(collection as 'posts' | 'work-history', {
          ...doc,
          id: Number(doc.id) + DOC_ID_OFFSET,
        })
      }
      expect(
        embedChunksStub,
        'an unchanged document must not be re-embedded',
      ).not.toHaveBeenCalled()
    })

    it('an anonymous query never returns a gated row, and a signed-in one does', async () => {
      await runAfterChange('posts', SYNTHETIC_PUBLIC)
      await runAfterChange('posts', SYNTHETIC_GATED)

      const gatedQuery = chunkTextOf(SYNTHETIC_GATED)

      const anonymous = await retrieve(gatedQuery, false)
      expect(
        anonymous.some((snippet) =>
          snippet.content.includes('SYNTHETIC_GATED_BODY'),
        ),
        'the gated row is the EXACT vector match here; only the visibility predicate can exclude it',
      ).toBe(false)

      const signedIn = await retrieve(gatedQuery, true)
      const gatedSnippet = signedIn.find((snippet) =>
        snippet.content.includes('SYNTHETIC_GATED_BODY'),
      )
      expect(
        gatedSnippet,
        'a signed-in visitor may receive gated content',
      ).toBeDefined()
      // Identical vectors ⇒ cosine distance 0 ⇒ score exactly 1.
      expect(Math.abs((gatedSnippet?.score ?? 0) - 1)).toBeLessThan(1e-9)

      const publicSnippets = await retrieve(
        chunkTextOf(SYNTHETIC_PUBLIC),
        false,
      )
      expect(
        publicSnippets.some((snippet) =>
          snippet.content.includes('SYNTHETIC_PUBLIC_BODY'),
        ),
        'the visibility filter must not also hide public rows',
      ).toBe(true)
    })

    it('excludes a future-dated row from everyone, and keeps NULL-dated rows', async () => {
      await runAfterChange('posts', SYNTHETIC_FUTURE)
      const futureQuery = chunkTextOf(SYNTHETIC_FUTURE)

      for (const isAuthenticated of [false, true]) {
        const snippets = await retrieve(futureQuery, isAuthenticated)
        expect(
          snippets.some((snippet) =>
            snippet.content.includes('SYNTHETIC_FUTURE_BODY'),
          ),
          `scheduled-future rows stay hidden (isAuthenticated=${isAuthenticated})`,
        ).toBe(false)
      }

      // The four flat collections carry no schedule; `published_at IS NULL`
      // must stay retrievable or work history disappears from grounding.
      const workHistory = SITE_FIXTURE_DOCS.find(
        (entry) => entry.collection === 'work-history',
      )!
      const chunk = chunkDocument('work-history', {
        ...workHistory.doc,
        id: Number(workHistory.doc.id) + DOC_ID_OFFSET,
      })[0]
      const snippets = await retrieve(chunk.content, false)
      expect(
        snippets.some((snippet) => snippet.collection === 'work-history'),
      ).toBe(true)
    })

    it('an afterChange body edit refreshes the stored row', async () => {
      embedChunksStub.mockClear()
      const edited = {
        ...SYNTHETIC_PUBLIC,
        excerpt: 'SYNTHETIC_EDITED_BODY, rewritten after the first save.',
      }
      await runAfterChange('posts', edited, SYNTHETIC_PUBLIC)
      expect(embedChunksStub, 'a changed body must re-embed').toHaveBeenCalled()

      const snippets = await retrieve(chunkTextOf(edited), false)
      expect(
        snippets.some((snippet) =>
          snippet.content.includes('SYNTHETIC_EDITED_BODY'),
        ),
        'the edit must be retrievable without a redeploy',
      ).toBe(true)

      const stale = await retrieve(chunkTextOf(SYNTHETIC_PUBLIC), false)
      expect(
        stale.some((snippet) =>
          snippet.content.includes('SYNTHETIC_PUBLIC_BODY'),
        ),
        'the superseded chunk must be gone, not merely outranked',
      ).toBe(false)
    })

    it('a metadata-only public → gated flip is corrected WITHOUT embedding', async () => {
      // The bypass this closes: flipping visibility changes no body text, so a
      // hash-only comparison reports "unchanged" and the stored row keeps
      // saying `public` — leaving a now-gated article's text reachable by
      // anonymous chat turns indefinitely.
      const published = {
        ...SYNTHETIC_PUBLIC,
        excerpt: 'SYNTHETIC_EDITED_BODY, rewritten after the first save.',
      }
      const before = await retrieve(chunkTextOf(published), false)
      expect(
        before.some((snippet) =>
          snippet.content.includes('SYNTHETIC_EDITED_BODY'),
        ),
      ).toBe(true)

      embedChunksStub.mockClear()
      const flipped = { ...published, access: { visibility: 'gated' } }
      await runAfterChange('posts', flipped, published)
      expect(
        embedChunksStub,
        'a metadata-only flip must cost zero provider dollars',
      ).not.toHaveBeenCalled()

      const stored = await readStoredChunks(
        db,
        'posts',
        Number(SYNTHETIC_PUBLIC.id),
      )
      expect(
        [...stored.values()].every((row) => row.visibility === 'gated'),
      ).toBe(true)

      const anonymous = await retrieve(chunkTextOf(published), false)
      expect(
        anonymous.some((snippet) =>
          snippet.content.includes('SYNTHETIC_EDITED_BODY'),
        ),
        'the now-gated article must stop reaching anonymous visitors immediately',
      ).toBe(false)
      const signedIn = await retrieve(chunkTextOf(published), true)
      expect(
        signedIn.some((snippet) =>
          snippet.content.includes('SYNTHETIC_EDITED_BODY'),
        ),
      ).toBe(true)
    })

    it('unpublishing deletes the rows', async () => {
      const published = {
        ...SYNTHETIC_GATED,
        _status: 'published',
      }
      await runAfterChange(
        'posts',
        { ...published, _status: 'draft' },
        published,
      )
      const stored = await readStoredChunks(
        db,
        'posts',
        Number(SYNTHETIC_GATED.id),
      )
      expect(stored.size).toBe(0)
    })

    it('afterDelete removes every row for the document', async () => {
      const hook = deleteCorvusEmbeddings('posts')
      await hook({ doc: SYNTHETIC_PUBLIC, req: hookReq() } as never)
      const stored = await readStoredChunks(
        db,
        'posts',
        Number(SYNTHETIC_PUBLIC.id),
      )
      expect(stored.size).toBe(0)

      const snippets = await retrieve('SYNTHETIC_EDITED_BODY', true)
      expect(
        snippets.some((snippet) =>
          snippet.content.includes('SYNTHETIC_EDITED_BODY'),
        ),
      ).toBe(false)
    })

    it('the database enforces the dimension pin', async () => {
      // The dimension contract is not only a TypeScript assertion: a model
      // swap that changed the width would fail here, loudly, instead of
      // writing rows the HNSW index cannot use.
      const { sql } = await import('@payloadcms/db-postgres')
      const [{ atttypmod }] = toRows(
        await db.execute(sql`
          SELECT "atttypmod" FROM pg_attribute
          WHERE "attrelid" = 'corvus_embeddings'::regclass AND "attname" = 'embedding'
        `),
      ) as Array<{ atttypmod: number }>
      expect(atttypmod).toBe(EMBEDDING_DIMENSIONS)

      let raised: unknown
      try {
        await db.execute(sql`
          INSERT INTO "corvus_embeddings"
            ("collection", "doc_id", "chunk_index", "content", "content_hash",
             "visibility", "embedding", "model")
          VALUES ('posts', ${DOC_ID_OFFSET + 999}, 0, 'x', 'x', 'public',
                  '[0.1,0.2]'::vector, 'text-embedding-3-small')
        `)
      } catch (error) {
        // Drizzle wraps the driver error ("Failed query: …") and keeps the
        // Postgres message on `cause`, so both are searched.
        raised = error
      }
      expect(raised, 'a 2-element vector must be rejected').toBeDefined()
      const message = `${String(raised)} ${String(
        (raised as { cause?: unknown })?.cause,
      )}`
      expect(message).toMatch(/expected 1536 dimensions/i)
    })

    it('the cosine sort can use the HNSW index', async () => {
      const { sql } = await import('@payloadcms/db-postgres')
      await db.execute(sql`SET enable_seqscan = off`)
      const literal = toVectorLiteral(stubVector('any query'))
      const plan = toRows(
        await db.execute(sql`
          EXPLAIN SELECT "id" FROM "corvus_embeddings"
          ORDER BY "embedding" <=> ${literal}::vector LIMIT 5
        `),
      )
        .map((row) => String(row['QUERY PLAN']))
        .join('\n')
      await db.execute(sql`SET enable_seqscan = on`)
      expect(plan).toMatch(/Index Scan using corvus_embeddings_hnsw/i)
    })

    it('never reached a provider', () => {
      // The whole tier's cost contract, asserted rather than assumed.
      expect(embedQueryStub).not.toHaveBeenCalled()
    })
  },
)
