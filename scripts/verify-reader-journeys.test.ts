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
  renameSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
  preserveBuild,
  captureOwnedBuild,
  failureDetails,
  withOperationLock,
  readLoopback,
} from './verify-reader-journeys'

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

// NODE_USE_ENV_PROXY was added in Node 24.0 and backported to 22.21.
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
const supportsEnvProxy =
  nodeMajor >= 24 || (nodeMajor === 22 && nodeMinor >= 21)

describe('owned loopback transport', () => {
  it.runIf(supportsEnvProxy)(
    'ignores environment proxies in a fresh Node process and retains failure causes',
    async () => {
      const reservation = createServer()
      await new Promise<void>((resolve) =>
        reservation.listen(0, '127.0.0.1', resolve),
      )
      const address = reservation.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing local port')
      const deadProxy = `http://127.0.0.1:${address.port}`
      await new Promise<void>((resolve, reject) =>
        reservation.close((error) => (error ? reject(error) : resolve())),
      )
      const env = { ...process.env }
      for (const key of Object.keys(env))
        if (/proxy/i.test(key) || key === 'NODE_OPTIONS') delete env[key]
      const helper = pathToFileURL(
        path.resolve('scripts/verify-reader-journeys.ts'),
      ).href
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
      import assert from 'node:assert/strict';
      import { createServer } from 'node:http';
      import { readLoopback, failureDetails } from ${JSON.stringify(helper)};
      let mode = 'ok';
      let requests = 0;
      const server = createServer((req, res) => {
        requests++;
        if (mode === 'redirect') { res.writeHead(302, {Location: '/api/search'}); res.end(); }
        else if (mode === 'hang') { res.writeHead(200); res.write('incomplete'); }
        else { res.end(JSON.stringify({route: req.url})); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      try {
        let failure;
        try { await fetch('http://127.0.0.1:' + port, {signal: AbortSignal.timeout(1500)}); }
        catch (error) { failure = error; }
        assert(failure, 'global fetch must exercise the dead environment proxy');
        const details = failureDetails(failure);
        assert.equal(details.cause.code, 'ECONNREFUSED');
        assert.equal(requests, 0);
        for (const route of ['/articles', '/api/search'])
          assert.deepEqual(JSON.parse(await readLoopback(route, 1500, port)), {route});
        assert.equal(requests, 2);
        mode = 'redirect';
        await assert.rejects(readLoopback('/articles', 1500, port), /302/);
        assert.equal(requests, 3, 'redirect must not be followed');
        mode = 'hang';
        await assert.rejects(readLoopback('/articles', 50, port));
        console.log(JSON.stringify({loopback: 'passed', proxyFetchCause: details.cause.code, redirect: 'refused', incompleteBody: 'timed out'}));
      } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    `,
        ],
        {
          env: {
            ...env,
            HTTP_PROXY: deadProxy,
            HTTPS_PROXY: deadProxy,
            NODE_USE_ENV_PROXY: '1',
          },
          encoding: 'utf8',
          timeout: 10_000,
        },
      )
      expect(child.error).toBeUndefined()
      expect(child.status, child.stderr).toBe(0)
      expect(JSON.parse(child.stdout)).toEqual({
        loopback: 'passed',
        proxyFetchCause: 'ECONNREFUSED',
        redirect: 'refused',
        incompleteBody: 'timed out',
      })
    },
  )
  it('reaches loopback and reports connection refusal on every supported runtime', async () => {
    const server = createServer((_request, response) => response.end('owned'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing local port')
    try {
      expect(await readLoopback('/articles', 1500, address.port)).toBe('owned')
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
    await expect(
      readLoopback('/articles', 1500, address.port),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })
  it('records primitive cause fields without unrelated properties or stacks', () => {
    const cause = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
      unrelated: 'omit',
    })
    const error = new Error('fetch failed', { cause })
    expect(JSON.parse(JSON.stringify(failureDetails(error)))).toEqual({
      error: 'Error: fetch failed',
      cause: { code: 'UND_ERR_SOCKET', message: 'other side closed' },
    })
    expect(failureDetails('plain failure')).toEqual({
      error: 'plain failure',
      code: undefined,
      cause: undefined,
    })
  })
})

describe('operation ownership', () => {
  it('refuses overlapping operations and releases after success or failure', async () => {
    const run = mkdtempSync(path.join(os.tmpdir(), 'reader-operation-'))
    temporary.push(run)
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = withOperationLock(run, () => pending)
    try {
      await expect(
        withOperationLock(run, async () => {
          throw new Error('Concurrent operation entered')
        }),
      ).rejects.toMatchObject({ code: 'EEXIST' })
      expect(existsSync(path.join(run, 'operation.lock'))).toBe(true)
    } finally {
      release()
      await first
    }
    expect(existsSync(path.join(run, 'operation.lock'))).toBe(false)
    await expect(
      withOperationLock(run, async () => {
        throw new Error('controlled failure')
      }),
    ).rejects.toThrow('controlled failure')
    expect(existsSync(path.join(run, 'operation.lock'))).toBe(false)
    await expect(
      withOperationLock(run, async () => 'next operation'),
    ).resolves.toBe('next operation')
  })
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
  it('records a backup only after a successful move and preserves a refused destination', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bp-lab-backup-'))
    temporary.push(dir)
    const build = path.join(dir, 'build')
    const backup = path.join(dir, 'backup')
    mkdirSync(build)
    writeFileSync(path.join(build, 'BUILD_ID'), 'original')
    mkdirSync(backup)
    writeFileSync(path.join(backup, 'keep'), 'unrelated')
    expect(() => preserveBuild(build, backup)).toThrow('already exists')
    expect(readFileSync(path.join(build, 'BUILD_ID'), 'utf8')).toBe('original')
    expect(readFileSync(path.join(backup, 'keep'), 'utf8')).toBe('unrelated')
    const saved = preserveBuild(build, path.join(dir, 'saved'))
    expect(existsSync(build)).toBe(false)
    expect(lstatSync(path.join(dir, 'saved')).ino).toBe(saved.ino)
    renameSync(path.join(dir, 'saved'), build)
    expect(lstatSync(build).ino).toBe(saved.ino)
  })
  it('captures a failed child build replacement so owned cleanup can restore the backup', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bp-lab-build-'))
    temporary.push(dir)
    const build = path.join(dir, '.next')
    const backup = path.join(dir, 'original.next')
    mkdirSync(build)
    writeFileSync(path.join(build, 'BUILD_ID'), 'original')
    const original = preserveBuild(build, backup)
    mkdirSync(build)
    let owned = { dev: lstatSync(build).dev, ino: lstatSync(build).ino }
    const before = owned
    const exit = await captureOwnedBuild(
      build,
      owned,
      async () => {
        const child = spawnSync(process.execPath, [
          '-e',
          `
          const fs = require('node:fs');
          const p = process.argv[1];
          fs.renameSync(p, p + '.old');
          fs.mkdirSync(p);
          fs.writeFileSync(p + '/partial', 'failed output');
          process.exit(7);
        `,
          build,
        ])
        return child.status!
      },
      () => expect(lstatSync(backup).ino).toBe(original.ino),
      (current) => {
        owned = current!
      },
    )
    expect(exit).toBe(7)
    expect(owned.ino).not.toBe(before.ino)
    removeOwnedDirectory(build, owned)
    renameSync(backup, build)
    expect(lstatSync(build).ino).toBe(original.ino)
    expect(readFileSync(path.join(build, 'BUILD_ID'), 'utf8')).toBe('original')
  })
  it('records absent build output but refuses symlinks or an invalidated owner', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bp-lab-build-refusal-'))
    temporary.push(dir)
    const build = path.join(dir, '.next')
    mkdirSync(build)
    const expected = () => ({
      dev: lstatSync(build).dev,
      ino: lstatSync(build).ino,
    })
    let recorded = false
    await captureOwnedBuild(
      build,
      expected(),
      async () => {
        rmSync(build, { recursive: true })
        return 7
      },
      () => {},
      (current) => {
        expect(current).toBeUndefined()
        recorded = true
      },
    )
    expect(recorded).toBe(true)
    mkdirSync(build)
    recorded = false
    await expect(
      captureOwnedBuild(
        build,
        expected(),
        async () => {
          rmSync(build, { recursive: true })
          symlinkSync(path.join(dir, 'absent'), build)
          return 7
        },
        () => {},
        () => {
          recorded = true
        },
      ),
    ).rejects.toThrow('Not a real directory')
    expect(recorded).toBe(false)
    rmSync(build)
    mkdirSync(build)
    let ownerValid = true
    await expect(
      captureOwnedBuild(
        build,
        expected(),
        async () => {
          ownerValid = false
          return 7
        },
        () => {
          if (!ownerValid) throw new Error('owner changed')
        },
        () => {
          recorded = true
        },
      ),
    ).rejects.toThrow('owner changed')
    expect(recorded).toBe(false)
  })
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
        Tmpfs: { '/var/lib/postgresql/data': '' },
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
    const invalidTmpfs: (Record<string, string> | undefined)[] = [
      undefined,
      {},
      { '/elsewhere': '' },
      { ...info.HostConfig.Tmpfs, '/extra': '' },
    ]
    for (const Tmpfs of invalidTmpfs)
      expect(() =>
        assertContainer(
          { ...info, HostConfig: { ...info.HostConfig, Tmpfs } },
          'owned',
          'token',
        ),
      ).toThrow('mounts')
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
