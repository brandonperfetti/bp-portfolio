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
 * farm of the coreutils the script needs, plus stub `aws` / `psql` /
 * `pg_restore` / `docker` / `openssl` shims whose behavior is steered by
 * environment variables. Nothing here touches the network, Docker, or a
 * database, and the stubs shadow any real binaries so the results do not
 * depend on what happens to be installed on the machine.
 *
 * What this file deliberately does NOT cover: the real R2 download, the real
 * decrypt, and the real `pg_restore` into a live container. Those need the R2
 * token, the production passphrase, and Docker, and are the acceptance run
 * documented in `docs/MAINTENANCE.md`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.dirname(here)
const scriptPath = path.join(here, 'dev-db-restore.sh')

/** Exit codes the script reserves per failure mode; kept in sync by these tests. */
const EXIT = {
  usage: 2,
  missingCommand: 3,
  r2Access: 4,
  noPassphrase: 5,
  pgClient: 6,
  noDatabase: 7,
  artifact: 8,
  r2Credentials: 10,
} as const

/** Fixture R2 values: each must never appear in the script's output. */
const R2_ENV = {
  R2_BACKUP_ACCESS_KEY_ID: 'r2-key-id-must-not-be-printed',
  R2_BACKUP_SECRET_ACCESS_KEY: 'r2-secret-must-not-be-printed',
  R2_BACKUP_ENDPOINT: 'https://r2-endpoint-must-not-be-printed.test',
} as const

/**
 * Tools the script shells out to, resolved from the real PATH.
 * `bash` and `env` are here because the stub shims below carry a
 * `#!/usr/bin/env bash` shebang and must resolve on this PATH too.
 */
const REQUIRED_TOOLS = [
  'bash',
  'env',
  'dirname',
  'cat',
  'grep',
  'tail',
  'head',
  'sort',
  'find',
  'wc',
  'tr',
  'mktemp',
  'chmod',
  'rm',
  'basename',
]
/** `shred` is GNU-only; the script guards on it, so the farm may omit it. */
const OPTIONAL_TOOLS = ['shred']

