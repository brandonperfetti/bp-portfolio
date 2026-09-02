// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Guards for the weekly Corvus GitHub-sync Action (#147).
 *
 * @remarks Same reasoning as `corvus-backfill-workflow.test.ts`, which this
 * follows deliberately: a workflow file is code no test run executes, exercised
 * once a week in production by nobody watching. What is asserted here is every
 * property whose loss is SILENT — a widened token scope, a dropped concurrency
 * group, a secret name that drifted from the one two other workflows use, or
 * `--no-prune` creeping into the scheduled invocation and quietly leaving a
 * now-private repository retrievable.
 *
 * That last one is the assertion this file exists for. Everything else here is
 * hygiene; the prune flag is the never-leak bar, and the scheduled run must
 * never carry it.
 *
 * String matching rather than a YAML parse, for the reason the backfill's test
 * records: `yaml` is not a dependency of this project, and adding one to assert
 * a dozen lines is a worse trade than matching text.
 */

const repoRoot = path.resolve(__dirname, '..')
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/corvus-github-sync.yml',
)
const workflow = readFileSync(workflowPath, 'utf8')
const backfill = readFileSync(
  path.join(repoRoot, '.github/workflows/corvus-backfill.yml'),
  'utf8',
)
const ci = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')

/** The env entries whose blast radius this file is guarding. */
const PRODUCTION_ENV = {
  database: 'DATABASE_URI: ${{ secrets.SUPABASE_DB_URL_PROD }}',
  openai: 'OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}',
  payloadSecret: 'PAYLOAD_SECRET:',
  githubToken: 'GITHUB_TOKEN: ${{ secrets.CORVUS_GITHUB_SYNC_TOKEN',
} as const

/** The job split into the scope every step shares and the steps themselves. */
function splitJob(): {
  jobScope: string
  steps: { body: string; label: string }[]
} {
  const job = workflow.slice(workflow.indexOf('\njobs:'))
  const [jobScope, ...bodies] = job.split(/^ {6}- /m)
  return {
    jobScope,
    steps: bodies.map((body) => ({
      body,
      label: body.split('\n')[0].trim(),
    })),
  }
}

/** The label of every step whose own `env:` block declares an entry. */
function stepsCarrying(entry: string): string[] {
  return splitJob()
    .steps.filter((step) => step.body.includes(entry))
    .map((step) => step.label)
}

