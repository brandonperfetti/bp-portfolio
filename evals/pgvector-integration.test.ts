// @vitest-environment node
import { createRequire } from 'node:module'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  guardEmbeddingSource,
  guardTechStackSummary,
  guardFlatEmbeddingSource,
} from '../src/lib/ai/embeddingSourceGuard'

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
 * Ownership is exact (collection, doc_id): the shifted SITE_FIXTURE_DOCS,
 * posts 900900–900902, the rejected dimension probe 900999, and the two
 * foreign-sibling rows the backfill case writes and removes itself,
 * (github-repos, 900900) and (posts, 1000000). Cleanup and counts use those
 * keys, never an open-ended offset band. The peer GitHub file owns its
 * shifted repo keys, posts sentinel 1009000 and its own two foreign-sibling
 * rows, independently.
 */

/** Shifts captured IDs away from Payload rows; ownership also pins collection. */
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
import {
  createFixturePage,
  createFixturePost,
} from './fixtures/payload-fixtures'

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

const lexical = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [
          {
            type: 'text',
            text: text,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
})

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

/** Exact corpus keys, shared by the backfill count and fixture cleanup. */
const corpusDocuments = SITE_FIXTURE_DOCS.map(({ collection, doc }) => ({
  collection,
  docId: Number(doc.id) + DOC_ID_OFFSET,
}))

const ownedDocuments = [
  ...corpusDocuments,
  ...[SYNTHETIC_PUBLIC, SYNTHETIC_GATED, SYNTHETIC_FUTURE].map(({ id }) => ({
    collection: 'posts',
    docId: id,
  })),
  { collection: 'posts', docId: DOC_ID_OFFSET + 999 },
]

/** Match only declared document keys, including every chunk of each document. */
async function documentPredicate(documents = ownedDocuments) {
  const { sql } = await import('@payloadcms/db-postgres')
  return sql.join(
    documents.map(
      ({ collection, docId }) =>
        sql`("collection" = ${collection} AND "doc_id" = ${docId})`,
    ),
    sql` OR `,
  )
}

