// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  GRANDFATHERED_MIGRATION_COUNT,
  MIGRATIONS_DIR,
  RLS_BACKFILL_MIGRATION,
  RLS_DOC_REFERENCE,
  checkMigrationSource,
  checkMigrations,
  formatResult,
  isGrandfathered,
  listMigrationFiles,
  parseCreatedTables,
  parseRlsEnabledTables,
} from './check-migrations-rls.mjs'

/**
 * Unit tests for the #117 new-table RLS gate.
 *
 * @remarks The fixtures below are migration *strings* deliberately written in
 * the syntax the real corpus uses — `sql` template literals with the DDL
 * indented across lines, quoted identifiers, `IF NOT EXISTS` on the
 * hand-written migrations and bare `CREATE TABLE` on the Payload-generated
 * ones. The gate is a text matcher, so a fixture that drifts from the real
 * generator's output is a test that proves nothing; the last block in this
 * file therefore also runs the gate against the committed corpus itself.
 */

/** A Payload-generated migration: several tables, no RLS follow-up. */
const generatedNoRls = `
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`
   CREATE TABLE "widgets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar
  );

   CREATE TABLE "_widgets_v" (
  	"id" serial PRIMARY KEY NOT NULL
  );

   CREATE TABLE "widgets_rels" (
  	"id" serial PRIMARY KEY NOT NULL
  );\`)
}
`

/** The same migration with the #72 follow-up on all three tables. */
const generatedWithRls = `${generatedNoRls}
  await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`)
  await db.execute(sql\`ALTER TABLE "_widgets_v" ENABLE ROW LEVEL SECURITY;\`)
  await db.execute(sql\`
    ALTER TABLE "widgets_rels" ENABLE ROW LEVEL SECURITY;
  \`)
`

describe('parseCreatedTables', () => {
  it('finds every quoted table in a generated multi-statement migration', () => {
    expect(parseCreatedTables(generatedNoRls)).toEqual([
      'widgets',
      '_widgets_v',
      'widgets_rels',
    ])
  })

  it('handles the `IF NOT EXISTS` form the hand-written migrations use', () => {
    expect(
      parseCreatedTables(
        'CREATE TABLE IF NOT EXISTS "corvus_embeddings" (\n "id" bigserial\n);',
      ),
    ).toEqual(['corvus_embeddings'])
  })

  it('handles unquoted identifiers and a schema qualifier', () => {
    expect(
      parseCreatedTables('create table public.audit_log (id int);'),
    ).toEqual(['audit_log'])
    expect(
      parseCreatedTables('CREATE TABLE "public"."audit_log" (id int);'),
    ).toEqual(['audit_log'])
  })

  it('deduplicates a table created twice and returns [] for no DDL', () => {
    expect(
      parseCreatedTables(
        'CREATE TABLE "a" (id int); CREATE TABLE "a" (id int);',
      ),
    ).toEqual(['a'])
    expect(
      parseCreatedTables('ALTER TABLE "a" ADD COLUMN "b" varchar;'),
    ).toEqual([])
  })

  it('does not mistake CREATE INDEX or CREATE EXTENSION for a table', () => {
    expect(
      parseCreatedTables(
        'CREATE EXTENSION IF NOT EXISTS vector;\nCREATE INDEX "x_idx" ON "x" USING btree ("y");',
      ),
    ).toEqual([])
  })
})

describe('parseRlsEnabledTables', () => {
  it('matches the single-line and multi-line ENABLE forms', () => {
    expect(parseRlsEnabledTables(generatedWithRls)).toEqual([
      'widgets',
      '_widgets_v',
      'widgets_rels',
    ])
  })

  it('matches lowercase, `ONLY`, and schema-qualified spellings', () => {
    expect(
      parseRlsEnabledTables(
        'alter table only public.cookie_consent enable row level security;',
      ),
    ).toEqual(['cookie_consent'])
  })

  it('does not match FORCE, DISABLE, or an unrelated ALTER TABLE', () => {
    // FORCE ROW LEVEL SECURITY is explicitly banned by docs/PAYLOAD.md and is
    // NOT the ENABLE this gate requires — it must not satisfy the rule.
    expect(
      parseRlsEnabledTables('ALTER TABLE "a" FORCE ROW LEVEL SECURITY;'),
    ).toEqual([])
    expect(
      parseRlsEnabledTables('ALTER TABLE "a" DISABLE ROW LEVEL SECURITY;'),
    ).toEqual([])
    expect(
      parseRlsEnabledTables(
        'ALTER TABLE "a" ADD CONSTRAINT "c" FOREIGN KEY ("b");',
      ),
    ).toEqual([])
  })
})

describe('isGrandfathered', () => {
  it('covers the #72 backfill migration and everything before it', () => {
    expect(isGrandfathered(`src/migrations/${RLS_BACKFILL_MIGRATION}.ts`)).toBe(
      true,
    )
    expect(isGrandfathered('src/migrations/20260722_024610_initial.ts')).toBe(
      true,
    )
  })

  it('does not cover a migration after the backfill', () => {
    expect(
      isGrandfathered(
        'src/migrations/20260826_145724_cookie_consent_global.ts',
      ),
    ).toBe(false)
    expect(
      isGrandfathered('src/migrations/20260828_155359_corvus_embeddings.ts'),
    ).toBe(false)
  })
})

describe('checkMigrationSource', () => {
  const post = 'src/migrations/20260901_000000_new.ts'

  it('is red when a post-backfill migration creates a table without RLS', () => {
    expect(checkMigrationSource(post, generatedNoRls)).toEqual([
      'widgets',
      '_widgets_v',
      'widgets_rels',
    ])
  })

  it('is green when every created table — companions included — has RLS', () => {
    expect(checkMigrationSource(post, generatedWithRls)).toEqual([])
  })

  it('still flags a companion when only the parent table got the follow-up', () => {
    const parentOnly = `${generatedNoRls}
  await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`)`
    expect(checkMigrationSource(post, parentOnly)).toEqual([
      '_widgets_v',
      'widgets_rels',
    ])
  })

  it('is green for a column-only migration that creates nothing', () => {
    expect(
      checkMigrationSource(post, 'ALTER TABLE "pages" ADD COLUMN "x" varchar;'),
    ).toEqual([])
  })

  it('flags a table recreated in `down` as well as one created in `up`', () => {
    const recreatesInDown = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`DROP TABLE "legacy" CASCADE;\`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "legacy" ("id" serial PRIMARY KEY NOT NULL);\`)
}`
    expect(checkMigrationSource(post, recreatesInDown)).toEqual(['legacy'])
  })

  it('exempts a grandfathered migration from the same source', () => {
    expect(
      checkMigrationSource(
        'src/migrations/20260722_024610_initial.ts',
        generatedNoRls,
      ),
    ).toEqual([])
  })
})

