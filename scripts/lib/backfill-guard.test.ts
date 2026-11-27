import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { describe, expect, it, vi } from 'vitest'

import { guardBackfillDocument } from './backfill-guard'

const snapshot = {
  id: 12,
  updatedAt: '2026-11-27T13:00:00.000Z',
  _status: 'published',
}

describe('guardBackfillDocument', () => {
  function database(rows: unknown[]) {
    const execute = vi.fn().mockResolvedValueOnce({ rows })
    const transaction = vi.fn(async (run) => run({ execute }))
    return {
      execute,
      transaction,
      db: { transaction } as unknown as PostgresAdapter['drizzle'],
    }
  }

  it('runs the embedding statement in the same transaction as the snapshot check', async () => {
    const { db, execute, transaction } = database([{ id: 12 }])
    const statement = sql`select 1`
    execute.mockResolvedValueOnce({ rows: [{ value: 1 }] })

    await expect(
      guardBackfillDocument(db, 'pages', snapshot).execute(statement),
    ).resolves.toEqual({ rows: [{ value: 1 }] })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenNthCalledWith(2, statement)
  })

  it('leaves embeddings untouched when the source snapshot no longer matches', async () => {
    const { db, execute } = database([])
    await expect(
      guardBackfillDocument(db, 'pages', snapshot).execute(sql`select 1`),
    ).rejects.toThrow('Backfill snapshot changed')
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