/** Interrupted runs and teardown may remove only this file's exact keys. */
async function clean() {
  const { sql } = await import('@payloadcms/db-postgres')
  await db.execute(
    sql`DELETE FROM "corvus_embeddings" WHERE ${await documentPredicate()}`,
  )
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
      await clean()
    })

    afterAll(async () => {
      if (!pool) return
      try {
        await clean()
      } finally {
        await pool.end()
      }
    })

    it('refreshes a real Payload publish only after PostgreSQL commits', async () => {
      const { sql } = await import('@payloadcms/db-postgres')
      const { createLocalReq, getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      const payload = await getPayload({ config })
      const post = await createFixturePost(payload, {
        context: { disableRevalidate: true },
        data: {
          title: 'Transactional embedding fixture',
          slug: 'zz-corvus-after-commit',
          _status: 'draft',
          content: lexical(
            'This fixture verifies published text after a committed save.',
          ),
        },
      })
      let transactionId: string | number | null = null
      const stored = () => readStoredChunks(db, 'posts', post.id)

      try {
        const publish = async (
          outcome: 'rollback' | 'commit-fails' | 'commit',
        ) => {
          transactionId = await payload.db.beginTransaction()
          if (transactionId == null)
            throw new Error('Expected a real transaction')
          const req = await createLocalReq({}, payload)
          req.transactionID = transactionId
          await payload.update({
            collection: 'posts',
            id: post.id,
            req,
            data: { _status: 'published' },
          })
          expect((await stored()).size).toBe(0)
          expect(embedChunksStub).not.toHaveBeenCalled()

          if (outcome === 'commit-fails') {
            // A deferred constraint permits the hook to finish and forces the
            // database to roll back at COMMIT. Temporary tables are owned by
            // this connection and disappear when it ends the transaction.
            const session = payload.db.sessions?.[transactionId] as
              { db: CorvusEmbeddingsDb } | undefined
            if (!session) throw new Error('Expected a live PostgreSQL session')
            await session.db.execute(
              sql`CREATE TEMP TABLE corvus_tx_parent (id int PRIMARY KEY) ON COMMIT DROP`,
            )
            await session.db.execute(sql`CREATE TEMP TABLE corvus_tx_child (
              parent int REFERENCES corvus_tx_parent(id) DEFERRABLE INITIALLY DEFERRED
            ) ON COMMIT DROP`)
            await session.db.execute(
              sql`INSERT INTO corvus_tx_child VALUES (1)`,
            )
          }
          if (outcome === 'rollback')
            await payload.db.rollbackTransaction(transactionId)
          else await payload.db.commitTransaction(transactionId)
          transactionId = null
        }

        embedChunksStub.mockClear()
        for (const outcome of ['rollback', 'commit-fails'] as const) {
          await publish(outcome)
          expect((await stored()).size).toBe(0)
          expect(embedChunksStub).not.toHaveBeenCalled()
          expect(
            (
              await payload.findByID({
                collection: 'posts',
                id: post.id,
                draft: false,
              })
            )._status,
          ).toBe('draft')
        }

        await publish('commit')
        expect((await stored()).size).toBeGreaterThan(0)
        expect(embedChunksStub).toHaveBeenCalledTimes(1)

        const publicSnapshot = await payload.findByID({
          collection: 'posts',
          id: post.id,
          draft: false,
        })
        // Emulate two writes sharing Payload's millisecond timestamp, without
        // depending on timing or triggering the next refresh.
        await db.execute(sql`UPDATE "posts" SET "access_visibility" = 'gated'
          WHERE "id" = ${post.id}`)
        try {
          await expect(
            guardEmbeddingSource(payload.db.drizzle, 'posts', {
              ...publicSnapshot,
            }).execute(sql`SELECT 1`),
          ).rejects.toThrow('Embedding snapshot changed')
        } finally {
          await db.execute(sql`UPDATE "posts" SET "access_visibility" = 'public'
            WHERE "id" = ${post.id}`)
        }

        // A provider failure is outside the transaction and cannot undo
        // the newer published title or change the operation into an error.
        let gateBeforeProvider: string[] = []
        embedChunksStub.mockImplementationOnce(async () => {
          gateBeforeProvider = [...(await stored()).values()].map(
            (row) => row.visibility,
          )
          throw new Error('Fixture provider offline')
        })
        const saved = await payload.update({
          collection: 'posts',
          id: post.id,
          data: {
            title: 'Committed during provider outage',
            _status: 'published',
            access: { visibility: 'gated' },
          },
        })
        expect(saved.title).toBe('Committed during provider outage')
        expect(
          (
            await payload.findByID({
              collection: 'posts',
              id: post.id,
              draft: false,
            })
          ).title,
        ).toBe(saved.title)
        expect(embedChunksStub).toHaveBeenCalledTimes(2)
        expect(gateBeforeProvider.length).toBeGreaterThan(0)
        expect(new Set(gateBeforeProvider)).toEqual(new Set(['gated']))
      } finally {
        if (transactionId != null)
          await payload.db.rollbackTransaction(transactionId)
        await payload.delete({ collection: 'posts', id: post.id })
        await db.execute(
          sql`DELETE FROM "corvus_embeddings" WHERE "collection" = 'posts' AND "doc_id" = ${post.id}`,
        )
      }
    }, 180_000)

    it('leaves descendant citations unchanged on a rolled-back page move', async () => {
      const { createLocalReq, getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      const payload = await getPayload({ config })
      const slug = 'zz-corvus-after-commit-section'
      const page = await createFixturePage(payload, {
        data: {
          title: 'Section',
          slug,
          layout: [{ blockType: 'spacer', size: 'md' }],
          _status: 'published',
        },
      })
      let childId: number | undefined
      let transactionId: string | number | null = null
      try {
        const child = await createFixturePost(payload, {
          data: {
            title: 'Nested article',
            slug: 'zz-corvus-after-commit-child',
            content: lexical(
              'This article provides a citation for the subtree move.',
            ),
            parent: page.id,
            _status: 'published',
          },
        })
        childId = child.id
        const urls = async () =>
          new Set(
            [...(await readStoredChunks(db, 'posts', child.id)).values()].map(
              (row) => row.sourceUrl,
            ),
          )
        const initialPath = `/${slug}/${child.slug}`
        expect(await urls()).toEqual(new Set([initialPath]))

        const move = (req?: Awaited<ReturnType<typeof createLocalReq>>) =>
          payload.update({
            collection: 'pages',
            id: page.id,
            req,
            data: { slug: `${slug}-moved`, slugLock: false },
          })

        transactionId = await payload.db.beginTransaction()
        if (transactionId == null)
          throw new Error('Expected a real transaction')
        const req = await createLocalReq({}, payload)
        req.transactionID = transactionId
        await move(req)
        expect(await urls()).toEqual(new Set([initialPath]))
        await payload.db.rollbackTransaction(transactionId)
        transactionId = null
        expect(await urls()).toEqual(new Set([initialPath]))

        // A nested redirect failure rolls back the shared transaction before
        // the parent can cascade the move or refresh any embedding.
        const redirects = payload.collections.redirects.config.hooks
        const beforeChange = redirects.beforeChange
        redirects.beforeChange = [
          ...(beforeChange ?? []),
          ({ data }) => {
            if (data.from === `/${slug}`) {
              throw new Error('Fixture redirect write failed')
            }
            return data
          },
        ]
        try {
          embedChunksStub.mockClear()
          await expect(move()).rejects.toThrow('Fixture redirect write failed')
          expect(embedChunksStub).not.toHaveBeenCalled()
          const committed = await payload.findByID({
            collection: 'pages',
            id: page.id,
            draft: false,
          })
          expect(committed.path).toBe(page.path)
          const committedChild = await payload.findByID({
            collection: 'posts',
            id: child.id,
            draft: false,
          })
          expect(committedChild.path).toBe(child.path)
          expect(await urls()).toEqual(new Set([initialPath]))
        } finally {
          redirects.beforeChange = beforeChange
        }

        await move()
        expect(await urls()).toEqual(new Set([`/${slug}-moved/${child.slug}`]))
      } finally {
        if (transactionId != null)
          await payload.db.rollbackTransaction(transactionId)
        if (childId !== undefined)
          await payload.delete({ collection: 'posts', id: childId })
        await payload.delete({ collection: 'pages', id: page.id })
        await payload.delete({
          collection: 'redirects',
          where: { from: { equals: `/${slug}` } },
        })
      }
    }, 180_000)

    it('rejects superseded work history and tech summary writes', async () => {
      const { sql } = await import('@payloadcms/db-postgres')
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      const payload = await getPayload({ config })
      const adapter = payload.db.drizzle
      const context = { disableRevalidate: true }
      const role = await payload.create({
        collection: 'work-history',
        context,
        data: {
          company: 'Corvus PG revision fixture',
          slug: 'zz-corvus-pg-revision-fixture',
          startDate: '2025-01-01',
          title: 'Fixture role',
        },
      })
      let techId: number | undefined
      try {
        const olderRole = await guardFlatEmbeddingSource(
          adapter,
          'work-history',
          role.id,
        )
        expect(olderRole).not.toBeNull()
        const statement = sql`SELECT 1 AS value`
        await expect(olderRole?.execute(statement)).resolves.toMatchObject({
          rows: [{ value: 1 }],
        })
        await payload.update({
          collection: 'work-history',
          id: role.id,
          context,
          data: { title: 'New fixture role' },
        })
        await expect(olderRole?.execute(statement)).rejects.toThrow(
          'work-history changed',
        )
        const currentRole = await guardFlatEmbeddingSource(
          adapter,
          'work-history',
          role.id,
        )
        await expect(currentRole?.execute(statement)).resolves.toMatchObject({
          rows: [{ value: 1 }],
        })

        const beforeInsert = await guardTechStackSummary(adapter)
        const tech = await payload.create({
          collection: 'tech-stack',
          context,
          data: {
            name: 'Corvus PG revision fixture',
            category: 'tooling',
            proficiency: 'daily',
          },
        })
        techId = tech.id
        await expect(beforeInsert.execute(statement)).rejects.toThrow(
          'Tech stack changed',
        )
        const currentSummary = await guardTechStackSummary(adapter)
        await expect(currentSummary.execute(statement)).resolves.toMatchObject({
          rows: [{ value: 1 }],
        })
        await payload.delete({ collection: 'tech-stack', context, id: tech.id })
        techId = undefined
        await expect(currentSummary.execute(statement)).rejects.toThrow(
          'Tech stack changed',
        )
      } finally {
        if (techId !== undefined)
          await payload.delete({
            collection: 'tech-stack',
            context,
            id: techId,
          })
        await payload.delete({
          collection: 'work-history',
          context,
          id: role.id,
        })
      }
    }, 180_000)

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
      const foreignDocuments = [
        { collection: 'github-repos', docId: SYNTHETIC_PUBLIC.id },
        { collection: 'posts', docId: DOC_ID_OFFSET + 100_000 },
      ]
      const foreignPredicate = await documentPredicate(foreignDocuments)
      const readForeign = async () =>
        toRows(
          await db.execute(sql`
        SELECT "collection", "doc_id" AS "docId" FROM "corvus_embeddings"
        WHERE ${foreignPredicate} ORDER BY "collection"
      `),
        )
      try {
        await db.execute(
          sql`DELETE FROM "corvus_embeddings" WHERE ${foreignPredicate}`,
        )
        for (const { collection, docId } of foreignDocuments) {
          await db.execute(sql`
            INSERT INTO "corvus_embeddings"
              ("collection", "doc_id", "chunk_index", "content", "content_hash",
               "visibility", "embedding", "model")
            VALUES (${collection}, ${docId}, 0, 'FOREIGN_PG_FIXTURE', 'foreign',
                    'gated', ${toVectorLiteral(stubVector('FOREIGN_PG_FIXTURE'))}::vector,
                    'text-embedding-3-small')
          `)
        }
        expect(await readForeign()).toEqual(foreignDocuments)
        await runAfterChange('posts', SYNTHETIC_PUBLIC)
        expect(
          (await readStoredChunks(db, 'posts', SYNTHETIC_PUBLIC.id)).size,
        ).toBeGreaterThan(0)
        await clean()
        expect(
          (await readStoredChunks(db, 'posts', SYNTHETIC_PUBLIC.id)).size,
        ).toBe(0)
        expect(await readForeign()).toEqual(foreignDocuments)
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
            sql`SELECT count(*)::int AS n FROM "corvus_embeddings" WHERE ${await documentPredicate(corpusDocuments)}`,
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
        expect(await readForeign()).toEqual(foreignDocuments)
      } finally {
        await db.execute(
          sql`DELETE FROM "corvus_embeddings" WHERE ${foreignPredicate}`,
        )
      }
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

    /**
     * Drive `SYNTHETIC_PUBLIC` to its saved-then-edited state through the real
     * `afterChange` hook, and return the document that state describes.
     *
     * @remarks Extracted so the two cases below own their own stored rows
     * instead of reading whatever the case before them happened to leave
     * behind. Run `-t 'PLACING'` on its own and the placement case used to find
     * an empty table: `readStoredChunks` returned nothing, `isContentUnchanged`
     * was false, `embedChunks` was called — and its "zero provider calls"
     * assertion passed for the wrong reason on the full-file run and failed on
     * the solo one. Both callers `mockClear()` immediately before the action
     * they measure, because seeding legitimately embeds.
     *
     * Idempotent by construction: replaying the sequence over existing rows is
     * exactly what the hook is built to do.
     */
    const seedEditedPublic = async () => {
      await runAfterChange('posts', SYNTHETIC_PUBLIC)
      const edited = {
        ...SYNTHETIC_PUBLIC,
        excerpt: 'SYNTHETIC_EDITED_BODY, rewritten after the first save.',
      }
      await runAfterChange('posts', edited, SYNTHETIC_PUBLIC)
      return edited
    }

    it('a metadata-only public → gated flip is corrected WITHOUT embedding', async () => {
      // The bypass this closes: flipping visibility changes no body text, so a
      // hash-only comparison reports "unchanged" and the stored row keeps
      // saying `public` — leaving a now-gated article's text reachable by
      // anonymous chat turns indefinitely.
      const published = await seedEditedPublic()
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

    it('PLACING an article rewrites source_url with zero provider calls (#153)', async () => {
      // Seeds its OWN gated, edited rows rather than inheriting the gating
      // case's leftovers, so `-t 'PLACING'` measures the same thing the
      // full-file run does. The ONLY thing that moves after the seed is the
      // placement, which is the whole point — a placement changes `parent` and
      // not a byte of the body, so `isContentUnchanged` short-circuits and the
      // fix has to land through the metadata path or not at all.
      const published = await seedEditedPublic()
      const stored0 = { ...published, access: { visibility: 'gated' } }
      await runAfterChange('posts', stored0, published)

      const before = await readStoredChunks(
        db,
        'posts',
        Number(SYNTHETIC_PUBLIC.id),
      )
      expect(
        [...before.values()].every(
          (row) => row.sourceUrl === '/articles/synthetic-public-fixture',
        ),
      ).toBe(true)

      embedChunksStub.mockClear()
      const placed = { ...stored0, path: 'work/synthetic-public-fixture' }
      await runAfterChange('posts', placed, stored0)
      expect(
        embedChunksStub,
        'a URL is not a content change: placing must cost zero provider dollars',
      ).not.toHaveBeenCalled()

      const after = await readStoredChunks(
        db,
        'posts',
        Number(SYNTHETIC_PUBLIC.id),
      )
      expect(after.size).toBe(before.size)
      expect(
        [...after.values()].every(
          (row) => row.sourceUrl === '/work/synthetic-public-fixture',
        ),
        'every chunk of the document must be re-pointed, not just the first',
      ).toBe(true)
      // The content hashes are untouched, which is what proves the vectors
      // still describe these rows and no re-embed is owed on the next save.
      for (const [index, row] of after) {
        expect(row.contentHash).toBe(before.get(index)?.contentHash)
      }

      // And un-placing puts it back, still without a provider call.
      embedChunksStub.mockClear()
      await runAfterChange('posts', stored0, placed)
      expect(embedChunksStub).not.toHaveBeenCalled()
      const restored = await readStoredChunks(
        db,
        'posts',
        Number(SYNTHETIC_PUBLIC.id),
      )
      expect(
        [...restored.values()].every(
          (row) => row.sourceUrl === '/articles/synthetic-public-fixture',
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
