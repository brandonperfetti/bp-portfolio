import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { TestProject } from 'vitest/node'

/**
 * The migration names the repository ships, in order, read from
 * `src/migrations/index.ts`.
 *
 * @remarks Parsed from source rather than imported: the index imports every
 * migration module, which imports Payload's Postgres adapter, and loading that
 * graph in a global setup costs seconds to learn a list of strings. Each entry
 * carries its name as a quoted `name:` property, which is what Payload records
 * in `payload_migrations.name` once the migration has run.
 */
export const shippedMigrations = (source: string): string[] =>
  [...source.matchAll(/^\s*name:\s*'([^']+)',?\s*$/gm)].map((match) => match[1])

/**
 * The shipped migrations a database has not recorded as applied, in order.
 *
 * @remarks Only MISSING names are reported. A database that also holds rows
 * the checkout does not ship (migrated from a newer branch, or Payload's
 * `dev` push marker) is not behind, and refusing it would only send the
 * reader to `pnpm migrate` for nothing.
 */
export const missingMigrations = (
  shipped: readonly string[],
  applied: readonly string[],
): string[] => {
  const recorded = new Set(applied)
  return shipped.filter((name) => !recorded.has(name))
}

/**
 * The refusal a stale database gets, naming the fix (#356).
 *
 * @remarks Without this, a database migrated before the newest columns makes
 * whole files fail on "column does not exist", red that has nothing to do with
 * the change under test and no hint that the database is the cause.
 */
export const staleDatabaseMessage = (missing: readonly string[]): string => {
  const shown = missing.slice(0, 5).join(', ')
  const more = missing.length > 5 ? `, and ${missing.length - 5} more` : ''
  return (
    `The pg tier's database is behind this checkout's migrations: ` +
    `${missing.length} not applied (${shown}${more}). ` +
    'Run `pnpm migrate` against this DATABASE_URI, or point DATABASE_URI at a ' +
    'freshly migrated and seeded database (docs/TESTING.md, "Running the pg tier locally").'
  )
}

/**
 * Whether this Vitest run collects the pg tier at all.
 *
 * @remarks Evalite runs from this same root and config, with its own fixed
 * include of `*.eval.ts`, and no eval reads the database. Refusing an Evalite
 * run because a local `DATABASE_URI` happens to name a stale database would
 * block work the database has nothing to do with.
 */
export const collectsPgTier = (include: readonly string[]): boolean =>
  include.some((pattern) => !pattern.includes('.eval.'))

/**
 * Refuse the eval root's pg tier on a database whose migrations are behind
 * (#356, option B).
 *
 * @remarks A Vitest global setup, so the check runs once per run, before any
 * test file, and its message is the run's only failure instead of a scatter of
 * column errors across parallel workers. With no `DATABASE_URI` it does
 * nothing: the tier's own "has DATABASE_URI set" case already reports that.
 * `pg` is resolved through the Postgres adapter for the same reason the tier's
 * files do (pnpm's strict layout).
 */
export default async function setup(project: TestProject): Promise<void> {
  const connectionString = process.env.DATABASE_URI
  if (!connectionString) return
  if (!collectsPgTier(project.config.include)) return

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  )
  const shipped = shippedMigrations(
    readFileSync(path.join(repoRoot, 'src/migrations/index.ts'), 'utf8'),
  )
  if (shipped.length === 0) {
    throw new Error(
      'Read no migration names from src/migrations/index.ts; the pg tier cannot tell whether its database is current.',
    )
  }

  const requireFromRoot = createRequire(import.meta.url)
  const { Client } = createRequire(
    requireFromRoot.resolve('@payloadcms/db-postgres'),
  )('pg') as {
    Client: new (config: { connectionString: string }) => {
      connect: () => Promise<void>
      end: () => Promise<void>
      query: (text: string) => Promise<{ rows: Record<string, unknown>[] }>
    }
  }
  const client = new Client({ connectionString })
  await client.connect()
  let applied: string[]
  try {
    // A database never migrated has no ledger at all: everything is missing.
    const ledger = await client.query(
      `SELECT to_regclass('public.payload_migrations') IS NOT NULL AS present`,
    )
    applied = ledger.rows[0].present
      ? (await client.query('SELECT name FROM payload_migrations')).rows.map(
          (row) => String(row.name),
        )
      : []
  } finally {
    await client.end()
  }

  const missing = missingMigrations(shipped, applied)
  if (missing.length > 0) throw new Error(staleDatabaseMessage(missing))
}
