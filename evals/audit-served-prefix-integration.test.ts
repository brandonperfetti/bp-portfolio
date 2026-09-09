// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `scripts/audit-served-prefix.sql` against a REAL Postgres, with a REAL
 * violation seeded (#206).
 *
 * @remarks **What this file is for.** A workflow file has no unit test, and the
 * job's shell branching is proven by the two captured runs in the change's
 * deliverables. What CAN regress silently is the SQL: #206 gave the script a
 * third statement whose only job is to print the total the runner parses, and
 * that statement RESTATES the predicates of the first two rather than sharing a
 * temp view (a view would make the file write to the session's temp schema and
 * cost it the "read-only, safe against production" property its docblock
 * claims). Restated predicates drift. This file is what makes drift a build
 * failure: seed one page violation and one post violation, then assert that
 * query 1 returns exactly the page, query 2 exactly the post, and query 3 a
 * total equal to their combined row count.
 *
 * **Why the rows are seeded by raw SQL and not through Payload.** The #180
 * `beforeChange` guards refuse to publish a page under an unpublished parent —
 * that is the point of them. The state this script exists to find can therefore
 * only be reached by writing around the hooks, which is also the only way it
 * ever arose in production. `pg` directly, on the same `DATABASE_URI` the tier
 * already requires.
 *
 * **Why psql is not invoked.** The file's `\echo` lines are psql meta-commands,
 * not SQL; a client cannot run them. The statements are extracted and executed
 * individually, which is strictly stronger for this assertion — it pins each
 * statement's own result rather than a blob of formatted output.
 */

/**
 * `pg`, resolved through the adapter that depends on it.
 *
 * @remarks Not a direct dependency of this repo — it arrives under
 * `@payloadcms/db-postgres`, and pnpm's strict layout means a bare
 * `import 'pg'` from here does not resolve. Same shim, same reasoning, as
 * `pgvector-integration.test.ts`.
 */
const requireFromRoot = createRequire(import.meta.url)
const requireFromAdapter = createRequire(
  requireFromRoot.resolve('@payloadcms/db-postgres'),
)
const { Client } = requireFromAdapter('pg') as {
  Client: new (config: { connectionString?: string }) => {
    connect: () => Promise<void>
    end: () => Promise<void>
    query: (
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
  }
}

const connectionString = process.env.DATABASE_URI

const SQL_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/audit-served-prefix.sql',
)

/** Marks every row this file writes, for exact cleanup. */
const MARKER = 'zz-audit-served-prefix'

/**
 * The file's executable statements, in order, with psql meta-commands and
 * comments stripped.
 *
 * @remarks Comment lines are removed rather than passed through because the
 * split below is on `;`, and a comment is the one place a stray one could hide.
 * Nothing else in the file contains a semicolon outside a statement terminator.
 */
const statements = (): string[] =>
  readFileSync(SQL_PATH, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('--') && !trimmed.startsWith('\\')
    })
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)

describe('audit-served-prefix integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })

  it('extracts exactly the three statements the runner depends on', () => {
    // Statement 3 is what `.github/workflows/audit-served-prefix.yml` parses;
    // deleting it turns every run into the "did not complete" branch.
    const found = statements()
    expect(found).toHaveLength(3)
    expect(found[2]).toContain('AUDIT_SERVED_PREFIX_VIOLATIONS=')
  })
})

describe.skipIf(!connectionString)(
  'audit-served-prefix.sql finds a seeded violation (real Postgres)',
  () => {
    let client: InstanceType<typeof Client>
    /**
     * The tagged total before this file seeds anything.
     *
     * @remarks Baseline-by-value, for the same reason wave 6 moved this tier's
     * other cross-file assertion to baseline-by-id: the query counts the WHOLE
     * database, the tier runs its files in parallel workers against one
     * database, and asserting a bare `=0` would make this file's result depend
     * on what a sibling happened to have in flight. Nothing else in the tier
     * can create a violation — the #180 guards refuse it through Payload — so
     * the baseline is expected to be 0 in practice and is read rather than
     * assumed.
     */
    let baseline = 0

    const total = async () => {
      const [, , totalQuery] = statements()
      const result = await client.query(totalQuery)
      return Number(String(result.rows[0].audit_total).split('=')[1])
    }

    const clean = async () => {
      await client.query(`DELETE FROM posts WHERE slug LIKE '${MARKER}%'`)
      await client.query(`DELETE FROM pages WHERE slug LIKE '${MARKER}%'`)
    }

    beforeAll(async () => {
      client = new Client({ connectionString })
      await client.connect()
      await clean()
      baseline = await total()
    }, 60_000)

    afterAll(async () => {
      try {
        await clean()
      } finally {
        await client.end()
      }
    })

    it('reports the page, the post and a total of 2, all in agreement', async () => {
      const parent = await client.query(
        `INSERT INTO pages (title, slug, path, _status, updated_at, created_at)
         VALUES ($1, $1, $1, 'draft', now(), now()) RETURNING id`,
        [`${MARKER}-parent`],
      )
      const parentId = parent.rows[0].id as number

      await client.query(
        `INSERT INTO pages (title, slug, path, parent_id, _status, updated_at, created_at)
         VALUES ($1, $1, $2, $3, 'published', now(), now())`,
        [`${MARKER}-child`, `${MARKER}-parent/${MARKER}-child`, parentId],
      )
      await client.query(
        `INSERT INTO posts (title, slug, path, parent_id, _status, updated_at, created_at)
         VALUES ($1, $1, $2, $3, 'published', now(), now())`,
        [`${MARKER}-post`, `${MARKER}-parent/${MARKER}-post`, parentId],
      )

      const [pagesQuery, postsQuery] = statements()

      const pages = await client.query(pagesQuery)
      const posts = await client.query(postsQuery)
      const tagged = await total()

      // A live URL under a prefix the site 404s — named, with the parent that
      // makes it one, so the editorial decision can be made from the summary.
      expect(pages.rows).toEqual([
        expect.objectContaining({
          page_slug: `${MARKER}-child`,
          served_path: `${MARKER}-parent/${MARKER}-child`,
          parent_slug: `${MARKER}-parent`,
          parent_status: 'draft',
        }),
      ])
      expect(posts.rows).toEqual([
        expect.objectContaining({
          post_slug: `${MARKER}-post`,
          parent_status: 'draft',
        }),
      ])

      // The agreement that keeps the restated predicates honest: the tagged
      // total is the sum of the two detail queries, not an independent count
      // that happens to look right today.
      expect(tagged).toBe(pages.rowCount! + posts.rowCount!)
      expect(tagged).toBe(baseline + 2)
    }, 60_000)

    it('returns to the baseline once the violation is cleared', async () => {
      // The clean case has to be POSITIVELY expressed — a tagged line printed
      // by a statement that ran — because the runner treats a MISSING line as a
      // failure, not as a pass.
      await clean()
      const [, , totalQuery] = statements()
      const result = await client.query(totalQuery)
      expect(String(result.rows[0].audit_total)).toBe(
        `AUDIT_SERVED_PREFIX_VIOLATIONS=${baseline}`,
      )
    }, 60_000)
  },
)
