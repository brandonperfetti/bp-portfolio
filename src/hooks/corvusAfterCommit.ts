import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

type Refresh = () => Promise<unknown>
type PendingRefreshes = {
  xid: Promise<string>
  jobs: Map<string, Refresh>
}

const installed = new WeakMap<
  Payload['db'],
  Map<string | number, PendingRefreshes>
>()

/**
 * Runs Corvus work only after PostgreSQL confirms the owning transaction
 * committed. Payload's adapter can return normally after a commit failure,
 * so the adapter promise on its own is insufficient proof.
 */
export function installCorvusAfterCommit(payload: Payload): void {
  const db = payload.db
  if (installed.has(db)) return

  const pending = new Map<string | number, PendingRefreshes>()
  installed.set(db, pending)
  const commit = db.commitTransaction.bind(db)
  const rollback = db.rollbackTransaction.bind(db)

  db.commitTransaction = async (id) => {
    const key = await id
    const refreshes = pending.get(key)
    pending.delete(key)
    await commit(key)
    if (!refreshes) return

    try {
      const xid = await refreshes.xid
      const result = await db.drizzle.execute(
        sql`SELECT pg_xact_status(${xid}::xid8) AS status`,
      )
      if (result.rows[0]?.status !== 'committed') {
        payload.logger.warn(
          '[corvus] skipped refresh without a confirmed commit',
        )
        return
      }
    } catch (error) {
      payload.logger.error({
        err: error,
        msg: '[corvus] could not confirm commit; embedding refresh skipped',
      })
      return
    }

    for (const refresh of refreshes.jobs.values()) {
      try {
        await refresh()
      } catch (error) {
        payload.logger.error({
          err: error,
          msg: '[corvus] post-commit refresh failed',
        })
      }
    }
  }

  db.rollbackTransaction = async (id) => {
    const key = await id
    pending.delete(key)
    await rollback(key)
  }
}

/**
 * Resolves the owning transaction without falling back to the pooled adapter.
 */
export async function corvusTransaction(req: PayloadRequest) {
  const key = await req.transactionID
  if (key == null) return null
  const session = req.payload.db.sessions?.[key] as
    PostgresAdapter['sessions'][string] | undefined
  if (!session)
    throw new Error('[corvus] Payload transaction is no longer active')
  return { key, session }
}

/**
 * Records one refresh per document in the owning transaction, including
 * updates made by nested cascades. Returns false for transaction-free
 * operations, whose hooks can refresh immediately.
 */
export async function queueCorvusAfterCommit(
  req: PayloadRequest,
  documentKey: string,
  refresh: Refresh,
): Promise<boolean> {
  const transaction = await corvusTransaction(req)
  if (!transaction) return false

  const { key, session } = transaction
  const pending = installed.get(req.payload.db)
  if (!pending) {
    throw new Error('[corvus] cannot bind refresh to the Payload transaction')
  }

  let refreshes = pending.get(key)
  if (!refreshes) {
    const xid = (async () => {
      const result = await session.db.execute(
        sql`SELECT pg_current_xact_id()::text AS xid`,
      )
      const value = result.rows[0]?.xid
      if (typeof value !== 'string')
        throw new Error('[corvus] cannot identify the PostgreSQL transaction')
      return value
    })()
    refreshes = { xid, jobs: new Map() }
    pending.set(key, refreshes)
  }
  await refreshes.xid
  refreshes.jobs.set(documentKey, refresh)
  return true
}