describe('corvus-github-sync workflow', () => {
  it('runs on a weekly cron and on demand', () => {
    const cron = /cron:\s*'([^']+)'/.exec(workflow)?.[1]
    expect(cron, 'a schedule must exist').toBeDefined()

    const fields = (cron as string).split(/\s+/)
    expect(fields, 'a 5-field cron expression').toHaveLength(5)
    expect(fields[4], 'day-of-week must name one day').toMatch(/^[0-6]$/)
    expect(fields[2], 'day-of-month must be unrestricted').toBe('*')
    expect(
      fields[0],
      'minute must not be :00, where GitHub queues every hourly cron',
    ).not.toBe('0')

    expect(workflow).toContain('workflow_dispatch:')
  })

  it('does not collide with the backfill’s slot on the same database', () => {
    // Both hold a long-lived session-mode connection to production. Same day
    // is fine; same hour would have them competing for no reason.
    const own = /cron:\s*'(\d+)\s+(\d+)/.exec(workflow)
    const theirs = /cron:\s*'(\d+)\s+(\d+)/.exec(backfill)
    expect(own?.[2]).toBeDefined()
    expect(theirs?.[2]).toBeDefined()
    expect(
      Number(own?.[2]),
      'the sync must not start in the backfill’s hour',
    ).not.toBe(Number(theirs?.[2]))
  })

  it('declares read-only token permissions at the workflow level', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m)
  })

  it('serialises runs instead of cancelling them', () => {
    // `cancel-in-progress: false` is the load-bearing half: killing a
    // half-finished sync leaves repos indexed under a stale README, and could
    // interleave one run's prune sweep with another's writes.
    expect(workflow).toMatch(/^concurrency:\n {2}group: corvus-github-sync$/m)
    expect(workflow).toContain('cancel-in-progress: false')
  })

  it('targets production through the secret the other two workflows use', () => {
    expect(workflow).toContain(PRODUCTION_ENV.database)
    expect(backfill).toContain('SUPABASE_DB_URL_PROD')
  })

  it('carries the embedding provider key ci.yml already uses', () => {
    expect(workflow).toContain(PRODUCTION_ENV.openai)
    expect(ci).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
  })

  it('falls back to the workflow’s own token when no PAT secret is set', () => {
    // The optional-secret design: the job must not be blocked on provisioning
    // a PAT that public-repo reads may not need. Both halves of the expression
    // are asserted, because losing the fallback breaks every run and losing
    // the override removes the documented escape hatch.
    expect(workflow).toContain(
      'GITHUB_TOKEN: ${{ secrets.CORVUS_GITHUB_SYNC_TOKEN || secrets.GITHUB_TOKEN }}',
    )
  })

  it('keeps every secret out of the job-wide env', () => {
    // A job-level `env:` is in scope for EVERY step, one of which is
    // `pnpm install --frozen-lockfile` — whose allowed third-party build
    // scripts would then run holding the production connection string, the
    // OpenAI key and a GitHub token.
    const { jobScope } = splitJob()
    expect(jobScope).not.toContain(PRODUCTION_ENV.database)
    expect(jobScope).not.toContain(PRODUCTION_ENV.openai)
    expect(jobScope).not.toContain(PRODUCTION_ENV.payloadSecret)
    expect(jobScope).not.toContain(PRODUCTION_ENV.githubToken)
    expect(jobScope).not.toMatch(/^ {4}env:$/m)
  })

  it('declares each secret on exactly the steps that use it', () => {
    const checkStep = 'name: Check required secrets are present'
    const runStep =
      'name: Sync public repos into corvus_embeddings (production)'

    expect(stepsCarrying(PRODUCTION_ENV.database)).toEqual([checkStep, runStep])
    expect(stepsCarrying(PRODUCTION_ENV.openai)).toEqual([checkStep, runStep])
    // Only the run step reads GitHub or mints a Payload context; the check
    // step is two `test -n` calls.
    expect(stepsCarrying(PRODUCTION_ENV.githubToken)).toEqual([runStep])
    expect(stepsCarrying(PRODUCTION_ENV.payloadSecret)).toEqual([runStep])
  })

  it('fails on a missing secret by name, before touching production', () => {
    expect(workflow).toContain('SUPABASE_DB_URL_PROD secret is not set')
    expect(workflow).toContain('OPENAI_API_KEY secret is not set')
  })

  it('NEVER passes --no-prune on the schedule', () => {
    // The never-leak bar, and the reason this file exists. `--no-prune` leaves
    // a repository made private or deleted retrievable by anonymous chat turns
    // until somebody runs the script again without it. The scheduled
    // invocation must carry no flag at all: the safe behaviour is the default.
    const invocations = workflow
      .split('\n')
      .filter((line) => line.includes('scripts/sync-github-repos.ts'))

    expect(invocations, 'the workflow must run the sync').toHaveLength(1)
    expect(invocations[0]).not.toContain('--no-prune')
    expect(invocations[0]).not.toContain('--dry-run')
  })

  it('runs a script that exists', () => {
    expect(() =>
      readFileSync(path.join(repoRoot, 'scripts/sync-github-repos.ts'), 'utf8'),
    ).not.toThrow()
  })

  it('leaves the outcome in the job summary whether it passes or fails', () => {
    expect(workflow).toContain('GITHUB_STEP_SUMMARY')
    expect(workflow).toContain('if: ${{ !cancelled() }}')
    // The exact string the script logs (sync-github-repos.ts).
    expect(workflow).toContain('[corvus:github] done:')
    const script = readFileSync(
      path.join(repoRoot, 'scripts/sync-github-repos.ts'),
      'utf8',
    )
    expect(
      script,
      'the summary grep and the script’s log line must agree',
    ).toContain('[corvus:github] done:')
  })

  it('sets up Node and pnpm the way ci.yml does', () => {
    const ciNode = /NODE_VERSION:\s*'([^']+)'/.exec(ci)?.[1]
    const ownNode = /NODE_VERSION:\s*'([^']+)'/.exec(workflow)?.[1]

    expect(ciNode, 'ci.yml must still pin a full patch version').toMatch(
      /^\d+\.\d+\.\d+$/,
    )
    expect(
      ownNode,
      'the sync must run on the Node version CI validates against',
    ).toBe(ciNode)

    expect(workflow).toContain('corepack enable')
    expect(workflow).toContain('cache: pnpm')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
  })

  it('checks out without persisting a token on disk', () => {
    const checkout = splitJob().steps.find((step) =>
      step.body.includes('actions/checkout@'),
    )
    expect(checkout, 'the job must still check the repo out').toBeDefined()

    // Property lines only: the step's own comment quotes the literal in prose,
    // so a body-wide match would stay green with the comment intact and the
    // actual `with:` entry deleted.
    const propertyLines = (checkout?.body ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
    expect(
      propertyLines,
      'actions/checkout must set persist-credentials: false as a YAML property',
    ).toContain('persist-credentials: false')
  })

  it('bounds the run so a hung call cannot hold the concurrency group', () => {
    const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(workflow)?.[1])
    expect(minutes).toBeGreaterThan(0)
    expect(minutes).toBeLessThan(360)
  })
})
