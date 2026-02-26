import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type ProjectionSyncFailure = {
  id: string
  createdAt: string
  eventType: string
  entityId?: string
  pageId?: string
  reason: string
  attempts: number
  lastError?: string
}

type QueueState = {
  failures: ProjectionSyncFailure[]
}

const QUEUE_FILE = path.join(process.cwd(), '.cache', 'notion-sync-failures.json')

async function readQueue(): Promise<QueueState> {
  try {
    const raw = await readFile(QUEUE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as QueueState
    if (!Array.isArray(parsed.failures)) {
      return { failures: [] }
    }
    return parsed
  } catch {
    return { failures: [] }
  }
}

async function writeQueue(state: QueueState) {
  const dir = path.dirname(QUEUE_FILE)
  await mkdir(dir, { recursive: true })
  const tempFile = `${QUEUE_FILE}.tmp`
  await writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8')
  await rename(tempFile, QUEUE_FILE)
}

export async function enqueueProjectionSyncFailure(input: {
  eventType: string
  entityId?: string
  pageId?: string
  reason: string
  lastError?: string
}) {
  const state = await readQueue()
  const failure: ProjectionSyncFailure = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    eventType: input.eventType,
    entityId: input.entityId,
    pageId: input.pageId,
    reason: input.reason,
    attempts: 0,
    lastError: input.lastError,
  }
  state.failures.push(failure)
  await writeQueue(state)
  return failure
}

export async function listProjectionSyncFailures() {
  const state = await readQueue()
  return state.failures
}

export async function replayProjectionSyncFailures(options: {
  limit?: number
  runSync: (failure: ProjectionSyncFailure) => Promise<{ ok: boolean; error?: string }>
}) {
  const state = await readQueue()
  const limit = options.limit && options.limit > 0 ? options.limit : state.failures.length

  const remaining: ProjectionSyncFailure[] = []
  const replayed: Array<{ id: string; ok: boolean; error?: string }> = []

  for (const failure of state.failures) {
    if (replayed.length >= limit) {
      remaining.push(failure)
      continue
    }

    const nextAttempt = failure.attempts + 1
    const result = await options.runSync({ ...failure, attempts: nextAttempt })

    if (result.ok) {
      replayed.push({ id: failure.id, ok: true })
      continue
    }

    const updatedFailure: ProjectionSyncFailure = {
      ...failure,
      attempts: nextAttempt,
      lastError: result.error,
    }

    remaining.push(updatedFailure)
    replayed.push({ id: failure.id, ok: false, error: result.error })
  }

  await writeQueue({ failures: remaining })

  return {
    totalQueued: state.failures.length,
    attempted: replayed.length,
    succeeded: replayed.filter((entry) => entry.ok).length,
    failed: replayed.filter((entry) => !entry.ok).length,
    remaining: remaining.length,
    replayed,
  }
}