let sandbox = ''
/** PATH entry holding symlinks to real coreutils and nothing else. */
let farmDir = ''
/** PATH entry holding the fake aws/psql/pg_restore/docker/openssl. */
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
  // `aws s3api list-objects-v2 --prefix <p>/` prints the keys tab-separated,
  // as `--output text` does; STUB_AWS_KEYS overrides the default two dated
  // keys, and `None` is what the real CLI prints for an empty prefix. Every
  // call's argv and credential environment is logged for the tests below.
  writeStub(
    'aws',
    [
      'if [ -n "${STUB_AWS_LOG:-}" ]; then',
      '  printf \'argv=%s\\n\' "$*" >> "$STUB_AWS_LOG"',
      '  printf \'env=key:%s secret:%s region:%s profile:%s config:%s\\n\' "${AWS_ACCESS_KEY_ID:+set}" "${AWS_SECRET_ACCESS_KEY:+set}" "${AWS_REGION:-}" "${AWS_PROFILE:-unset}" "${AWS_CONFIG_FILE:-}" >> "$STUB_AWS_LOG"',
      'fi',
      'if [ -n "${STUB_AWS_EXIT:-}" ]; then exit "$STUB_AWS_EXIT"; fi',
      'prefix=""; prev=""',
      'for a in "$@"; do [ "$prev" = "--prefix" ] && prefix="$a"; prev="$a"; done',
      't="${prefix%/}"',
      'if [ -n "${STUB_AWS_KEYS:-}" ]; then printf \'%s\\n\' "$STUB_AWS_KEYS"; exit 0; fi',
      'printf \'%s\\t%s\\n\' "$t/2026-09-26/db-$t-2026-09-26T091702Z.dump.enc" "$t/2026-09-25/db-$t-2026-09-25T091655Z.dump.enc"',
    ].join('\n'),
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
function happyRun(
  args: string[] = [],
  env: Record<string, string> = {},
): RunResult {
  return run(['--dry-run', ...args], {
    env: {
      BACKUP_PASSPHRASE_PROD: 'prod-value-must-not-be-printed',
      BACKUP_PASSPHRASE: 'staging-value-must-not-be-printed',
      ...R2_ENV,
      ...env,
    },
  })
}

describe('--dry-run plan', () => {
  it('defaults to the newest prod backup and the prod passphrase name', () => {
    const result = happyRun()
    expect(result.status).toBe(0)
    expect(result.output).toContain('source: prod')
    expect(result.output).toContain(
      '--bucket bp-portfolio-db-backups --prefix prod/',
    )
    expect(result.output).toContain(
      'newest: prod/2026-09-26/db-prod-2026-09-26T091702Z.dump.enc',
    )
    expect(result.output).toContain('-pass env:BACKUP_PASSPHRASE_PROD')
    expect(result.output).toContain(
      'Dry run: nothing downloaded, nothing dropped, nothing restored.',
    )
  })

  it('switches prefix and passphrase name with --source staging', () => {
    const result = happyRun(['--source', 'staging'])
    expect(result.status).toBe(0)
    expect(result.output).toContain('--prefix staging/')
    expect(result.output).toContain(
      'newest: staging/2026-09-26/db-staging-2026-09-26T091702Z.dump.enc',
    )
    expect(result.output).toContain('-pass env:BACKUP_PASSPHRASE')
    expect(result.output).not.toContain('BACKUP_PASSPHRASE_PROD')
  })

  it('accepts the --source=value form', () => {
    expect(happyRun(['--source=staging']).output).toContain('--prefix staging/')
  })

  it('never prints a passphrase or R2 value, only their names', () => {
    const result = happyRun()
    expect(result.output).not.toContain('prod-value-must-not-be-printed')
    expect(result.output).not.toContain('staging-value-must-not-be-printed')
    for (const value of Object.values(R2_ENV)) {
      expect(result.output).not.toContain(value)
    }
    expect(result.output).toContain('--endpoint-url $R2_BACKUP_ENDPOINT')
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
      [
        'DATABASE_URI=postgres://postgres:postgres@127.0.0.1:5432/bp_portfolio_dev',
        'BACKUP_PASSPHRASE_PROD="quoted-fixture-value"',
        'R2_BACKUP_ACCESS_KEY_ID=file-key-id',
        "R2_BACKUP_SECRET_ACCESS_KEY='file-secret'",
        'R2_BACKUP_ENDPOINT=https://file-endpoint.test',
        '',
      ].join('\n'),
    )
    const result = run(['--dry-run'], {
      env: { BP_DB_RESTORE_ENV_FILE: envFile },
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'passphrase: BACKUP_PASSPHRASE_PROD (from .env.local)',
    )
    expect(result.output).toContain(
      'r2: R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY R2_BACKUP_ENDPOINT (from .env.local)',
    )
    for (const value of [
      'quoted-fixture-value',
      'file-key-id',
      'file-secret',
      'file-endpoint',
    ]) {
      expect(result.output).not.toContain(value)
    }
  })

  it('prints help and exits 0 without needing any tool', () => {
    const result = run(['--help'], { withoutStubs: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--source prod|staging')
    expect(result.stdout).toContain('THIS DROPS THE TARGET DATABASE')
  })
})

describe("pnpm's `--` separator", () => {
  // pnpm forwards `--` to the script verbatim where npm strips it, so
  // `pnpm db:local:refresh -- --dry-run` arrives as a literal first argument.
  // It used to be rejected as an unknown argument (exit 2) — and the script's
  // own usage text recommended exactly that invocation.
  const passphrases = { BACKUP_PASSPHRASE_PROD: 'x', ...R2_ENV }

  it('dry-runs with the separator, as `pnpm db:local:refresh -- --dry-run` sends it', () => {
    const result = run(['--', '--dry-run'], { env: passphrases })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'Dry run: nothing downloaded, nothing dropped, nothing restored.',
    )
  })

  it('dry-runs without the separator, the recommended form', () => {
    const result = run(['--dry-run'], { env: passphrases })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'Dry run: nothing downloaded, nothing dropped, nothing restored.',
    )
  })

  it('still parses the flags that follow the separator', () => {
    const result = run(['--', '--source', 'staging', '--dry-run'], {
      env: { BACKUP_PASSPHRASE: 'x', ...R2_ENV },
    })
    expect(result.status).toBe(0)
    expect(result.output).toContain('--prefix staging/')
  })

  it('treats a lone `--` exactly like no arguments at all', () => {
    // Both proceed past the preflights and stop at the same place: the stub
    // bucket listing is empty, so neither touches a database.
    const env = { ...passphrases, STUB_AWS_KEYS: 'None' }
    const withSeparator = run(['--'], { env })
    const withNothing = run([], { env })
    expect(withSeparator.status).toBe(EXIT.artifact)
    expect(withSeparator.status).toBe(withNothing.status)
    expect(withSeparator.stderr).toBe(withNothing.stderr)
  })

  it('recommends the plain form in its own usage text', () => {
    const help = run(['--help'], { withoutStubs: true })
    expect(help.stdout).toContain('pnpm db:local:refresh [options]')
    expect(help.stdout).not.toContain('pnpm db:local:refresh -- [options]')
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
    for (const tool of ['aws', 'docker', 'psql', 'pg_restore', 'openssl']) {
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
      env: { STUB_PG_VERSION: '18.1', BACKUP_PASSPHRASE_PROD: 'x', ...R2_ENV },
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

  it('names every missing R2 variable, and never the values it has', () => {
    const result = run(['--dry-run'], {
      env: {
        BACKUP_PASSPHRASE_PROD: 'x',
        R2_BACKUP_ENDPOINT: R2_ENV.R2_BACKUP_ENDPOINT,
      },
    })
    expect(result.status).toBe(EXIT.r2Credentials)
    expect(result.stderr).toContain(
      'no value for: R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY.',
    )
    expect(result.output).not.toContain(R2_ENV.R2_BACKUP_ENDPOINT)
  })

  it('checks the R2 credentials after the passphrase', () => {
    const result = run(['--dry-run'], { env: { ...R2_ENV } })
    expect(result.status).toBe(EXIT.noPassphrase)
  })

  it('fails when the bucket cannot be listed', () => {
    const result = happyRun([], { STUB_AWS_EXIT: '254' })
    expect(result.status).toBe(EXIT.r2Access)
    expect(result.stderr).toContain(
      'could not list s3://bp-portfolio-db-backups/prod/',
    )
  })

  it('fails when the target has no backup in the bucket', () => {
    const result = happyRun([], { STUB_AWS_KEYS: 'None' })
    expect(result.status).toBe(EXIT.artifact)
    expect(result.stderr).toContain(
      "no 'prod' backup in s3://bp-portfolio-db-backups/prod/",
    )
  })

  it('fails when nothing answers on the database port', () => {
    const result = run(['--dry-run'], {
      env: { STUB_PSQL_EXIT: '2', BACKUP_PASSPHRASE_PROD: 'x', ...R2_ENV },
    })
    expect(result.status).toBe(EXIT.noDatabase)
    expect(result.stderr).toContain('docker compose up -d --wait db')
    expect(result.stderr).toContain('silently shadowed')
  })
})

describe('choosing the backup in R2', () => {
  it('picks the greatest key under the prefix, whatever order R2 lists them in', () => {
    const keys = [
      'prod/2026-09-24/db-prod-2026-09-24T091701Z.dump.enc',
      'prod/2026-09-26/db-prod-2026-09-26T091702Z.dump.enc',
      'prod/2026-09-26/db-prod-2026-09-26T140003Z.dump.enc',
      'prod/2026-09-25/db-prod-2026-09-25T091655Z.dump.enc',
    ].join('\t')
    const result = happyRun([], { STUB_AWS_KEYS: keys })
    expect(result.status).toBe(0)
    expect(result.output).toContain(
      'newest: prod/2026-09-26/db-prod-2026-09-26T140003Z.dump.enc',
    )
  })

  it("ignores keys that are not the workflow's layout", () => {
    const keys = [
      'prod/2026-09-25/db-prod-2026-09-25T091655Z.dump.enc',
      'prod/zzz-notes.txt',
      'prod/2026-09-27/db-staging-2026-09-27T091700Z.dump.enc',
      'prod/2026-09-28/db-prod-2026-09-28.dump.enc',
    ].join('\t')
    const result = happyRun([], { STUB_AWS_KEYS: keys })
    expect(result.output).toContain(
      'newest: prod/2026-09-25/db-prod-2026-09-25T091655Z.dump.enc',
    )
  })

  it('hands aws the R2 credentials through its environment only, with local AWS config shut out', () => {
    const log = path.join(sandbox, 'aws-calls.log')
    const result = happyRun([], { STUB_AWS_LOG: log, AWS_PROFILE: 'work' })
    expect(result.status).toBe(0)
    const calls = readFileSync(log, 'utf8')
    expect(calls).toContain(
      'env=key:set secret:set region:auto profile:unset config:/dev/null',
    )
    expect(calls).toContain(
      '--endpoint-url https://r2-endpoint-must-not-be-printed.test',
    )
    expect(calls).not.toContain(R2_ENV.R2_BACKUP_ACCESS_KEY_ID)
    expect(calls).not.toContain(R2_ENV.R2_BACKUP_SECRET_ACCESS_KEY)
    rmSync(log)
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

  it('expects the object keys the workflow actually writes', () => {
    // db-backup.yml keys each dump <target>/<day>/db-<target>-<stamp>.dump.enc
    // with a UTC stamp YYYY-MM-DDTHHMMSSZ, for targets staging and prod.
    expect(workflow).toContain('stamp=$(date -u +%Y-%m-%dT%H%M%SZ)')
    expect(workflow).toContain(
      'out="db-${{ matrix.target }}-${stamp}.dump.enc"',
    )
    expect(workflow).toContain(
      'BACKUP_KEY=${{ matrix.target }}/${stamp%%T*}/${out}',
    )
    expect(workflow).toContain('- target: staging')
    expect(workflow).toContain('- target: prod')
    expect(script).toContain(
      "printf '^%s/[0-9]{4}-[0-9]{2}-[0-9]{2}/db-%s-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z[.]dump[.]enc$'",
    )
  })

  it('reads the bucket the workflow writes, with the secret names it uses', () => {
    const bucket = workflow.match(/R2_BACKUP_BUCKET:\s*(\S+)/)?.[1]
    expect(bucket).toBe('bp-portfolio-db-backups')
    expect(script).toContain(`R2_BACKUP_BUCKET:-${bucket}`)
    for (const name of [
      'R2_BACKUP_ACCESS_KEY_ID',
      'R2_BACKUP_SECRET_ACCESS_KEY',
      'R2_BACKUP_ENDPOINT',
    ]) {
      expect(workflow).toContain(`secrets.${name}`)
      expect(script).toContain(name)
    }
  })

  it('never publishes the dump as an Actions artifact (#181)', () => {
    // A public repo's artifacts are downloadable by any logged-in user.
    expect(workflow).not.toMatch(/upload-artifact/)
    expect(workflow).not.toMatch(/retention-days/)
  })

  it('leaves retention to the bucket lifecycle rule alone', () => {
    // expire-backups-30d on the bucket is the one retention mechanism; a
    // workflow-side delete would be a second, silently diverging one.
    expect(workflow).toContain('expire-backups-30d')
    expect(workflow).not.toMatch(/s3 rm|delete-object|lifecycle-configuration/)
  })

  it('keeps the workflow token read-only', () => {
    expect(workflow).toMatch(/^permissions:\n  contents: read\n/m)
  })

  it('names the ignored-error classes a real production restore produced', () => {
    // Measured on the 2026-08-30 prod restore: 4 ignored errors, all of them
    // `SET transaction_timeout` (a pg17 setting the pg16 container rejects) or
    // the Supabase-only `supabase_vault` extension and its `vault.secrets`
    // COPY. Naming them is what stops the next reader treating a non-zero
    // pg_restore as a failed restore.
    expect(script).toContain('transaction_timeout')
    expect(script).toContain('supabase_vault')
    expect(script).toContain('vault.secrets')
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