describe('checkMigrations', () => {
  const sources: Record<string, string> = {
    'src/migrations/20260722_024610_initial.ts': generatedNoRls,
    'src/migrations/20260901_000000_good.ts': generatedWithRls,
    'src/migrations/20260902_000000_bad.ts': generatedNoRls,
  }
  const read = (file: string) => sources[file]

  it('reports one failure per offending table and counts the split', () => {
    const result = checkMigrations(Object.keys(sources), read)
    expect(result.grandfathered).toBe(1)
    expect(result.checked).toBe(2)
    expect(result.failures).toEqual([
      { file: 'src/migrations/20260902_000000_bad.ts', table: 'widgets' },
      { file: 'src/migrations/20260902_000000_bad.ts', table: '_widgets_v' },
      { file: 'src/migrations/20260902_000000_bad.ts', table: 'widgets_rels' },
    ])
  })

  it('never reads a grandfathered migration off disk', () => {
    const readsMissingFileLoudly = () => {
      throw new Error('grandfathered migrations must not be read')
    }
    expect(() =>
      checkMigrations(
        ['src/migrations/20260722_024610_initial.ts'],
        readsMissingFileLoudly,
      ),
    ).not.toThrow()
  })
})

describe('formatResult', () => {
  it('emits an ::error:: per table pointing at docs/PAYLOAD.md', () => {
    const { ok, lines } = formatResult({
      failures: [{ file: 'src/migrations/x.ts', table: 'widgets' }],
      grandfathered: GRANDFATHERED_MIGRATION_COUNT,
      checked: 1,
    })
    expect(ok).toBe(false)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('::error file=src/migrations/x.ts::')
    expect(lines[0]).toContain('"widgets"')
    expect(lines[0]).toContain('ENABLE ROW LEVEL SECURITY')
    expect(lines[0]).toContain(RLS_DOC_REFERENCE)
  })

  /**
   * Regression guard: a grandfathered-count mismatch produces exactly ONE
   * line and ZERO table failures. An `ok` derived from either of those alone
   * reads it as a pass, which is how a migration backdated before the #72
   * cutoff would have slipped through unchecked.
   */
  it('is red when the grandfathered set grew, even with no table failures', () => {
    const { ok, lines } = formatResult({
      failures: [],
      grandfathered: GRANDFATHERED_MIGRATION_COUNT + 1,
      checked: 3,
    })
    expect(ok).toBe(false)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('::error::')
    expect(lines[0]).toContain(RLS_BACKFILL_MIGRATION)
  })

  it('is green with a single human-readable summary line', () => {
    const { ok, lines } = formatResult({
      failures: [],
      grandfathered: GRANDFATHERED_MIGRATION_COUNT,
      checked: 3,
    })
    expect(ok).toBe(true)
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('::error')
    expect(lines[0]).toContain('No table is missing ENABLE ROW LEVEL SECURITY')
  })
})

describe('the committed migration corpus', () => {
  const files = listMigrationFiles(MIGRATIONS_DIR)

  it('excludes the generated index.ts barrel and finds the real migrations', () => {
    expect(files.some((file) => file.endsWith('index.ts'))).toBe(false)
    expect(files.length).toBeGreaterThan(GRANDFATHERED_MIGRATION_COUNT)
  })

  /**
   * The pin that makes the dated cutoff safe. If this fails, either a
   * migration was backdated before the #72 backfill (fix the migration) or a
   * grandfathered migration was deliberately removed (update the constant).
   */
  it('still has exactly the grandfathered set the constant pins', () => {
    expect(files.filter(isGrandfathered)).toHaveLength(
      GRANDFATHERED_MIGRATION_COUNT,
    )
  })

  it('passes the gate — every post-backfill table enables RLS', () => {
    const result = checkMigrations(files)
    expect(result.failures).toEqual([])
    expect(formatResult(result).ok).toBe(true)
  })
})
