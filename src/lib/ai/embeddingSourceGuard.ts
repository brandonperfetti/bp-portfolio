import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'

import { visibilityOf } from '@/lib/ai/chunking'
import type { CorvusEmbeddingsDb } from '@/lib/ai/embeddingsStore'

/**
 * Protects each embedding statement against an intervening content write.
 *
 * The row lock and the embedding statement share a short transaction. The
 * lock is released between statements, so provider calls never hold it.
 * Unpublishing either wins before the check or follows a completed embedding
 * statement and removes its rows through the normal hook.
 */
export function guardEmbeddingSource(
  db: PostgresAdapter['drizzle'],
  collection: 'pages' | 'posts',
  doc: Record<string, unknown>,
): CorvusEmbeddingsDb {
  const { id, updatedAt, _status: status } = doc
  if (
    !Number.isSafeInteger(id) ||
    typeof updatedAt !== 'string' ||
    (status !== 'published' && status !== 'draft')
  ) {
    throw new Error(
      `Cannot verify the embedding snapshot for ${collection}#${id}`,
    )
  }
  // Payload timestamps have millisecond precision. Compare the access
  // fields independently so a same-timestamp edit cannot widen retrieval.
  const publishedAt =
    typeof doc.publishedAt === 'string' && doc.publishedAt
      ? doc.publishedAt
      : null
  const visibilityCheck =
    collection === 'posts'
      ? sql`AND COALESCE("access_visibility"::text, 'public') = ${visibilityOf(doc)}`
      : sql.empty()
  return {
    execute: (statement) =>
      db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          SELECT "id" FROM ${sql.identifier(collection)}
          WHERE "id" = ${id}
            AND "_status"::text = ${status}
            AND "updated_at" = ${updatedAt}::timestamptz
            AND "published_at" IS NOT DISTINCT FROM ${publishedAt}::timestamptz
            ${visibilityCheck}
          FOR SHARE
        `)
        if (result.rows.length !== 1) {
          throw new Error(
            `Embedding snapshot changed for ${collection}#${id}; retry the run`,
          )
        }
        return tx.execute(statement as ReturnType<typeof sql>)
      }),
  }
}

type Drizzle = PostgresAdapter['drizzle']

const flatSourceTables = {
  projects: 'projects',
  uses: 'uses',
  'tech-stack': 'tech_stack',
  'work-history': 'work_history',
} as const

/**
 * Captures a flat collection row's write identity before the caller reads it.
 * Checking the tuple again under a row lock makes stale provider results
 * harmless across workers and independently of timestamp precision.
 */
export async function guardFlatEmbeddingSource(
  db: Drizzle,
  collection: keyof typeof flatSourceTables,
  id: number,
): Promise<CorvusEmbeddingsDb | null> {
  const table = sql.identifier(flatSourceTables[collection])
  const result = await db.execute(
    sql`SELECT xmin::text AS revision FROM ${table} WHERE "id" = ${id}`,
  )
  const revision = result.rows[0]?.revision
  if (typeof revision !== 'string') return null
  return {
    execute: (statement) =>
      db.transaction(async (tx) => {
        const current = await tx.execute(sql`
          SELECT "id" FROM ${table}
          WHERE "id" = ${id} AND xmin::text = ${revision}
          FOR SHARE
        `)
        if (current.rows.length !== 1)
          throw new Error(`${collection} changed during Corvus refresh`)
        return tx.execute(statement as ReturnType<typeof sql>)
      }),
  }
}

// The summary represents all technology rows, including insertions and
// deletions. Capture their ordered identities before reading the source.
const techStackRevision = sql`
  SELECT jsonb_agg(jsonb_build_array("id", xmin::text) ORDER BY "id")::text
    AS revision FROM "tech_stack"
`

/**
 * Protects summary writes with the technology snapshot from before composition.
 * A short SHARE lock excludes source writes only while checking and writing
 * the index. The provider call never holds the table lock.
 */
export async function guardTechStackSummary(
  db: Drizzle,
): Promise<CorvusEmbeddingsDb> {
  const { rows } = await db.execute(techStackRevision)
  const revision = rows[0]?.revision
  return {
    execute: (statement) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`LOCK TABLE "tech_stack" IN SHARE MODE`)
        const current = await tx.execute(techStackRevision)
        if (current.rows[0]?.revision !== revision)
          throw new Error('Tech stack changed during Corvus summary refresh')
        return tx.execute(statement as ReturnType<typeof sql>)
      }),
  }
}
