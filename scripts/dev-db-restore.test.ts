// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Preflight and argument-parsing tests for `scripts/dev-db-restore.sh` (#85).
 *
 * @remarks
 * The repo has no bash test harness, so the script is exercised as a
 * subprocess: every test runs it with `--dry-run` (or with arguments that fail
 * before any work starts) against a hermetic PATH built here — a small link
 * farm of the coreutils the script needs, plus stub `gh` / `psql` /
 * `pg_restore` / `docker` / `openssl` shims whose behavior is steered by
 * environment variables. Nothing here touches the network, Docker, or a
 * database, and the stubs shadow any real binaries so the results do not
 * depend on what happens to be installed on the machine.
 *
 * What this file deliberately does NOT cover: the real `gh run download`, the
 * real decrypt, and the real `pg_restore` into a live container. Those need an
 * authenticated `gh`, the production passphrase, and Docker, and are the
 * acceptance run documented in `docs/MAINTENANCE.md`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.dirname(here)
const scriptPath = path.join(here, 'dev-db-restore.sh')

/** Exit codes the script reserves per failure mode; kept in sync by these tests. */
const EXIT = {
  usage: 2,
  missingCommand: 3,
  ghAuth: 4,
  noPassphrase: 5,
  pgClient: 6,
  noDatabase: 7,
} as const

/**
 * Tools the dry-run path shells out to, resolved from the real PATH.
 * `bash` and `env` are here because the stub shims below carry a
 * `#!/usr/bin/env bash` shebang and must resolve on this PATH too.
 */
const REQUIRED_TOOLS = ['bash', 'env', 'dirname', 'cat', 'grep', 'tail']
/** Resolved when present, so non-dry-run code paths would still work. */
const OPTIONAL_TOOLS = [
  'head',
  'sort',
  'find',
  'wc',
  'tr',
  'mktemp',
  'chmod',
  'rm',
  'shred',
  'basename',
]

let sandbox = ''
/** PATH entry holding symlinks to real coreutils and nothing else. */
let farmDir = ''
/** PATH entry holding the fake gh/psql/pg_restore/docker/openssl. */
let stubDir = ''
let bashPath = ''

/** First directory on the ambient PATH that holds an executable named `name`. */
function resolveOnPath(name: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function writeStub(name: string, body: string): void {
  const file = path.join(stubDir, name)
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(file, 0o755)
}

beforeAll(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'bp-db-restore-test-'))
  farmDir = path.join(sandbox, 'farm')
  stubDir = path.join(sandbox, 'stubs')
  mkdirSync(farmDir, { recursive: true })
  mkdirSync(stubDir, { recursive: true })

  const bash = resolveOnPath('bash')
  expect(bash, 'bash must be resolvable to run the script').toBeTruthy()
  bashPath = bash as string

  for (const tool of REQUIRED_TOOLS) {
    const real = resolveOnPath(tool)
    expect(real, `the test host must provide ${tool}`).toBeTruthy()
    symlinkSync(real as string, path.join(farmDir, tool))
  }
  for (const tool of OPTIONAL_TOOLS) {
    const real = resolveOnPath(tool)
    if (real) symlinkSync(real, path.join(farmDir, tool))
  }

  // `pg_restore --version` is the only stub whose output the script parses.
  writeStub(
    'pg_restore',
    `if [ "$1" = "--version" ]; then echo "pg_restore (PostgreSQL) \${STUB_PG_VERSION:-17.6}"; exit 0; fi\nexit 0`,
  )
  writeStub(
    'gh',
    `if [ "$1" = "auth" ]; then exit "\${STUB_GH_AUTH_EXIT:-0}"; fi\nexit 0`,
  )
  writeStub(
    'psql',
    `if [ -n "\${STUB_PSQL_EXIT:-}" ]; then exit "\$STUB_PSQL_EXIT"; fi\necho "16.13 (Debian)"\nexit 0`,
  )
  writeStub('docker', 'exit 0')
  writeStub('openssl', 'exit 0')
})

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true })
})

interface RunResult {
  status: number
  stdout: string
  stderr: string
  /** stdout and stderr joined, for message assertions. */
  output: string
}

interface RunOptions {
  /** Extra environment for this run (stub knobs, passphrases). */
  env?: Record<string, string>
  /** Drop the stub shims so the required-command check fires. */
  withoutStubs?: boolean
}

