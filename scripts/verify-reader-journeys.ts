/**
 * Own one disposable reader lab without borrowing a developer's database,
 * server or build. The recipe and evidence limits live in docs/TESTING.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
)
const ORIGIN = 'http://127.0.0.1:3000'
const IMAGE = 'pgvector/pgvector:pg16'
const LABEL = 'bp.reader-lab'
// pnpm 11 otherwise installs stale dependencies before both run and exec.
const PNPM_NO_INSTALL = [
  '--config.verify-deps-before-run=error',
  '--config.pm-on-fail=error',
  // Validate the existing local install; CI's pnpm defaults describe another
  // virtual-store layout. This option leaves the child's CI=1 unchanged.
  '--config.ci=false',
]
const SPECS = ['article-discovery.spec.ts', 'command-palette-discovery.spec.ts']
const EXPECTED = [
  `${SPECS[0]}:search finds an article, opening it and coming back keeps the search`,
  `${SPECS[1]}:global search reaches an article and copies its link (light)`,
  `${SPECS[1]}:global search reaches an article and copies its link (dark)`,
]
type Identity = { dev: number; ino: number }
type State = {
  version: 1
  root: string
  run: string
  token: string
  created: string
  source: string
  dependencies: string
  browser: string
  browserHash: string
  envHash: string
  dockerHost: string
  daemon: string
  container?: string
  pid?: number
  started?: string
  build?: string
  originalBuild?: Identity
  ownedBuild?: Identity
  media?: Identity
  phase: 'preparing' | 'ready' | 'cleaned'
  attempt: number
}
type TestResult = {
  status: string
  retry: number
  attachments?: { name: string; path?: string }[]
}
type ReportTest = {
  projectName: string
  status: string
  expectedStatus: string
  annotations?: unknown[]
  results: TestResult[]
}
type ReportSuite = {
  suites?: ReportSuite[]
  specs?: { file: string; title: string; tests: ReportTest[] }[]
}
type Report = {
  suites: ReportSuite[]
  errors: unknown[]
  stats: Record<string, number>
}

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function hash(bytes: string | Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}
function json(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}
function identity(file: string): Identity {
  const stat = lstatSync(file)
  must(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `Not a real directory: ${file}`,
  )
  return { dev: stat.dev, ino: stat.ino }
}
function sameDirectory(file: string, expected: Identity) {
  const actual = identity(file)
  must(
    actual.dev === expected.dev && actual.ino === expected.ino,
    `Directory replaced: ${file}`,
  )
}
function command(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(bin, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  must(
    !result.error && result.status === 0,
    `Command failed: ${bin} ${args[0] ?? ''} (exit ${result.status}); ${result.error?.message ?? ''}`,
  )
  return result.stdout.trim()
}
/** Fixed loopback ports require a local Unix-socket Docker endpoint. */
export function assertLocalDockerHost(host: string) {
  must(
    host.startsWith('unix://') &&
      path.isAbsolute(host.slice(7)) &&
      !/[?#\n\r]/.test(host),
    'Docker must use a local Unix socket, not a remote or ambiguous endpoint',
  )
}
function pinDockerHost() {
  must(
    !(process.env.DOCKER_HOST && process.env.DOCKER_CONTEXT),
    'Ambiguous Docker selection: both DOCKER_HOST and DOCKER_CONTEXT are set',
  )
  const selected =
    process.env.DOCKER_HOST ||
    command('docker', [
      'context',
      'inspect',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ])
  assertLocalDockerHost(selected)
  const socket = realpathSync(selected.slice(7))
  must(lstatSync(socket).isSocket(), 'Docker endpoint is not a socket')
  return `unix://${socket}`
}
function dockerEnvironment() {
  // Do not let later context/TLS environment drift override the saved endpoint.
  return {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    NODE_ENV: 'production' as const,
  }
}
function docker(s: Pick<State, 'dockerHost'>, args: string[]) {
  assertLocalDockerHost(s.dockerHost)
  return command(
    'docker',
    ['--host', s.dockerHost, ...args],
    dockerEnvironment(),
  )
}
function verifyDaemon(s: State) {
  must(
    s.daemon && docker(s, ['info', '--format', '{{.ID}}']) === s.daemon,
    'Docker daemon changed; no cleanup or runtime mutation is authorized',
  )
}
function git(...args: string[]) {
  return command('git', args)
}
function lockPath() {
  return path.join(git('rev-parse', '--absolute-git-dir'), 'bp-reader-lab.json')
}
function save(s: State) {
  json(path.join(s.run, 'state.json'), s)
}
function lockMatches(s: State) {
  const lock = JSON.parse(readFileSync(lockPath(), 'utf8'))
  must(
    lock.token === s.token && lock.run === s.run,
    'Another run owns this checkout',
  )
}

/** Pin documented services off, ignoring ambient credentials and database URLs. */
export function labEnvironment(
  example: string,
  browser: string,
  ambient: Record<string, string | undefined> = process.env,
) {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' }
  for (const match of example.matchAll(/^(?:# ?)?([A-Z_][A-Z0-9_]*)=/gm))
    env[match[1]] = ''
  for (const key of [
    'POSTGRES_URL',
    'DATABASE_URL',
    'VERCEL_ENV',
    'NEXT_PUBLIC_VERCEL_ENV',
    'VERCEL_PROJECT_PRODUCTION_URL',
  ])
    env[key] = ''
  return Object.assign(env, {
    HOME: ambient.HOME,
    PATH: ambient.PATH,
    LANG: 'en_US.UTF-8',
    CI: '1',
    NODE_ENV: 'production',
    DATABASE_URI: 'postgres://postgres:postgres@127.0.0.1:55432/bp_journey',
    PAYLOAD_SECRET: 'ci-not-a-real-secret',
    NEXT_PUBLIC_SITE_URL: ORIGIN,
    NEXT_PUBLIC_SITE_NAME: 'BP Portfolio (journey)',
    NEXT_TELEMETRY_DISABLED: '1',
    PLAYWRIGHT_EXECUTABLE_PATH: browser,
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_AUTO_PIN: '0',
    // pnpm's environment override is applied after its CLI options.
    pnpm_config_verify_deps_before_run: 'error',
    pnpm_config_pm_on_fail: 'error',
  })
}
function environment(s: State) {
  return labEnvironment(
    readFileSync(path.join(ROOT, '.env.example'), 'utf8'),
    s.browser,
  )
}
function envFiles() {
  const files: Record<string, string> = {}
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    for (const name of [
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
      '.env.development',
      '.env.development.local',
    ]) {
      const file = path.join(dir, name)
      if (existsSync(file)) files[file] = hash(readFileSync(file))
    }
    if (dir === path.dirname(dir)) break
  }
  return files
}
function checkEnvironment(s: State) {
  // Both actual loaders, in both modes (Payload's parent fallback uses dev mode).
  const env = environment(s)
  const script = `
    const { createRequire } = await import('node:module');
    const nextEnv = createRequire(createRequire(process.cwd() + '/').resolve('next/package.json'))('@next/env');
    const { loadEnv } = await import('./node_modules/payload/dist/bin/loadEnv.js');
    loadEnv();
    nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', { info() {}, error() {} }, true);
    const allowed = new Set(${JSON.stringify([...Object.keys(env).filter((k) => env[k]), '__NEXT_PROCESSED_ENV', '__CF_USER_TEXT_ENCODING'])});
    const unexpected = Object.keys(process.env).filter(k => process.env[k] && !allowed.has(k));
    if (unexpected.length) { console.error('Unexpected environment names: ' + unexpected.sort().join(', ')); process.exit(1); }
  `
  for (const mode of ['development', 'production'] as const) {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: ROOT, env: { ...env, NODE_ENV: mode }, encoding: 'utf8' },
    )
    must(
      result.status === 0,
      `Environment loader check failed (${mode}); no runtime started. ${result.stderr}`,
    )
  }
  must(
    hash(JSON.stringify(envFiles())) === s.envHash,
    'Environment files changed; clean up and prepare again',
  )
}
function sourceSnapshot() {
  const files: Record<string, string> = {}
  const names = git(
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  )
    .split('\0')
    .filter(Boolean)
  for (const name of [...new Set(names)].sort()) {
    // Owned seed media are recorded separately, not attributed to source.
    if (name.startsWith('media/')) continue
    const file = path.join(ROOT, name)
    files[name] = existsSync(file) ? hash(readFileSync(file)) : '(deleted)'
  }
  return {
    head: git('rev-parse', 'HEAD'),
    status: git('status', '--porcelain'),
    files,
    digest: hash(JSON.stringify(files)),
  }
}

/** Identify the installed dependency graph and direct resolutions across phases. */
export function dependencySnapshot(root = ROOT) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  )
  const names = [
    'node_modules/.modules.yaml',
    'node_modules/.pnpm/lock.yaml',
    'node_modules/.pnpm-workspace-state-v1.json',
    ...Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
      .sort()
      .map((name) => `node_modules/${name}/package.json`),
  ]
  const files = Object.fromEntries(
    names.map((name) => {
      const file = realpathSync(path.join(root, name))
      return [name, { path: file, sha256: hash(readFileSync(file)) }]
    }),
  )
  const inputs = { node: process.version, executable: process.execPath, files }
  return { ...inputs, digest: hash(JSON.stringify(inputs)) }
}
function inputFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    must(!entry.isSymbolicLink(), `Unexpected input symlink: ${file}`)
    if (entry.isDirectory()) {
      for (const [key, value] of Object.entries(inputFiles(file)))
        result[`${entry.name}/${key}`] = value
    } else result[entry.name] = hash(readFileSync(file))
  }
  return result
}
async function freePort(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', () =>
      reject(
        new Error(
          `Port ${port} is occupied; refusing to borrow another instance`,
        ),
      ),
    )
    server.listen(port, '127.0.0.1', () =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  })
}
type Container = {
  Id: string
  Config: { Labels: Record<string, string> }
  HostConfig: {
    Binds: unknown[] | null
    PortBindings: Record<string, { HostIp: string; HostPort: string }[]>
  }
  Mounts: { Type?: string; Destination?: string }[]
  State: { Running: boolean }
}

