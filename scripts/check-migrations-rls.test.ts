// @vitest-environment node
import { readFileSync } from 'node:fs'

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
  splitMigrationDirections,
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

describe('splitMigrationDirections', () => {
  it('splits the shape the whole corpus uses, imports belonging to neither', () => {
    const source = `
import { sql } from '@payloadcms/db-postgres'
export async function up({ db }: MigrateUpArgs): Promise<void> {
  UP_MARKER
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  DOWN_MARKER
}`
    const parts = splitMigrationDirections(source)

    expect(parts.map((p) => p.direction)).toEqual(['up', 'down'])
    expect(parts[0].body).toContain('UP_MARKER')
    expect(parts[0].body).not.toContain('DOWN_MARKER')
    expect(parts[1].body).toContain('DOWN_MARKER')
    expect(parts[1].body).not.toContain('UP_MARKER')
    expect(parts[0].body).not.toContain('@payloadcms/db-postgres')
  })

  it('handles `down` declared before `up`', () => {
    const source = `
export async function down({ db }: MigrateDownArgs): Promise<void> { DOWN_MARKER }
export async function up({ db }: MigrateUpArgs): Promise<void> { UP_MARKER }`
    const parts = splitMigrationDirections(source)

    expect(parts.map((p) => p.direction)).toEqual(['down', 'up'])
    expect(parts[0].body).not.toContain('UP_MARKER')
  })

  /**
   * Bare DDL with no function wrapper must still be CHECKED, not skipped —
   * an unparseable source that returns nothing would be a silent hole in the
   * gate rather than a loud failure.
   */
  it('treats an unwrapped source as a single `up` body', () => {
    const parts = splitMigrationDirections('CREATE TABLE "a" (id int);')

    expect(parts).toHaveLength(1)
    expect(parts[0].direction).toBe('up')
    expect(parts[0].body).toContain('CREATE TABLE "a"')
  })

  it('matches the non-async spelling too', () => {
    const parts = splitMigrationDirections(
      'export function up() { A }\nexport function down() { B }',
    )
    expect(parts.map((p) => p.direction)).toEqual(['up', 'down'])
  })

  it('splits every migration in the committed corpus into exactly up and down', () => {
    // The uniformity the textual split relies on, asserted rather than
    // assumed: if a future migration is shaped differently, this fails here
    // instead of quietly mis-attributing its statements.
    for (const file of listMigrationFiles(MIGRATIONS_DIR)) {
      const parts = splitMigrationDirections(readFileSync(file, 'utf8'))
      expect(parts.map((p) => p.direction).sort()).toEqual(['down', 'up'])
    }
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

  /**
   * The cross-direction hole. Deployment runs `up` and never `down`, so an
   * `ENABLE ROW LEVEL SECURITY` sitting in `down` protects nothing that
   * actually ships. Matching a whole file's CREATEs against a whole file's
   * ENABLEs made this migration pass green while the deployed `widgets` table
   * had no RLS at all — the exact failure the gate exists to catch.
   */
  it('does NOT let an ENABLE in `down` satisfy a CREATE in `up`', () => {
    const enableInWrongDirection = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`)
  await db.execute(sql\`DROP TABLE "widgets" CASCADE;\`)
}`
    expect(checkMigrationSource(post, enableInWrongDirection)).toEqual([
      'widgets',
    ])
  })

  it('is green when each direction enables RLS on what it creates', () => {
    const bothDirections = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "legacy" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`ALTER TABLE "legacy" ENABLE ROW LEVEL SECURITY;\`)
}`
    expect(checkMigrationSource(post, bothDirections)).toEqual([])
  })

  it('reports a table missing RLS in BOTH directions exactly once', () => {
    const missingBothWays = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
}`
    expect(checkMigrationSource(post, missingBothWays)).toEqual(['widgets'])
  })

  it('exempts a grandfathered migration from the same source', () => {
    expect(
      checkMigrationSource(
        'src/migrations/20260722_024610_initial.ts',
        generatedNoRls,
      ),
    ).toEqual([])
  })

  /**
   * Commented DDL is not DDL.
   *
   * A migration is TypeScript wrapping SQL, so an `ENABLE ROW LEVEL SECURITY`
   * can be commented out in either syntax — `//` in the TypeScript, `--`
   * inside the `sql` literal. Scanning raw source counted both as enforcement
   * and let a real `CREATE TABLE` through a gate that nothing satisfies: green
   * report, RLS-less table in production. Both spellings must fail closed, and
   * the mirror case (a commented CREATE inventing an obligation) must not go
   * red on a table that is never created.
   */
  describe('commented-out DDL', () => {
    it('does NOT accept a TypeScript-commented ENABLE as enforcement', () => {
      const commentedEnable = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  // await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`)
}`
      expect(checkMigrationSource(post, commentedEnable)).toEqual(['widgets'])
    })

    it('does NOT accept a SQL-commented ENABLE as enforcement', () => {
      const commentedEnable = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`
    CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);
    -- ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;
  \`)
}`
      expect(checkMigrationSource(post, commentedEnable)).toEqual(['widgets'])
    })

    it('does NOT accept a block-commented ENABLE as enforcement', () => {
      const commentedEnable = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  /* await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`) */
}`
      expect(checkMigrationSource(post, commentedEnable)).toEqual(['widgets'])
    })

    it('does NOT accept an ENABLE that only appears in a doc comment', () => {
      const documentedOnly = `
/**
 * Follow-up: ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY; is handled by
 * the lockdown migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
}`
      expect(checkMigrationSource(post, documentedOnly)).toEqual(['widgets'])
    })

    it('does NOT invent an obligation from a commented CREATE TABLE', () => {
      const commentedCreate = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // await db.execute(sql\`CREATE TABLE "shelved" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`
    -- CREATE TABLE "also_shelved" ("id" serial PRIMARY KEY NOT NULL);
    ALTER TABLE "pages" ADD COLUMN "x" varchar;
  \`)
}`
      expect(checkMigrationSource(post, commentedCreate)).toEqual([])
    })

    it('still passes a real CREATE + ENABLE that sits beside commented DDL', () => {
      const realAndCommented = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Superseded: CREATE TABLE "old_widgets" … ENABLE ROW LEVEL SECURITY;
  await db.execute(sql\`
    CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);
    -- the follow-up below is the real one
    ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;
  \`)
}`
      expect(checkMigrationSource(post, realAndCommented)).toEqual([])
    })
  })

  /**
   * String DATA is not a statement either.
   *
   * Stripping comments left the other half of "text that never executes":
   * an `ALTER TABLE … ENABLE ROW LEVEL SECURITY` sitting inside a SQL string
   * literal or a dollar-quoted body is prose or an unexecuted branch, and the
   * gate counted it as enforcement. Same false-green as the commented case,
   * one layer down.
   *
   * The two scans are deliberately NOT symmetric about this — see the
   * `parseCreatedTables` case at the end, and the module docblock.
   */
  describe('SQL string data', () => {
    it('does NOT accept an ENABLE inside a COMMENT ON string literal', () => {
      const enableInComment = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`COMMENT ON TABLE "widgets" IS 'remember to ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY';\`)
}`
      expect(checkMigrationSource(post, enableInComment)).toEqual(['widgets'])
    })

    it('does NOT accept an ENABLE inside a dollar-quoted body', () => {
      const enableInDollarBody = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`
    DO $$
    BEGIN
      IF false THEN
        EXECUTE 'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY';
      END IF;
    END $$;
  \`)
}`
      expect(checkMigrationSource(post, enableInDollarBody)).toEqual([
        'widgets',
      ])
    })

    it('does NOT accept an ENABLE inside a TAGGED dollar-quoted body', () => {
      const taggedBody = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`
    DO $rls$
    BEGIN
      EXECUTE 'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY';
    END $rls$;
  \`)
}`
      expect(checkMigrationSource(post, taggedBody)).toEqual(['widgets'])
    })

    it('still accepts the real statement beside a dollar-quoted body', () => {
      // The shape the committed corvus_embeddings migration actually uses: a
      // literal ENABLE, plus a DO block doing unrelated REVOKE work.
      const realBesideDollarBody = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "widgets" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;\`)
  await db.execute(sql\`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.widgets FROM anon';
      END IF;
    END $$;
  \`)
}`
      expect(checkMigrationSource(post, realBesideDollarBody)).toEqual([])
    })

    it('leaves a real quoted-identifier statement untouched', () => {
      const quotedIdentifiers = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`CREATE TABLE "odd-name" ("id" serial PRIMARY KEY NOT NULL);\`)
  await db.execute(sql\`ALTER TABLE "odd-name" ENABLE ROW LEVEL SECURITY;\`)
}`
      expect(checkMigrationSource(post, quotedIdentifiers)).toEqual([])
    })

    /**
     * The deliberate asymmetry, pinned so it cannot be "tidied" into symmetry
     * without someone reading why.
     *
     * An ENABLE is a CREDIT and must be provably executable, so string data
     * cannot supply one. A CREATE is an OBLIGATION, and obligations are
     * over-counted on purpose: a table created by `EXECUTE 'CREATE TABLE …'`
     * inside a DO block is a REAL table, and blanking string data for this
     * scan too would make it — and its missing RLS — invisible. Over-counting
     * costs a loud red on a table that is never created; under-counting costs
     * a silent green on a table shipped without RLS.
     */
    it('DOES still obligate on a CREATE inside string data, by design', () => {
      const createInsideString = `
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`
    DO $$
    BEGIN
      EXECUTE 'CREATE TABLE "dynamic" ("id" serial PRIMARY KEY NOT NULL)';
    END $$;
  \`)
}`
      expect(checkMigrationSource(post, createInsideString)).toEqual([
        'dynamic',
      ])
    })
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