function run(args: string[], options: RunOptions = {}): RunResult {
  const searchPath = options.withoutStubs ? farmDir : `${stubDir}:${farmDir}`
  const result = spawnSync(bashPath, [scriptPath, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
    // A deliberately minimal environment: the script must not pick up the
    // developer's own PATH, passphrases, or PG* settings.
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PATH: searchPath,
      HOME: sandbox,
      // Point the .env.local reader at a path that does not exist, so a real
      // .env.local on the developer's machine cannot leak into these results.
      BP_DB_RESTORE_ENV_FILE: path.join(sandbox, 'absent.env'),
      ...options.env,
    },
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return {
    status: result.status ?? -1,
    stdout,
    stderr,
    output: stdout + stderr,
  }
}

/** A dry run whose preflights all pass, for the chosen source. */
function happyRun(args: string[] = []): RunResult {
  return run(['--dry-run', ...args], {
    env: {
      BACKUP_PASSPHRASE_PROD: 'prod-value-must-not-be-printed',
      BACKUP_PASSPHRASE: 'staging-value-must-not-be-printed',
    },
  })
}

describe('--dry-run plan', () => {
  it('defaults to the prod artifact and the prod passphrase name', () => {
    const result = happyRun()
    expect(result.status).toBe(0)
    expect(result.output).toContain('source: prod')
    expect(result.output).toContain("--pattern 'db-prod-*.dump.enc'")
    expect(result.output).toContain('-pass env:BACKUP_PASSPHRASE_PROD')
    expect(result.output).toContain(
      'Dry run: nothing downloaded, nothing dropped, nothing restored.',
    )
  })

  it('switches artifact and passphrase name with --source staging', () => {
    const result = happyRun(['--source', 'staging'])
    expect(result.status).toBe(0)
    expect(result.output).toContain("--pattern 'db-staging-*.dump.enc'")
    expect(result.output).toContain('-pass env:BACKUP_PASSPHRASE')
    expect(result.output).not.toContain('BACKUP_PASSPHRASE_PROD')
  })

  it('accepts the --source=value form', () => {
    expect(happyRun(['--source=staging']).output).toContain(
      "--pattern 'db-staging-*.dump.enc'",
    )
  })

  it('never prints a passphrase value, only its name', () => {
    const result = happyRun()
    expect(result.output).not.toContain('prod-value-must-not-be-printed')
    expect(result.output).not.toContain('staging-value-must-not-be-printed')
  })

  it('carries an alternate port through the plan and the DATABASE_URI hint', () => {
    const result = happyRun(['--port', '5433'])
    expect(result.status).toBe(0)
    expect(result.output).toContain('-p 5433')
    expect(result.output).toContain(
      'DATABASE_URI=postgres://postgres:postgres@127.0.0.1:5433/bp_portfolio_dev',
    )
  })

  it('reads the passphrase out of the env file when the shell has none', () => {
    const envFile = path.join(sandbox, 'fixture.env')
    writeFileSync(
      envFile,
      'DATABASE_URI=postgres://postgres:postgres@127.0.0.1:5432/bp_portfolio_dev\nBACKUP_PASSPHRASE_PROD="quoted-fixture-value"\n',
    )
    const result = run(['--dry-run'], {
      env: { BP_DB_RESTORE_ENV_FILE: envFile },
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'passphrase: BACKUP_PASSPHRASE_PROD (from .env.local)',
    )
    expect(result.output).not.toContain('quoted-fixture-value')
  })

  it('prints help and exits 0 without needing any tool', () => {
    const result = run(['--help'], { withoutStubs: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--source prod|staging')
    expect(result.stdout).toContain('THIS DROPS THE TARGET DATABASE')
  })
})

describe('argument validation', () => {
  it('rejects an unknown source', () => {
    const result = happyRun(['--source', 'dev'])
    expect(result.status).toBe(EXIT.usage)
    expect(result.stderr).toContain("--source must be 'prod' or 'staging'")
  })

  it('rejects an unknown flag', () => {
    const result = happyRun(['--nope'])
    expect(result.status).toBe(EXIT.usage)
    expect(result.stderr).toContain('unknown argument: --nope')
  })

  it('rejects a flag that is missing its value', () => {
    const result = happyRun(['--source'])
    expect(result.status).toBe(EXIT.usage)
    expect(result.stderr).toContain('--source requires a value')
  })

  it('rejects a non-numeric port', () => {
    const result = happyRun(['--port', 'abc'])
    expect(result.status).toBe(EXIT.usage)
    expect(result.stderr).toContain('--port must be a number')
  })

  it('refuses a non-loopback host, because the script drops the database', () => {
    const result = happyRun(['--host', 'db.example.com'])
    expect(result.status).toBe(EXIT.usage)
    expect(result.stderr).toContain('--host must be loopback')
    expect(result.stderr).toContain('never touch a remote server')
  })
})

describe('preflight failures', () => {
  it('names every missing binary when none are installed', () => {
    const result = run(['--dry-run'], { withoutStubs: true })
    expect(result.status).toBe(EXIT.missingCommand)
    for (const tool of ['gh', 'docker', 'psql', 'pg_restore', 'openssl']) {
      expect(result.stderr).toContain(tool)
    }
  })

  it('refuses a pg_restore older than the client the workflow dumps with', () => {
    const result = run(['--dry-run'], {
      env: { STUB_PG_VERSION: '16.4', BACKUP_PASSPHRASE_PROD: 'x' },
    })
    expect(result.status).toBe(EXIT.pgClient)
    expect(result.stderr).toContain('pg_restore is major 16')
    expect(result.stderr).toContain('postgresql-client-17')
  })

  it('accepts a pg_restore newer than the floor', () => {
    const result = run(['--dry-run'], {
      env: { STUB_PG_VERSION: '18.1', BACKUP_PASSPHRASE_PROD: 'x' },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('pg_restore major 18')
  })

  it('fails on the client version before it looks for a passphrase', () => {
    // Ordering matters: the cheapest, most-actionable failure must surface
    // first when several preflights would fail.
    const result = run(['--dry-run'], { env: { STUB_PG_VERSION: '15.0' } })
    expect(result.status).toBe(EXIT.pgClient)
  })

  it('names the prod passphrase variable when it is absent', () => {
    const result = run(['--dry-run'])
    expect(result.status).toBe(EXIT.noPassphrase)
    expect(result.stderr).toContain('no value for BACKUP_PASSPHRASE_PROD')
  })

  it('names the staging passphrase variable when it is absent', () => {
    const result = run(['--dry-run', '--source', 'staging'])
    expect(result.status).toBe(EXIT.noPassphrase)
    expect(result.stderr).toContain('no value for BACKUP_PASSPHRASE')
    expect(result.stderr).not.toContain('BACKUP_PASSPHRASE_PROD')
  })

  it('fails when gh is not authenticated', () => {
    const result = run(['--dry-run'], {
      env: { STUB_GH_AUTH_EXIT: '1', BACKUP_PASSPHRASE_PROD: 'x' },
    })
    expect(result.status).toBe(EXIT.ghAuth)
    expect(result.stderr).toContain('gh auth login')
  })

  it('fails when nothing answers on the database port', () => {
    const result = run(['--dry-run'], {
      env: { STUB_PSQL_EXIT: '2', BACKUP_PASSPHRASE_PROD: 'x' },
    })
    expect(result.status).toBe(EXIT.noDatabase)
    expect(result.stderr).toContain('docker compose up -d --wait db')
    expect(result.stderr).toContain('silently shadowed')
  })
})

describe('drift guards against the sources of truth', () => {
  const workflow = readFileSync(
    path.join(repoRoot, '.github/workflows/db-backup.yml'),
    'utf8',
  )
  const script = readFileSync(scriptPath, 'utf8')

  it('uses the workflow header openssl flags verbatim', () => {
    for (const flag of ['-aes-256-cbc', '-pbkdf2', '-iter 200000']) {
      expect(workflow, `db-backup.yml should still specify ${flag}`).toContain(
        flag,
      )
      expect(script, `the script should still pass ${flag}`).toContain(flag)
    }
  })

  it('uses the workflow header pg_restore flags verbatim', () => {
    const flags = '--clean --if-exists --no-owner --no-privileges'
    expect(workflow).toContain(flags)
    expect(script).toContain(flags)
  })

  it('requires the same pg client major the workflow installs', () => {
    const installed = workflow.match(/postgresql-client-(\d+)/)
    expect(installed?.[1]).toBeTruthy()
    expect(script).toContain(`REQUIRED_PG_MAJOR=${installed?.[1]}`)
  })

  it('expects the artifact names the workflow actually uploads', () => {
    // db-backup.yml builds `db-${{ matrix.target }}-${stamp}.dump.enc` and
    // uploads it under that same name, for targets staging and prod.
    expect(workflow).toContain(
      'out="db-${{ matrix.target }}-${stamp}.dump.enc"',
    )
    expect(workflow).toContain('- target: staging')
    expect(workflow).toContain('- target: prod')
    expect(script).toContain("printf 'db-%s-*.dump.enc'")
  })

  it('runs the local container on the same image as the CI postgres service', () => {
    const ci = readFileSync(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      'utf8',
    )
    const compose = readFileSync(
      path.join(repoRoot, 'docker-compose.yml'),
      'utf8',
    )
    const ciImage = ci.match(/image:\s*(pgvector\/pgvector:\S+)/)?.[1]
    const composeImage = compose.match(/image:\s*(pgvector\/pgvector:\S+)/)?.[1]
    expect(ciImage).toBeTruthy()
    expect(composeImage).toBe(ciImage)
  })
})
