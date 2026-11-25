// @vitest-environment node
import { randomUUID } from 'node:crypto'
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
 * each seeded page/post is positively present and query 3 agrees with the
 * detail counts over the same owned IDs. CTEs scope the input relations for
 * ALL THREE unchanged statements, so total-predicate drift still fails.
 * Foreign violations are positively observed by the unscoped statements but
 * never enter the owned assertions. Cleanup uses captured IDs, plus one
 * liveness-checked sweep of this file's own marker in `beforeAll` that
 * recovers the rows a killed run left behind (see {@link RUN_LOCK_CLASS}).
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

/**
 * Prefixes the slug of every row this file writes, so a killed run's leftovers
 * can be found again.
 *
 * @remarks Cleanup within a run is by captured id; the marker exists for the
 * `beforeAll` sweep, which needs a way to recognise this file's rows without
 * an id list a dead process took with it. The per-run UUID keeps concurrent
 * runs' slugs apart.
 */
const MARKER = 'zz-audit-served-prefix'
const runId = randomUUID()
const runMarker = `${MARKER}-${runId}`

/**
 * The advisory-lock namespace in which each run holds a lock on its own id.
 *
 * @remarks A run killed between seeding and teardown takes its captured ids
 * with it, and its rows (a published page and post under a draft parent) would
 * otherwise sit in the database for good, making a hand run of the audit
 * script report violations that are not real. Row age cannot tell such a run
 * from a live one that is merely slow or suspended, so liveness is asked of
 * Postgres instead: every run holds `pg_advisory_lock(RUN_LOCK_CLASS, hashtext(runId))`
 * on its connection from before its first insert, and the lock goes when that
 * connection does, whether by `client.end()` or by the process dying. The
 * `beforeAll` sweep deletes a run's rows only while it holds that run's lock
 * itself, so it can never take a live sibling's fixtures (#254, #266).
 */
const RUN_LOCK_CLASS = 360_360

