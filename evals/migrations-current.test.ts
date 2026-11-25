// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  collectsPgTier,
  missingMigrations,
  shippedMigrations,
  staleDatabaseMessage,
} from './migrations-current'

const indexSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/migrations/index.ts',
  ),
  'utf8',
)

describe('the pg tier refuses a database behind the migrations (#356)', () => {
  it('reads every shipped migration name from the real index, in order', () => {
    const names = shippedMigrations(indexSource)
    // One `name:` per `up:` entry, so a format change that the parse missed
    // fails here rather than silently waving every database through.
    expect(names).toHaveLength(indexSource.match(/^\s*up:/gm)?.length ?? -1)
    expect(names[0]).toBe('20260722_024610_initial')
    expect([...names].sort()).toEqual(names)
  })

  it('reports only the shipped names the ledger lacks', () => {
    expect(missingMigrations(['a', 'b', 'c'], ['a', 'c', 'dev'])).toEqual(['b'])
    expect(missingMigrations(['a'], ['a', 'newer-branch'])).toEqual([])
    expect(missingMigrations(['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('names the fix and how far behind the database is', () => {
    const message = staleDatabaseMessage(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
    expect(message).toContain('pnpm migrate')
    expect(message).toContain('6 not applied')
    expect(message).toContain('m5, and 1 more')
  })

  it('runs for the pg tier and stands aside for Evalite', () => {
    expect(collectsPgTier(['**/*.{test,spec}.?(c|m)[jt]s?(x)'])).toBe(true)
    expect(collectsPgTier(['**/*.eval.?(m)ts'])).toBe(false)
  })
})