/** Refuse a familiar name that now points at somebody else's database. */
export function assertContainer(info: Container, id: string, token: string) {
  must(
    info.Id === id && info.Config.Labels[LABEL] === token,
    'Database ownership mismatch',
  )
  must(info.State.Running, 'Owned database is not running')
  must(
    info.Mounts.every(
      (mount) =>
        mount.Type === 'tmpfs' &&
        mount.Destination === '/var/lib/postgresql/data',
    ) && !info.HostConfig.Binds?.length,
    'Database has unexpected persistent mounts',
  )
  must(
    JSON.stringify(info.HostConfig.PortBindings) ===
      JSON.stringify({
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }],
      }),
    'Database port binding mismatch',
  )
}
function containerInfo(s: State) {
  must(s.container, 'Missing database prerequisite')
  const [info] = JSON.parse(docker(s, ['inspect', s.container])) as Container[]
  assertContainer(info, s.container, s.token)
  return info
}
function processStart(pid: number) {
  return command('ps', ['-p', String(pid), '-o', 'lstart=']).trim()
}
function assertServer(s: State) {
  must(
    s.pid && s.started && processStart(s.pid) === s.started,
    'Owned server missing or PID reused',
  )
  const listeners = command('lsof', [
    '-nP',
    '-t',
    '-iTCP:3000',
    '-sTCP:LISTEN',
  ]).split('\n')
  must(
    listeners.length === 1 && Number(listeners[0]) === s.pid,
    'Wrong process owns the application port',
  )
}
async function logged(s: State, name: string, bin: string, args: string[]) {
  const log = openSync(path.join(s.run, `${name}.log`), 'wx', 0o600)
  console.log(name)
  try {
    return await new Promise<number>((resolve, reject) => {
      const child = spawn(bin, args, {
        cwd: ROOT,
        env: environment(s),
        stdio: ['ignore', log, log],
      })
      child.once('error', reject)
      child.once('exit', (code) => resolve(code ?? 1))
    })
  } finally {
    closeSync(log)
  }
}
async function waitFor(check: () => Promise<void> | void, seconds: number) {
  let last: unknown
  for (let i = 0; i < seconds; i++) {
    try {
      await check()
      return
    } catch (error) {
      last = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw last
}
async function doctor(s: State) {
  must(s.phase === 'ready', 'Prepare did not reach ready; cleanup is required')
  lockMatches(s)
  verifyDaemon(s)
  must(
    dependencySnapshot().digest === s.dependencies,
    'Installed dependencies changed since prepare; cleanup and a new run are required',
  )
  checkEnvironment(s)
  must(
    sourceSnapshot().digest === s.source,
    'Source changed since prepare; clean up and prepare again',
  )
  must(
    hash(readFileSync(s.browser)) === s.browserHash,
    'Browser changed since prepare',
  )
  must(s.ownedBuild && s.media, 'Missing owned directories')
  sameDirectory(path.join(ROOT, '.next'), s.ownedBuild)
  sameDirectory(path.join(ROOT, 'media'), s.media)
  must(
    readFileSync(path.join(ROOT, '.next/BUILD_ID'), 'utf8').trim() === s.build,
    'Wrong build',
  )
  containerInfo(s)
  assertServer(s)
  const response = await fetch(`${ORIGIN}/api/search`, {
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  })
  must(response.ok, 'Fixture readiness request failed')
  const items = (await response.json()) as { title: string; url: string }[]
  const slugs = docker(s, [
    'exec',
    s.container!,
    'psql',
    '-U',
    'postgres',
    '-d',
    'bp_journey',
    '-Atc',
    "SELECT slug FROM posts WHERE _status = 'published' ORDER BY slug",
  ]).split('\n')
  must(
    JSON.stringify(slugs) ===
      JSON.stringify([
        'product-minded-engineering',
        'react-server-components-in-practice',
        'shipping-reliable-software',
      ]),
    'Owned seed is missing or has unexpected articles',
  )
  must(
    Array.isArray(items) &&
      [
        'React Server Components in practice',
        'Product-minded engineering',
        'Shipping reliable software with small, focused changes',
      ].every((title) =>
        items.slice(0, 6).some((item) => item.title === title),
      ),
    'Required palette fixtures unavailable',
  )
  return {
    checkedAt: new Date().toISOString(),
    source: s.source,
    dependencies: s.dependencies,
    build: s.build,
    pid: s.pid,
    container: s.container,
    origin: ORIGIN,
    slugs,
  }
}

/** Require the exact three executed cases, never just a successful process or total. */
export function assessReport(report: Report, exit: number) {
  const cases: { key: string; test: ReportTest }[] = []
  const walk = (suite: ReportSuite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests)
        cases.push({ key: `${path.basename(spec.file)}:${spec.title}`, test })
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of report.suites) walk(suite)
  const reasons: string[] = []
  if (exit !== 0 || report.errors.length) reasons.push('runner failed')
  if (
    report.stats.expected !== 3 ||
    report.stats.skipped !== 0 ||
    report.stats.unexpected !== 0 ||
    report.stats.flaky !== 0
  )
    reasons.push('required counts not satisfied')
  if (
    JSON.stringify(cases.map((c) => c.key).sort()) !==
    JSON.stringify([...EXPECTED].sort())
  )
    reasons.push('required case identities not satisfied')
  for (const { key, test } of cases) {
    if (
      test.projectName !== 'chromium' ||
      test.status !== 'expected' ||
      test.expectedStatus !== 'passed' ||
      test.results.length !== 1 ||
      test.results[0].status !== 'passed' ||
      test.results[0].retry !== 0
    )
      reasons.push(`not executed once: ${key}`)
  }
  return { proven: reasons.length === 0, reasons, stats: report.stats, cases }
}
type TraceEvent = {
  type: string
  callId?: string
  method?: string
  error?: unknown
  [key: string]: unknown
}

/** Pair trace starts and ends so an absent assertion trace cannot be called proof. */
export function assertionEvidence(events: TraceEvent[]) {
  const starts = events.filter(
    (event) => event.type === 'before' && event.method === 'expect',
  )
  const assertions = starts.map((start) => ({
    start,
    end: events.find(
      (event) => event.type === 'after' && event.callId === start.callId,
    ),
  }))
  must(
    assertions.length && assertions.every((assertion) => assertion.end),
    'Missing or incomplete assertion trace',
  )
  must(
    assertions.some((assertion) => !assertion.end?.error),
    'No successful assertion in trace',
  )
  return assertions
}
function traceEvidence(
  assessment: ReturnType<typeof assessReport>,
  folder: string,
) {
  return assessment.cases.map(({ key, test }) => {
    const traces =
      test.results[0]?.attachments?.filter(
        (attachment) => attachment.name === 'trace',
      ) ?? []
    must(traces.length === 1 && traces[0].path, `Missing trace: ${key}`)
    const file = realpathSync(traces[0].path)
    must(
      file.startsWith(`${realpathSync(folder)}/results/`),
      'Trace outside this drive',
    )
    const events = command('unzip', ['-p', file, 'test.trace'])
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TraceEvent)
    return {
      key,
      trace: file,
      sha256: hash(readFileSync(file)),
      assertions: assertionEvidence(events),
    }
  })
}
async function drive(s: State) {
  const before = await doctor(s)
  const attempt = ++s.attempt
  save(s)
  const folder = path.join(s.run, `drive-${attempt}`)
  mkdirSync(folder)
  json(path.join(folder, 'doctor.json'), before)
  json(path.join(folder, 'source.json'), sourceSnapshot())
  const dump = docker(s, [
    'exec',
    s.container!,
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'bp_journey',
    '--data-only',
    '--no-owner',
    '--no-privileges',
  ])
  writeFileSync(path.join(folder, 'seed.sql'), dump, { mode: 0o600 })
  json(path.join(folder, 'inputs.json'), {
    database: hash(dump),
    dependencies: dependencySnapshot(),
    media: inputFiles(path.join(ROOT, 'media')),
    envFiles: envFiles(),
    browser: { path: s.browser, sha256: s.browserHash },
    node: process.version,
    seed: hash(readFileSync(path.join(ROOT, 'scripts/seed-e2e.ts'))),
  })
  const config = path.join(folder, 'playwright.config.ts')
  // Import the real config; only redirect outputs and replace its server lifecycle
  // with our already-doctored server. Product expectations/specs stay untouched.
  writeFileSync(
    config,
    `import base from ${JSON.stringify(path.join(ROOT, 'playwright.config.ts'))}\nexport default { ...base, testDir: ${JSON.stringify(path.join(ROOT, 'e2e'))}, testMatch: ${JSON.stringify(SPECS)}, retries: 0, workers: 1, webServer: undefined, outputDir: ${JSON.stringify(path.join(folder, 'results'))}, reporter: [['list'], ['json', {outputFile: ${JSON.stringify(path.join(folder, 'report.json'))}}]], use: {...base.use, trace: 'on', screenshot: 'only-on-failure'} }\n`,
  )
  const started = new Date().toISOString()
  const exit = await logged(s, `drive-${attempt}`, 'pnpm', [
    ...PNPM_NO_INSTALL,
    'exec',
    'playwright',
    'test',
    '--config',
    config,
  ])
  json(path.join(folder, 'execution.json'), {
    started,
    ended: new Date().toISOString(),
    exit,
    ci: true,
    retries: 0,
  })
  let assessment: ReturnType<typeof assessReport>
  try {
    assessment = assessReport(
      JSON.parse(readFileSync(path.join(folder, 'report.json'), 'utf8')),
      exit,
    )
    json(
      path.join(folder, 'assertions.json'),
      traceEvidence(assessment, folder),
    )
    await doctor(s)
  } catch (error) {
    json(path.join(folder, 'verdict.json'), {
      proven: false,
      error: String(error),
    })
    throw error
  }
  json(path.join(folder, 'verdict.json'), assessment)
  must(
    assessment.proven,
    `Journey not proven: ${assessment.reasons.join('; ')}. Retain evidence, cleanup, then investigate.`,
  )
  console.log(`Proven: three cases / two journeys. Evidence: ${folder}`)
}