/** Where the run id sits in a marked slug (1-based, for SQL `substr`). */
const RUN_ID_OFFSET = MARKER.length + 2

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
    const pageIds: number[] = []
    const postIds: number[] = []
    const foreignPageIds: number[] = []
    const foreignPostIds: number[] = []

    /** Preserve the script's predicates while limiting every relation to owned IDs. */
    const audit = (query: string) =>
      client.query(
        `WITH pages AS (SELECT * FROM public.pages WHERE id = ANY($1::int[])),
            posts AS (SELECT * FROM public.posts WHERE id = ANY($2::int[]))
       ${query}`,
        [pageIds, postIds],
      )

    const total = async () => {
      const result = await audit(statements()[2])
      return Number(String(result.rows[0].audit_total).split('=')[1])
    }

    /** Capture every inserted key before another statement or assertion can fail. */
    const insert = async (
      table: 'pages' | 'posts',
      query: string,
      values: unknown[],
    ) => {
      const result = await client.query(`${query} RETURNING id`, values)
      const id = Number(result.rows[0].id)
      ;(table === 'pages' ? pageIds : postIds).push(id)
      return result
    }

    const clean = async () => {
      if (!client) return
      await client.query('DELETE FROM posts WHERE id = ANY($1::int[])', [
        postIds,
      ])
      postIds.length = 0
      await client.query('DELETE FROM pages WHERE id = ANY($1::int[])', [
        pageIds,
      ])
      pageIds.length = 0
    }

    beforeAll(async () => {
      client = new Client({ connectionString })
      await client.connect()
      // Held for the life of this connection; see RUN_LOCK_CLASS.
      await client.query('SELECT pg_advisory_lock($1, hashtext($2))', [
        RUN_LOCK_CLASS,
        runId,
      ])
      // Recover a dead run's fixtures. A run whose lock is free has no live
      // connection, so its rows are abandoned; a held lock means a sibling is
      // still in flight and is left alone. Posts first, then pages, so no
      // child outlives the parent its violation needs.
      const marked = await client.query(
        `SELECT DISTINCT substr(slug, $2, 36) AS run
         FROM (SELECT slug FROM pages UNION ALL SELECT slug FROM posts) AS marked
         WHERE left(slug, length($1)) = $1`,
        [`${MARKER}-`, RUN_ID_OFFSET],
      )
      for (const { run } of marked.rows as { run: string }[]) {
        if (run === runId) continue
        const lock = await client.query(
          'SELECT pg_try_advisory_lock($1, hashtext($2)) AS got',
          [RUN_LOCK_CLASS, run],
        )
        if (!lock.rows[0].got) continue
        try {
          for (const table of ['posts', 'pages'] as const) {
            await client.query(
              `DELETE FROM ${table} WHERE left(slug, length($1)) = $1`,
              [`${MARKER}-${run}`],
            )
          }
        } finally {
          await client.query('SELECT pg_advisory_unlock($1, hashtext($2))', [
            RUN_LOCK_CLASS,
            run,
          ])
        }
      }
      // A sibling can leave violations in flight for the entire audit run.
      // Capture their IDs separately so neither cleanup nor assertions adopt them.
      const parent = await client.query(
        `INSERT INTO pages (title, slug, path, _status, updated_at, created_at)
         VALUES ($1, $1, $1, 'draft', now(), now()) RETURNING id`,
        [`${runMarker}-foreign-parent`],
      )
      foreignPageIds.push(Number(parent.rows[0].id))
      for (const table of ['pages', 'posts'] as const) {
        const result = await client.query(
          `INSERT INTO ${table} (title, slug, path, parent_id, _status, updated_at, created_at)
           VALUES ($1, $1, $2, $3, 'published', now(), now()) RETURNING id`,
          [
            `${runMarker}-foreign-${table}`,
            `${runMarker}-foreign-parent/${table}`,
            foreignPageIds[0],
          ],
        )
        ;(table === 'pages' ? foreignPageIds : foreignPostIds).push(
          Number(result.rows[0].id),
        )
      }
      const [pagesQuery, postsQuery] = statements()
      expect((await client.query(pagesQuery)).rows).toContainEqual(
        expect.objectContaining({ page_id: foreignPageIds[1] }),
      )
      expect((await client.query(postsQuery)).rows).toContainEqual(
        expect.objectContaining({ post_id: foreignPostIds[0] }),
      )
    }, 60_000)

    afterAll(async () => {
      try {
        await clean()
      } finally {
        try {
          if (client) {
            await client.query('DELETE FROM posts WHERE id = ANY($1::int[])', [
              foreignPostIds,
            ])
            await client.query('DELETE FROM pages WHERE id = ANY($1::int[])', [
              foreignPageIds,
            ])
          }
        } finally {
          // Optional-call: when `beforeAll` failed before `new Client`, an
          // unguarded `client.end()` throws a TypeError here and REPLACES the
          // real setup error in the report.
          await client?.end()
        }
      }
    })

    it('reports the page, the post and a total of 2, all in agreement', async () => {
      try {
        const parent = await insert(
          'pages',
          `INSERT INTO pages (title, slug, path, _status, updated_at, created_at)
         VALUES ($1, $1, $1, 'draft', now(), now())`,
          [`${runMarker}-parent`],
        )
        const parentId = parent.rows[0].id as number

        await insert(
          'pages',
          `INSERT INTO pages (title, slug, path, parent_id, _status, updated_at, created_at)
         VALUES ($1, $1, $2, $3, 'published', now(), now())`,
          [
            `${runMarker}-child`,
            `${runMarker}-parent/${runMarker}-child`,
            parentId,
          ],
        )
        await insert(
          'posts',
          `INSERT INTO posts (title, slug, path, parent_id, _status, updated_at, created_at)
         VALUES ($1, $1, $2, $3, 'published', now(), now())`,
          [
            `${runMarker}-post`,
            `${runMarker}-parent/${runMarker}-post`,
            parentId,
          ],
        )

        const [pagesQuery, postsQuery] = statements()

        const pages = await audit(pagesQuery)
        const posts = await audit(postsQuery)
        const tagged = await total()

        // A live URL under a prefix the site 404s — named, with the parent that
        // makes it one, so the editorial decision can be made from the summary.
        expect(pages.rows).toEqual([
          expect.objectContaining({
            page_id: pageIds[1],
            parent_id: pageIds[0],
            page_slug: `${runMarker}-child`,
            served_path: `${runMarker}-parent/${runMarker}-child`,
            parent_slug: `${runMarker}-parent`,
            parent_status: 'draft',
          }),
        ])
        expect(posts.rows).toEqual([
          expect.objectContaining({
            post_id: postIds[0],
            parent_id: pageIds[0],
            post_slug: `${runMarker}-post`,
            parent_status: 'draft',
          }),
        ])

        // The agreement that keeps the restated predicates honest: the tagged
        // total is the sum of the two detail queries, not an independent count
        // that happens to look right today.
        expect(tagged).toBe(pages.rowCount! + posts.rowCount!)
        expect(tagged).toBe(2)
        // The owned read did not delete or adopt either foreign violation.
        expect((await client.query(pagesQuery)).rows).toContainEqual(
          expect.objectContaining({ page_id: foreignPageIds[1] }),
        )
        expect((await client.query(postsQuery)).rows).toContainEqual(
          expect.objectContaining({ post_id: foreignPostIds[0] }),
        )
      } finally {
        await clean()
      }
    }, 60_000)

    it('finds a child under a parent whose _status is NULL (the IS DISTINCT FROM guard)', async () => {
      try {
        // The regression guard `scripts/audit-served-prefix.sql` argues for in
        // prose: `_status` is nullable (`DEFAULT 'draft'`, no NOT NULL), so
        // `parent._status <> 'published'` evaluates to NULL for these rows and
        // drops them — the audit would answer "0 rows" for a database that has
        // the defect. `IS DISTINCT FROM` is what keeps them. A NULL gets in only
        // by a write that went around the publish guards, which is exactly how
        // the production violations arose, so this is the shape that matters
        // most and the one a `<>` would hide.
        await clean()

        const parent = await insert(
          'pages',
          `INSERT INTO pages (title, slug, path, _status, updated_at, created_at)
         VALUES ($1, $1, $1, NULL, now(), now())`,
          [`${runMarker}-null-parent`],
        )
        const parentId = parent.rows[0].id as number

        await insert(
          'pages',
          `INSERT INTO pages (title, slug, path, parent_id, _status, updated_at, created_at)
         VALUES ($1, $1, $2, $3, 'published', now(), now())`,
          [
            `${runMarker}-null-child`,
            `${runMarker}-null-parent/${runMarker}-null-child`,
            parentId,
          ],
        )
        await insert(
          'posts',
          `INSERT INTO posts (title, slug, path, parent_id, _status, updated_at, created_at)
         VALUES ($1, $1, $2, $3, 'published', now(), now())`,
          [
            `${runMarker}-null-post`,
            `${runMarker}-null-parent/${runMarker}-null-post`,
            parentId,
          ],
        )

        const [pagesQuery, postsQuery] = statements()
        const pages = await audit(pagesQuery)
        const posts = await audit(postsQuery)
        const tagged = await total()

        expect(pages.rows).toEqual([
          expect.objectContaining({
            page_id: pageIds[1],
            parent_id: pageIds[0],
            page_slug: `${runMarker}-null-child`,
            served_path: `${runMarker}-null-parent/${runMarker}-null-child`,
            parent_slug: `${runMarker}-null-parent`,
            parent_status: null,
          }),
        ])
        expect(posts.rows).toEqual([
          expect.objectContaining({
            post_id: postIds[0],
            parent_id: pageIds[0],
            post_slug: `${runMarker}-null-post`,
            parent_status: null,
          }),
        ])
        // And the tagged total COUNTS them — the third statement restates the
        // predicates, so it is its own place for the `<>` to creep back in.
        expect(tagged).toBe(pages.rowCount! + posts.rowCount!)
        expect(tagged).toBe(2)
        // The owned read did not delete or adopt either foreign violation.
        expect((await client.query(pagesQuery)).rows).toContainEqual(
          expect.objectContaining({ page_id: foreignPageIds[1] }),
        )
        expect((await client.query(postsQuery)).rows).toContainEqual(
          expect.objectContaining({ post_id: foreignPostIds[0] }),
        )
      } finally {
        await clean()
      }
    }, 60_000)

    it('returns an owned total of zero once the parent is published', async () => {
      // The clean case has to be POSITIVELY expressed — a tagged line printed
      // by a statement that ran — because the runner treats a MISSING line as a
      // failure, not as a pass. It also has to be a zero the predicates EARNED:
      // over an empty owned set every statement returns nothing whatever its
      // WHERE says. So the rows stay seeded and only the parent's state moves,
      // and a second, draft family is the negative control for the CHILD
      // predicate — a draft page or post under a draft parent serves no URL.
      try {
        const parent = await insert(
          'pages',
          `INSERT INTO pages (title, slug, path, _status, updated_at, created_at)
         VALUES ($1, $1, $1, 'draft', now(), now())`,
          [`${runMarker}-clean-parent`],
        )
        const parentId = parent.rows[0].id as number
        for (const table of ['pages', 'posts'] as const) {
          await insert(
            table,
            `INSERT INTO ${table} (title, slug, path, parent_id, _status, updated_at, created_at)
           VALUES ($1, $1, $2, $3, 'published', now(), now())`,
            [
              `${runMarker}-clean-${table}`,
              `${runMarker}-clean-parent/${table}`,
              parentId,
            ],
          )
        }
        const draftParent = await insert(
          'pages',
          `INSERT INTO pages (title, slug, path, _status, updated_at, created_at)
         VALUES ($1, $1, $1, 'draft', now(), now())`,
          [`${runMarker}-draft-parent`],
        )
        for (const table of ['pages', 'posts'] as const) {
          await insert(
            table,
            `INSERT INTO ${table} (title, slug, path, parent_id, _status, updated_at, created_at)
           VALUES ($1, $1, $2, $3, 'draft', now(), now())`,
            [
              `${runMarker}-draft-${table}`,
              `${runMarker}-draft-parent/${table}`,
              draftParent.rows[0].id,
            ],
          )
        }

        const [pagesQuery, postsQuery, totalQuery] = statements()
        // Before: the published pair is in scope and counted, and the draft
        // family is not — the owned set really is what the zero is about.
        expect(await total()).toBe(2)

        await client.query(
          `UPDATE pages SET _status = 'published' WHERE id = $1`,
          [parentId],
        )

        expect((await audit(pagesQuery)).rows).toEqual([])
        expect((await audit(postsQuery)).rows).toEqual([])
        const result = await audit(totalQuery)
        expect(String(result.rows[0].audit_total)).toBe(
          'AUDIT_SERVED_PREFIX_VIOLATIONS=0',
        )
        expect((await client.query(pagesQuery)).rows).toContainEqual(
          expect.objectContaining({ page_id: foreignPageIds[1] }),
        )
        expect((await client.query(postsQuery)).rows).toContainEqual(
          expect.objectContaining({ post_id: foreignPostIds[0] }),
        )
      } finally {
        await clean()
      }
    }, 60_000)
  },
)
