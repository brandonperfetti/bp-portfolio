import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'

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
  return {
    execute: (statement) =>
      db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          SELECT "id" FROM ${sql.identifier(collection)}
          WHERE "id" = ${id}
            AND "_status"::text = ${status}
            AND "updated_at" = ${updatedAt}::timestamptz
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