/** Remove a directory only while its recorded filesystem identity still matches. */
export function removeOwnedDirectory(file: string, expected: Identity) {
  sameDirectory(file, expected)
  rmSync(file, { recursive: true })
}
/** Docker versions vary the case of missing-object diagnostics; other failures stay unknown. */
export function isMissingDockerObject(stderr: string) {
  return /no such (?:object|container):/i.test(stderr)
}
async function cleanup(s: State) {
  if (s.phase === 'cleaned') return
  lockMatches(s)
  verifyDaemon(s)
  // Refuse mismatches before removing anything; an ambiguous resource needs
  // inspection, not a force option. Evidence and the original build survive.
  if (s.ownedBuild) sameDirectory(path.join(ROOT, '.next'), s.ownedBuild)
  if (s.media) sameDirectory(path.join(ROOT, 'media'), s.media)
  if (s.originalBuild)
    sameDirectory(path.join(s.run, 'original.next'), s.originalBuild)
  if (s.pid) {
    try {
      process.kill(s.pid, 0)
    } catch {
      s.pid = undefined
    }
    if (s.pid) {
      must(
        s.started && processStart(s.pid) === s.started,
        'Server PID was reused; refusing to signal it',
      )
      process.kill(s.pid, 'SIGTERM')
      await waitFor(() => {
        try {
          process.kill(s.pid!, 0)
        } catch {
          return
        }
        throw new Error('Server has not stopped')
      }, 20)
      s.pid = undefined
      save(s)
    }
  }
  if (s.container) {
    const probe = spawnSync(
      'docker',
      ['--host', s.dockerHost, 'inspect', s.container],
      {
        env: dockerEnvironment(),
        encoding: 'utf8',
      },
    )
    if (probe.status === 0) {
      const [info] = JSON.parse(probe.stdout) as Container[]
      must(
        info.Id === s.container && info.Config.Labels[LABEL] === s.token,
        'Database ownership mismatch; refusing cleanup',
      )
      docker(s, ['rm', '-f', s.container])
    } else {
      // Distinguish a deleted container from an unavailable Docker daemon.
      verifyDaemon(s)
      must(
        isMissingDockerObject(probe.stderr),
        'Cannot verify database cleanup',
      )
    }
    s.container = undefined
    save(s)
  }
  if (s.media) {
    removeOwnedDirectory(path.join(ROOT, 'media'), s.media)
    s.media = undefined
    save(s)
  }
  if (s.ownedBuild) {
    removeOwnedDirectory(path.join(ROOT, '.next'), s.ownedBuild)
    s.ownedBuild = undefined
    save(s)
  }
  if (s.originalBuild) {
    must(
      !existsSync(path.join(ROOT, '.next')),
      'Cannot overwrite an unexpected build during restoration',
    )
    renameSync(path.join(s.run, 'original.next'), path.join(ROOT, '.next'))
    sameDirectory(path.join(ROOT, '.next'), s.originalBuild)
    s.originalBuild = undefined
  }
  s.phase = 'cleaned'
  save(s)
  rmSync(lockPath())
  json(path.join(s.run, 'cleanup.json'), {
    cleanedAt: new Date().toISOString(),
    evidenceRetained: true,
    source: sourceSnapshot(),
  })
  console.log(`Cleaned owned resources; retained ${s.run}`)
}
async function prepare(run: string, browser: string) {
  must(
    !existsSync(run),
    'Evidence directory must be new; never reuse an earlier receipt',
  )
  must(
    !existsSync(lockPath()),
    'Checkout already has a reader lab; inspect its lock and clean up that run first',
  )
  must(
    !existsSync(path.join(ROOT, 'media')),
    'Pre-existing media must be preserved; use an empty owned checkout',
  )
  must(
    browser && path.isAbsolute(browser),
    'Pass --browser with an existing Chromium executable; nothing is installed',
  )
  command(browser, ['--version'])
  // Exercise the real dependency admission before creating any owned resources.
  // Corepack must use the existing cached manager, never fetch or pin one.
  command(
    'pnpm',
    [...PNPM_NO_INSTALL, 'exec', 'node', '--version'],
    labEnvironment(
      readFileSync(path.join(ROOT, '.env.example'), 'utf8'),
      browser,
    ),
  )
  command('lsof', ['-v'])
  command('unzip', ['-v'])
  const dockerHost = pinDockerHost()
  const daemon = docker({ dockerHost }, ['info', '--format', '{{.ID}}'])
  must(daemon, 'Docker daemon identity unavailable')
  docker({ dockerHost }, ['image', 'inspect', IMAGE])
  must(
    existsSync(path.join(ROOT, 'node_modules/next/package.json')),
    'Missing installed dependencies',
  )
  await freePort(3000)
  await freePort(55432)
  const s: State = {
    version: 1,
    root: ROOT,
    run,
    token: randomUUID(),
    created: new Date().toISOString(),
    source: sourceSnapshot().digest,
    dependencies: dependencySnapshot().digest,
    browser,
    dockerHost,
    daemon,
    browserHash: hash(readFileSync(browser)),
    envHash: hash(JSON.stringify(envFiles())),
    phase: 'preparing',
    attempt: 0,
  }
  checkEnvironment(s)
  mkdirSync(run, { recursive: false, mode: 0o700 })
  save(s)
  writeFileSync(lockPath(), JSON.stringify({ token: s.token, run }), {
    flag: 'wx',
    mode: 0o600,
  })
  try {
    json(path.join(run, 'source.json'), sourceSnapshot())
    json(path.join(run, 'dependencies.json'), dependencySnapshot())
    json(path.join(run, 'environment.json'), {
      dockerHost: s.dockerHost,
      daemon: s.daemon,
      envFiles: envFiles(),
      nonemptyNames: Object.keys(environment(s))
        .filter((k) => environment(s)[k])
        .sort(),
      node: process.version,
      image: docker(s, ['image', 'inspect', IMAGE, '--format', '{{.Id}}']),
    })
    const next = path.join(ROOT, '.next')
    if (existsSync(next)) {
      s.originalBuild = identity(next)
      save(s)
      renameSync(next, path.join(run, 'original.next'))
    }
    mkdirSync(next)
    s.ownedBuild = identity(next)
    save(s)
    mkdirSync(path.join(ROOT, 'media'))
    s.media = identity(path.join(ROOT, 'media'))
    save(s)
    s.container = docker(s, [
      'create',
      '--pull=never',
      '--rm',
      '--name',
      `bp-reader-${s.token}`,
      '--label',
      `${LABEL}=${s.token}`,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-p',
      '127.0.0.1:55432:5432',
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_PASSWORD=postgres',
      '-e',
      'POSTGRES_DB=bp_journey',
      IMAGE,
    ])
    save(s)
    docker(s, ['start', s.container])
    await waitFor(() => {
      docker(s, [
        'exec',
        s.container!,
        'pg_isready',
        '-q',
        '-U',
        'postgres',
        '-d',
        'bp_journey',
      ])
    }, 30)
    containerInfo(s)
    for (const step of ['migrate', 'seed:e2e', 'build'])
      must(
        (await logged(s, step.replace(':', '-'), 'pnpm', [
          ...PNPM_NO_INSTALL,
          step,
        ])) === 0,
        `${step} failed; inspect retained log`,
      )
    // Next can recreate its build directory; record the directory it actually made.
    s.ownedBuild = identity(next)
    s.build = readFileSync(path.join(next, 'BUILD_ID'), 'utf8').trim()
    save(s)
    const log = openSync(path.join(run, 'server.log'), 'wx', 0o600)
    const server = spawn(
      process.execPath,
      [
        path.join(ROOT, 'node_modules/next/dist/bin/next'),
        'start',
        '-H',
        '127.0.0.1',
        '-p',
        '3000',
      ],
      {
        cwd: ROOT,
        env: environment(s),
        detached: true,
        stdio: ['ignore', log, log],
      },
    )
    closeSync(log)
    must(server.pid, 'Server failed to spawn')
    s.pid = server.pid
    s.started = processStart(s.pid)
    save(s)
    server.unref()
    await waitFor(async () => {
      assertServer(s)
      const r = await fetch(`${ORIGIN}/articles`, {
        signal: AbortSignal.timeout(2000),
      })
      must(r.ok, 'App not ready')
    }, 60)
    s.phase = 'ready'
    save(s)
    json(path.join(run, 'doctor.json'), await doctor(s))
    console.log(`Ready: ${ORIGIN}\nRun: ${run}`)
  } catch (error) {
    json(path.join(run, 'failure.json'), {
      at: new Date().toISOString(),
      error: String(error),
    })
    await cleanup(s)
    throw error
  }
}
async function main() {
  const [action, ...args] = process.argv.slice(2)
  must(
    ['prepare', 'doctor', 'drive', 'evidence', 'cleanup'].includes(action),
    'Use the no-install invocation in docs/TESTING.md: verify:readers <prepare|doctor|drive|evidence|cleanup> --run /absolute/new/evidence-dir [--browser /existing/chromium]',
  )
  const options: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    must(
      ['--run', '--browser'].includes(args[i]) &&
        args[i + 1] &&
        !options[args[i]],
      'Unknown, missing or repeated argument',
    )
    options[args[i]] = args[i + 1]
  }
  const run = options['--run']
  must(
    run && path.isAbsolute(run) && path.resolve(run) === run,
    '--run must be an absolute normalized path',
  )
  const parent = realpathSync(path.dirname(run))
  must(
    parent === path.dirname(run) &&
      run !== ROOT &&
      !run.startsWith(`${ROOT}/`) &&
      !ROOT.startsWith(`${run}/`),
    'Evidence must be outside the checkout, without symlinked parents',
  )
  must(
    realpathSync(process.cwd()) === ROOT,
    'Run from the owning checkout root',
  )
  if (action === 'prepare') {
    await prepare(run, options['--browser'])
    return
  }
  identity(run)
  const s = JSON.parse(
    readFileSync(path.join(run, 'state.json'), 'utf8'),
  ) as State
  must(
    s.version === 1 && s.root === ROOT && s.run === run,
    'Run belongs to a different checkout or unsupported schema',
  )
  if (action === 'evidence') {
    const files = readdirSync(run)
      .filter((name) => /^drive-\d+$/.test(name))
      .sort()
    console.log(
      JSON.stringify(
        {
          state: s.phase,
          runs: files.map((name) => {
            const f = path.join(run, name, 'verdict.json')
            return {
              path: path.dirname(f),
              verdict: existsSync(f)
                ? JSON.parse(readFileSync(f, 'utf8'))
                : { proven: false, reason: 'incomplete drive' },
            }
          }),
        },
        null,
        2,
      ),
    )
    return
  }
  const busy = path.join(run, 'operation.lock')
  const fd = openSync(busy, 'wx', 0o600)
  closeSync(fd)
  try {
    if (action === 'doctor')
      console.log(JSON.stringify(await doctor(s), null, 2))
    if (action === 'drive') await drive(s)
    if (action === 'cleanup') await cleanup(s)
  } finally {
    rmSync(busy)
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
