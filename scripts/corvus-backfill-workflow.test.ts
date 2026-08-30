// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Guards for the weekly Corvus backfill Action.
 *
 * @remarks A workflow file is code that no test run ever executes: it is
 * exercised once a week, in production, by nobody watching. Everything
 * asserted here is a property whose loss is silent — a widened token scope, a
 * dropped concurrency group, a secret name that drifted away from the one
 * `db-backup.yml` documents — as opposed to a typo, which the first dispatch
 * surfaces on its own.
 *
 * String matching rather than a YAML parse, following
 * `scripts/dev-db-restore.test.ts`'s drift guards against these same two
 * workflows. `yaml` is not a dependency of this project (measured: it does not
 * resolve from the repo root), and adding one to assert five lines is a worse
 * trade than matching text.
 */

const repoRoot = path.resolve(__dirname, '..')
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/corvus-backfill.yml',
)
const workflow = readFileSync(workflowPath, 'utf8')

describe('corvus-backfill workflow', () => {
  it('runs on a weekly cron and on demand', () => {
    // Weekly, not daily: a repair pass over an already-current index is nearly
    // free but not free, and the hooks it repairs after are the exception.
    const cron = /cron:\s*'([^']+)'/.exec(workflow)?.[1]
    expect(cron, 'a schedule must exist').toBeDefined()

    const fields = (cron as string).split(/\s+/)
    expect(fields, 'a 5-field cron expression').toHaveLength(5)
    expect(fields[4], 'day-of-week must name one day').toMatch(/^[0-6]$/)
    expect(fields[2], 'day-of-month must be unrestricted').toBe('*')
    expect(fields[1], 'off-peak UTC hour').toMatch(/^(0?[0-9]|1[01])$/)
    expect(
      fields[0],
      'minute must not be :00, where GitHub queues every hourly cron',
    ).not.toBe('0')

    expect(workflow).toContain('workflow_dispatch:')
  })

  it('declares read-only token permissions at the workflow level', () => {
    // Workflow level, not job level: declaring it here overrides any broader
    // repo/org default GITHUB_TOKEN grant and zeroes every other scope. A
    // job-level copy would leave the workflow default in place for a second
    // job someone adds later.
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m)
  })

  it('serialises runs instead of cancelling them', () => {
    // Both halves matter. The group stops two passes racing on the same
    // `corvus_embeddings` rows; `cancel-in-progress: false` is what stops a
    // new run killing a half-finished repair, which would leave the index in
    // exactly the mixed state this job exists to clear.
    expect(workflow).toMatch(/^concurrency:\n {2}group: corvus-backfill$/m)
    expect(workflow).toContain('cancel-in-progress: false')
  })

  it('targets production through the secret db-backup.yml documents', () => {
    // The same production connection string, read under Payload's canonical
    // env name. If db-backup.yml's secret is ever renamed, this fails here
    // rather than a week later in a scheduled run nobody is watching.
    expect(workflow).toContain(
      'DATABASE_URI: ${{ secrets.SUPABASE_DB_URL_PROD }}',
    )

    const backup = readFileSync(
      path.join(repoRoot, '.github/workflows/db-backup.yml'),
      'utf8',
    )
    expect(backup).toContain('SUPABASE_DB_URL_PROD')
  })

  it('carries the embedding provider key the eval job already uses', () => {
    expect(workflow).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')

    const ci = readFileSync(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      'utf8',
    )
    expect(ci).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
  })

  it('fails on a missing secret by name, before touching production', () => {
    // An unset DATABASE_URI otherwise surfaces as a Payload config error
    // several minutes in; an unset key as a per-document embed failure the
    // script retries across the whole corpus.
    expect(workflow).toContain('SUPABASE_DB_URL_PROD secret is not set')
    expect(workflow).toContain('OPENAI_API_KEY secret is not set')
  })

  it('runs the repo’s own backfill script, never its destructive mode', () => {
    // `--drop-orphans` is the script's only destructive path. A scheduled job
    // that can empty the retrieval index on a bad read is a worse trade than a
    // few stale rows. Scoped to the invocation rather than the whole file: the
    // header names the flag in order to explain why it is absent, and that
    // sentence is worth more than the convenience of a file-wide match.
    const invocations = workflow
      .split('\n')
      .filter((line) => line.includes('pnpm corvus:backfill'))

    expect(invocations, 'the workflow must run the backfill').toHaveLength(1)
    expect(invocations[0]).not.toContain('--drop-orphans')

    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }
    expect(
      packageJson.scripts?.['corvus:backfill'],
      'the workflow must name a script that exists',
    ).toBeDefined()
  })

  it('leaves the outcome in the job summary whether it passes or fails', () => {
    // GitHub disables cron workflows after 60 days of repo inactivity, and a
    // scheduled job nobody watches is only as useful as what it leaves in the
    // Actions tab — the convention db-backup.yml set with its own summary
    // line. `if: ${{ !cancelled() }}` is what makes it survive the failure.
    expect(workflow).toContain('GITHUB_STEP_SUMMARY')
    expect(workflow).toContain('if: ${{ !cancelled() }}')
    // The exact string the script logs (backfill-corvus-embeddings.ts).
    expect(workflow).toContain('[backfill:corvus] done:')
  })

  it('sets up Node and pnpm the way ci.yml does', () => {
    const ci = readFileSync(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      'utf8',
    )
    const ciNode = /NODE_VERSION:\s*'([^']+)'/.exec(ci)?.[1]
    const ownNode = /NODE_VERSION:\s*'([^']+)'/.exec(workflow)?.[1]

    expect(ciNode, 'ci.yml must still pin a full patch version').toMatch(
      /^\d+\.\d+\.\d+$/,
    )
    expect(
      ownNode,
      'the backfill must run on the Node version CI validates against',
    ).toBe(ciNode)

    expect(workflow).toContain('corepack enable')
    expect(workflow).toContain('cache: pnpm')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
  })

  it('bounds the run so a hung call cannot hold the concurrency group', () => {
    const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(workflow)?.[1])
    expect(minutes).toBeGreaterThan(0)
    // Comfortably under a week, which is the interval the group has to clear.
    expect(minutes).toBeLessThan(360)
  })
})
