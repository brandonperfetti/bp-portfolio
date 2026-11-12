// @vitest-environment node
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  existsSync,
  symlinkSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  assessReport,
  assertionEvidence,
  assertContainer,
  assertLocalDockerHost,
  dependencySnapshot,
  labEnvironment,
  isMissingDockerObject,
  removeOwnedDirectory,
} from './verify-reader-journeys'

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function report() {
  return {
    errors: [],
    stats: { expected: 3, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [
      {
        suites: [
          {
            specs: [
              [
                'article-discovery.spec.ts',
                'search finds an article, opening it and coming back keeps the search',
              ],
              [
                'command-palette-discovery.spec.ts',
                'global search reaches an article and copies its link (light)',
              ],
              [
                'command-palette-discovery.spec.ts',
                'global search reaches an article and copies its link (dark)',
              ],
            ].map(([file, title]) => ({
              file,
              title,
              tests: [
                {
                  projectName: 'chromium',
                  status: 'expected',
                  expectedStatus: 'passed',
                  results: [
                    {
                      status: 'passed',
                      retry: 0,
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ],
  }
}
describe('reader proof admission', () => {
  it('accepts exactly the required cases executed once', () => {
    expect(assessReport(report(), 0).proven).toBe(true)
  })
  it('rejects a locally skipped fixture even when the runner exits zero', () => {
    const r = report()
    r.stats.expected = 2
    r.stats.skipped = 1
    r.suites[0].suites[0].specs[0].tests[0].results[0].status = 'skipped'
    expect(assessReport(r, 0).proven).toBe(false)
  })
  it.each([
    'missing',
    'duplicate',
    'wrong project',
    'retry',
    'expected failure',
  ])('rejects misleading green totals: %s', (defect) => {
    const r = report()
    const specs = r.suites[0].suites[0].specs
    const test = specs[0].tests[0]
    if (defect === 'missing') specs.pop()
    if (defect === 'duplicate') specs[2] = specs[0]
    if (defect === 'wrong project') test.projectName = 'other'
    if (defect === 'retry') test.results[0].retry = 1
    if (defect === 'expected failure') test.expectedStatus = 'failed'
    expect(assessReport(r, 0).proven).toBe(false)
  })
  it('rejects a runner failure after passed cases and a runner timeout before cases', () => {
    expect(assessReport(report(), 1).proven).toBe(false)
    expect(
      assessReport(
        {
          ...report(),
          suites: [],
          stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0 },
        },
        1,
      ).proven,
    ).toBe(false)
  })
})
describe('assertion traces', () => {
  it('retains completed assertions and refuses an absent or truncated trace', () => {
    const before = {
      type: 'before',
      method: 'expect',
      callId: 'expect@1',
      title: 'toBe',
    }
    const after = { type: 'after', callId: 'expect@1' }
    expect(assertionEvidence([before, after])).toHaveLength(1)
    expect(() => assertionEvidence([])).toThrow('Missing')
    expect(() => assertionEvidence([before])).toThrow('incomplete')
    expect(() =>
      assertionEvidence([before, { ...after, error: 'failed' }]),
    ).toThrow('No successful')
  })
})
describe('resource boundaries', () => {
  it('identifies installed metadata and resolved packages, and refuses missing inputs', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bp-lab-dependencies-'))
    temporary.push(dir)
    mkdirSync(path.join(dir, 'node_modules/.pnpm'), { recursive: true })
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { example: '1' } }),
    )
    for (const file of [
      '.modules.yaml',
      '.pnpm/lock.yaml',
      '.pnpm-workspace-state-v1.json',
    ])
      writeFileSync(path.join(dir, 'node_modules', file), 'original')
    const first = path.join(dir, 'first')
    const second = path.join(dir, 'second')
    for (const target of [first, second]) {
      mkdirSync(target)
      writeFileSync(path.join(target, 'package.json'), '{"version":"1"}')
    }
    const link = path.join(dir, 'node_modules/example')
    symlinkSync(first, link)
    const before = dependencySnapshot(dir)
    expect(dependencySnapshot(dir)).toEqual(before)
    writeFileSync(path.join(dir, 'node_modules/.pnpm/lock.yaml'), 'changed')
    expect(dependencySnapshot(dir).digest).not.toBe(before.digest)
    writeFileSync(path.join(dir, 'node_modules/.pnpm/lock.yaml'), 'original')
    rmSync(link)
    symlinkSync(second, link)
    expect(dependencySnapshot(dir).digest).not.toBe(before.digest)
    rmSync(link)
    expect(() => dependencySnapshot(dir)).toThrow()
  })
  it('recognizes the observed missing-container diagnostic without accepting connection failures', () => {
    expect(isMissingDockerObject('error: no such object: 51c3d96d')).toBe(true)
    expect(
      isMissingDockerObject(
        'Error response from daemon: No such container: owned',
      ),
    ).toBe(true)
    expect(isMissingDockerObject('connect: no such file or directory')).toBe(
      false,
    )
    expect(isMissingDockerObject('permission denied')).toBe(false)
  })
  it('permits local Unix endpoints and refuses remote or ambiguous Docker endpoints', () => {
    expect(() =>
      assertLocalDockerHost('unix:///var/run/docker.sock'),
    ).not.toThrow()
    for (const host of [
      'ssh://remote',
      'tcp://127.0.0.1:2375',
      'https://remote:2376',
      'unix://relative',
      'unix:///socket?context=other',
    ]) {
      expect(() => assertLocalDockerHost(host)).toThrow('local Unix socket')
    }
  })
  it('constructs its environment without inheriting credentials or a production database', () => {
    const env = labEnvironment(
      'BLOB_READ_WRITE_TOKEN=\n# SENTRY_SPOTLIGHT=\nRESEND_API_KEY=\n',
      '/browser',
      {
        HOME: '/home',
        PATH: '/bin',
        DATABASE_URI: 'postgres://production',
        BLOB_READ_WRITE_TOKEN: 'live',
        RESEND_API_KEY: 'live',
        NODE_OPTIONS: '--require unsafe',
        COREPACK_ENABLE_NETWORK: '1',
        COREPACK_ENABLE_AUTO_PIN: '1',
        npm_config_verify_deps_before_run: 'install',
        pnpm_config_verify_deps_before_run: 'install',
        pnpm_config_pm_on_fail: 'download',
      },
    )
    expect(env.DATABASE_URI).toBe(
      'postgres://postgres:postgres@127.0.0.1:55432/bp_journey',
    )
    expect(env.BLOB_READ_WRITE_TOKEN).toBe('')
    expect(env.SENTRY_SPOTLIGHT).toBe('')
    expect(env.RESEND_API_KEY).toBe('')
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.COREPACK_ENABLE_NETWORK).toBe('0')
    expect(env.COREPACK_ENABLE_AUTO_PIN).toBe('0')
    expect(env.npm_config_verify_deps_before_run).toBeUndefined()
    expect(env.pnpm_config_verify_deps_before_run).toBe('error')
    expect(env.pnpm_config_pm_on_fail).toBe('error')
    expect(env.CI).toBe('1')
    expect(env.NODE_ENV).toBe('production')
  })
  it('accepts its labeled database and refuses wrong identity, mounts or public binding', () => {
    const info = {
      Id: 'owned',
      Config: { Labels: { 'bp.reader-lab': 'token' } },
      HostConfig: {
        Binds: null,
        PortBindings: {
          '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }],
        },
      },
      Mounts: [],
      State: { Running: true },
    }
    expect(() => assertContainer(info, 'owned', 'token')).not.toThrow()
    expect(() => assertContainer(info, 'other', 'token')).toThrow('ownership')
    expect(() => assertContainer(info, 'owned', 'other')).toThrow('ownership')
    expect(() =>
      assertContainer({ ...info, State: { Running: false } }, 'owned', 'token'),
    ).toThrow('not running')
    expect(() =>
      assertContainer({ ...info, Mounts: [{}] }, 'owned', 'token'),
    ).toThrow('mounts')
    info.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0'
    expect(() => assertContainer(info, 'owned', 'token')).toThrow('binding')
  })
  it('keeps neighboring evidence and refuses cleanup of a substituted symlink', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bp-lab-test-'))
    temporary.push(dir)
    const owned = path.join(dir, 'owned')
    mkdirSync(owned)
    const stat = lstatSync(owned)
    const evidence = path.join(dir, 'proof.json')
    writeFileSync(evidence, 'proof')
    removeOwnedDirectory(owned, { dev: stat.dev, ino: stat.ino })
    expect(existsSync(owned)).toBe(false)
    expect(readFileSync(evidence, 'utf8')).toBe('proof')
    const foreign = path.join(dir, 'foreign')
    mkdirSync(foreign)
    symlinkSync(foreign, owned)
    expect(() =>
      removeOwnedDirectory(owned, { dev: stat.dev, ino: stat.ino }),
    ).toThrow('real directory')
    expect(existsSync(foreign)).toBe(true)
  })
})
