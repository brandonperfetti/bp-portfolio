// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Guards for the daily media backup Action (#328).
 *
 * @remarks A scheduled workflow runs where nobody watches, so what is pinned
 * here is what would fail silently: a Blob credential creeping in (the job is
 * meant to hold none), a write that is no longer create-only, a database read
 * outside an asserted read-only transaction, a secret scoped to the whole job, or the
 * check step dropped. String matching, as `corvus-backfill-workflow.test.ts`
 * does, because `yaml` is not a dependency.
 */

const repoRoot = path.resolve(__dirname, '..')
const workflow = readFileSync(
  path.join(repoRoot, '.github/workflows/media-backup.yml'),
  'utf8',
)
const script = readFileSync(
  path.join(repoRoot, 'scripts/media-backup.ts'),
  'utf8',
)

/** The workflow without its comment lines, so prose cannot satisfy a check. */
const code = workflow
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n')

describe('media-backup.yml (#328)', () => {
  it('runs on the Node patch version CI validates against', () => {
    const ci = readFileSync(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      'utf8',
    )
    const ciNode = /NODE_VERSION:\s*'([^']+)'/.exec(ci)?.[1]
    const ownNode = /NODE_VERSION:\s*'([^']+)'/.exec(code)?.[1]
    expect(ciNode, 'ci.yml must still pin a full patch version').toMatch(
      /^\d+\.\d+\.\d+$/,
    )
    expect(ownNode).toBe(ciNode)
    expect(code).toContain('node-version: ${{ env.NODE_VERSION }}')
  })

  it('holds no Blob credential: it reads public URLs only', () => {
    expect(code).not.toMatch(
      /BLOB_READ_WRITE_TOKEN|VERCEL_OIDC_TOKEN|VERCEL_TOKEN/,
    )
  })

  it('runs daily on a schedule and by hand', () => {
    expect(code).toMatch(/schedule:\n\s+- cron: '\d+ \d+ \* \* \*'/)
    expect(code).toContain('workflow_dispatch:')
  })

  it('reads both databases quietly, so command tags stay out of the JSONL', () => {
    expect(
      code.match(
        /psql "\$DB_URL" -v ON_ERROR_STOP=1 -q -At \\\n\s+-f scripts\/media-backup-references\.sql/g,
      ),
    ).toHaveLength(2)
    expect(code).toContain('${{ secrets.SUPABASE_DB_URL }}')
    expect(code).toContain('${{ secrets.SUPABASE_DB_URL_PROD }}')
  })

  it('does not rely on PGOPTIONS, which the Supabase pooler drops', () => {
    expect(code).not.toContain('PGOPTIONS')
  })

  it('keeps the repository token out of the checkout', () => {
    expect(code).toMatch(
      /actions\/checkout@v4\n\s+with:\n\s+persist-credentials: false/,
    )
  })

  it('declares no secret at job scope', () => {
    const jobScope = code.split(/\n {4}steps:\n/)[0]
    expect(jobScope).not.toContain('secrets.')
  })

  it('uses its own R2 token and the existing endpoint secret', () => {
    expect(code).toContain('${{ secrets.R2_MEDIA_BACKUP_ACCESS_KEY_ID }}')
    expect(code).toContain('${{ secrets.R2_MEDIA_BACKUP_SECRET_ACCESS_KEY }}')
    expect(code).toContain('${{ secrets.R2_BACKUP_ENDPOINT }}')
    expect(code).not.toContain('secrets.R2_BACKUP_ACCESS_KEY_ID')
  })

  it('refuses to run on an AWS CLI that cannot make create-only writes', () => {
    expect(code).toContain("grep -q -- '--if-none-match'")
  })

  it('runs the manifest check after the copy', () => {
    expect(code.indexOf('media-backup.ts backup')).toBeGreaterThan(0)
    expect(code.indexOf('media-backup.ts check')).toBeGreaterThan(
      code.indexOf('media-backup.ts backup'),
    )
  })

  it('grants issue write only to the alert job, on scheduled failures', () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read$/m)
    expect(code.match(/issues: write/g)).toHaveLength(1)
    expect(code).toContain("if: failure() && github.event_name == 'schedule'")
  })
})

const sql = readFileSync(
  path.join(repoRoot, 'scripts/media-backup-references.sql'),
  'utf8',
)

describe('scripts/media-backup-references.sql (#328 security review F1)', () => {
  /** The SQL without comment lines, so prose cannot satisfy a check. */
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  it('reads inside a READ ONLY transaction it asserts before the query', () => {
    const begin = statements.indexOf('begin transaction read only;')
    const assertion = statements.indexOf(
      "current_setting('transaction_read_only') <> 'on'",
    )
    const query = statements.indexOf('with refs as (')
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(assertion).toBeGreaterThan(begin)
    expect(query).toBeGreaterThan(assertion)
    expect(statements.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('bounds its cost on production with local timeouts', () => {
    expect(statements).toContain("set local statement_timeout = '120s';")
    expect(statements).toContain("set local lock_timeout = '5s';")
  })
})

describe('scripts/media-backup.ts writes (#328)', () => {
  it('makes every R2 write create-only and never deletes', () => {
    expect(script).toContain("'--if-none-match',\n        '*',")
    expect(script.match(/'put-object'/g)).toHaveLength(1)
    expect(script).not.toMatch(/delete-object|'rm'|s3 rm|copy-object/)
  })
})
