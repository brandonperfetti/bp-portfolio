// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import {
  EXIT,
  PROBE_PREFIX,
  RefusalError,
  createEvidence,
  createMcpWriter,
  createRestWriter,
  credentialNames,
  diffPaths,
  exitCodeFor,
  parseArgs,
  parseMcpBody,
  probeSlugs,
  readCredentials,
  resolvePlan,
  runProbe,
  scrubEvidence,
  sitemapPaths,
} from './freshness-probe.mjs'

const SECRET_PASSWORD = 'pw-do-not-leak-1234'
const SECRET_KEY = 'mcp-key-do-not-leak-5678'
const SECRET_JWT = 'jwt-do-not-leak-9012'

const dirs: string[] = []
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'freshness-probe-test-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const plan = (argv: string[]) => resolvePlan(parseArgs(argv))

describe('resolvePlan: where a run may write', () => {
  const base = ['--write-path', 'rest', '--evidence', '/tmp/x']

  it('defaults to local, page only', () => {
    const p = plan(base)
    expect(p.target).toBe('local')
    expect(p.base).toBe('http://localhost:6002')
    expect(p.kinds).toEqual(['page'])
    expect(p.sendBypass).toBe(false)
  })

  it('probes an article only with --article', () => {
    expect(plan([...base, '--article']).kinds).toEqual(['page', 'post'])
  })

  it('refuses staging without its flag, and accepts it with', () => {
    expect(() => plan([...base, '--target', 'staging'])).toThrow(
      /--allow-staging-writes/,
    )
    const p = plan([...base, '--target', 'staging', '--allow-staging-writes'])
    expect(p.base).toBe('https://staging.brandonperfetti.com')
    expect(p.envSuffix).toBe('STAGING')
  })

  it('refuses production without its flag, and pins its host', () => {
    expect(() => plan([...base, '--target', 'production'])).toThrow(
      /--allow-production-writes/,
    )
    expect(() =>
      plan([
        ...base,
        '--target',
        'production',
        '--allow-production-writes',
        '--base-url',
        'https://x.vercel.app',
      ]),
    ).toThrow(/writes only to https:\/\/brandonperfetti.com/)
    expect(
      plan([...base, '--target', 'production', '--allow-production-writes'])
        .base,
    ).toBe('https://brandonperfetti.com')
  })

  it('never reaches a production host through local or staging', () => {
    for (const url of [
      'https://brandonperfetti.com',
      'https://www.brandonperfetti.com',
    ]) {
      expect(() => plan([...base, '--base-url', url])).toThrow(RefusalError)
      expect(() =>
        plan([
          ...base,
          '--target',
          'staging',
          '--allow-staging-writes',
          '--base-url',
          url,
        ]),
      ).toThrow(RefusalError)
    }
  })

  it('keeps local on loopback', () => {
    expect(() =>
      plan([...base, '--base-url', 'https://staging.brandonperfetti.com']),
    ).toThrow(/loopback/)
    expect(plan([...base, '--base-url', 'http://127.0.0.1:6011']).base).toBe(
      'http://127.0.0.1:6011',
    )
  })

  it('requires a write path and an evidence directory', () => {
    expect(() => plan(['--evidence', '/tmp/x'])).toThrow(/--write-path/)
    expect(() => plan(['--write-path', 'mcp'])).toThrow(/--evidence/)
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/)
  })
})

describe('readCredentials', () => {
  it('reads only the per-target script names, env first then .env.local', () => {
    const p = plan([
      '--write-path',
      'rest',
      '--evidence',
      '/x',
      '--target',
      'staging',
      '--allow-staging-writes',
    ])
    expect(credentialNames(p)).toEqual({
      email: 'CMS_PROBE_EMAIL_STAGING',
      password: 'CMS_PROBE_PASSWORD_STAGING',
    })
    const creds = readCredentials(
      p,
      { CMS_PROBE_EMAIL_STAGING: 'a@b.test' },
      'CMS_PROBE_PASSWORD_STAGING="from-file"\nVERCEL_AUTOMATION_BYPASS_SECRET=byp\n',
    )
    expect(creds).toEqual({
      email: 'a@b.test',
      password: 'from-file',
      bypass: 'byp',
    })
  })

  it('never falls back to the bare app variable', () => {
    const p = plan(['--write-path', 'mcp', '--evidence', '/x'])
    expect(() =>
      readCredentials(p, { PAYLOAD_MCP_API_KEY: 'bare' }, null),
    ).toThrow(/CMS_PROBE_MCP_API_KEY_LOCAL/)
  })

  it('requires the bypass secret on a *.vercel.app host, and never sends one locally', () => {
    const remote = plan([
      '--write-path',
      'mcp',
      '--evidence',
      '/x',
      '--target',
      'staging',
      '--allow-staging-writes',
      '--base-url',
      'https://bp-git-x.vercel.app',
    ])
    expect(() =>
      readCredentials(remote, { CMS_PROBE_MCP_API_KEY_STAGING: 'k' }, null),
    ).toThrow(/VERCEL_AUTOMATION_BYPASS_SECRET/)
    const local = plan(['--write-path', 'mcp', '--evidence', '/x'])
    expect(
      readCredentials(
        local,
        {
          CMS_PROBE_MCP_API_KEY_LOCAL: 'k',
          VERCEL_AUTOMATION_BYPASS_SECRET: 'b',
        },
        null,
      ).bypass,
    ).toBe('')
  })
})

describe('parsers', () => {
  it('reads <loc> pathnames and diffs them as multisets', () => {
    const xml =
      '<urlset><url><loc>https://site.test/b</loc></url><url><loc>https://site.test/a</loc></url></urlset>'
    expect(sitemapPaths(xml)).toEqual(['/a', '/b'])
    expect(diffPaths(['/a', '/b'], ['/a', '/b']).identical).toBe(true)
    expect(diffPaths(['/a'], ['/a', '/c'])).toMatchObject({
      added: ['/c'],
      removed: [],
      identical: false,
    })
  })

  it('finds the JSON-RPC reply in an SSE body', () => {
    const body =
      'event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"content":[]}}\n\n'
    expect(parseMcpBody(body, 3).result).toEqual({ content: [] })
    expect(() => parseMcpBody(body, 4)).toThrow()
  })

  it('names probes with the prefix, the kind and a minute stamp', () => {
    const s = probeSlugs(new Date('2026-11-25T21:07:59Z'), 'ab12')
    expect(s.page).toBe(`${PROBE_PREFIX}page-202611252107-ab12`)
    expect(s.post).toBe(`${PROBE_PREFIX}post-202611252107-ab12`)
  })
})

type Doc = {
  id: number
  kind: 'page' | 'post'
  slug: string
  status: 'draft' | 'published'
}

/**
 * A fake deployment: Payload REST + MCP over an in-memory store, a sitemap,
 * and a cache of probe pages. `brokenPurge` is #274's defect: writes land in
 * the store but the sitemap and the page cache never see them.
 */
function fakeSite({
  brokenPurge = false,
  failPublish = false,
  leftovers = [] as Doc[],
} = {}) {
  const docs = new Map<number, Doc>()
  for (const d of leftovers) docs.set(d.id, d)
  let nextId = 100
  const visible = new Map<string, boolean>() // what readers see
  const calls: string[] = []
  const requestBodies: string[] = []
  const seen = () => {
    if (brokenPurge) return
    visible.clear()
    for (const d of docs.values()) {
      visible.set(
        d.kind === 'page' ? `/${d.slug}` : `/articles/${d.slug}`,
        d.status === 'published',
      )
    }
  }
  const json = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  const kindOf = (c: string) =>
    (c === 'pages' ? 'page' : 'post') as 'page' | 'post'
  const probeDocs = (kind: 'page' | 'post') =>
    [...docs.values()].filter(
      (d) => d.kind === kind && d.slug.includes(PROBE_PREFIX),
    )

  const fetchImpl = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    calls.push(`${method} ${url.pathname}`)
    if (typeof init.body === 'string') requestBodies.push(init.body)
    const auth = new Headers(init.headers).get('authorization') ?? ''
    const path = url.pathname

    if (path === '/sitemap.xml') {
      const locs = [
        '/',
        '/about',
        ...[...visible].filter(([, v]) => v).map(([p]) => p),
      ]
      return new Response(
        `<urlset>${locs.map((l) => `<url><loc>https://site.test${l}</loc></url>`).join('')}</urlset>`,
        {
          status: 200,
          headers: {
            'x-vercel-cache': 'MISS',
            age: '0',
            'set-cookie': `session=${SECRET_JWT}`,
          },
        },
      )
    }
    if (path === '/llms.txt') return new Response('# llms', { status: 200 })
    if (path === '/api/redirects') return json(200, { docs: [] })
    if (path === '/api/users/login') {
      const body = JSON.parse(String(init.body))
      return body.password === SECRET_PASSWORD
        ? json(
            200,
            { token: SECRET_JWT },
            { 'set-cookie': `payload-token=${SECRET_JWT}` },
          )
        : json(401, { errors: [] })
    }
    if (path === '/api/users/logout') return json(200, {})
    const rest = path.match(/^\/api\/(pages|posts)(?:\/(\d+))?$/)
    if (rest) {
      if (auth !== `JWT ${SECRET_JWT}`) return json(403, {})
      const kind = kindOf(rest[1])
      const id = rest[2] ? Number(rest[2]) : null
      if (method === 'GET' && id === null)
        return json(200, { docs: probeDocs(kind) })
      if (method === 'POST') {
        const body = JSON.parse(String(init.body))
        const doc: Doc = {
          id: (nextId += 1),
          kind,
          slug: body.slug,
          status: 'draft',
        }
        docs.set(doc.id, doc)
        return json(201, { doc: { id: doc.id } })
      }
      const doc = id === null ? undefined : docs.get(id)
      if (!doc || doc.kind !== kind) return json(404, {})
      if (method === 'GET') return json(200, doc)
      if (method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        if (failPublish && body._status === 'published') return json(500, {})
        doc.status = body._status
        seen()
        return json(200, { doc })
      }
      if (method === 'DELETE') {
        docs.delete(doc.id)
        seen()
        return json(200, {})
      }
    }
    if (path === '/api/mcp') {
      if (auth !== `Bearer ${SECRET_KEY}`) return json(401, {})
      const msg = JSON.parse(String(init.body))
      const { name, arguments: args } = msg.params
      const kind = name.endsWith('Pages') ? 'page' : 'post'
      const reply = (text: string) =>
        new Response(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }] } })}\n\n`,
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        )
      const fence = (d: unknown) => `\n\`\`\`json\n${JSON.stringify(d)}\n\`\`\``
      if (name.startsWith('create')) {
        const doc: Doc = {
          id: (nextId += 1),
          kind,
          slug: args.slug,
          status: 'draft',
        }
        docs.set(doc.id, doc)
        return reply(`Resource created successfully!${fence(doc)}`)
      }
      if (name.startsWith('find') && args.id === undefined) {
        const found = probeDocs(kind)
        return reply(
          `Collection: "x"\nTotal: ${found.length} documents\nPage: 1 of 1\n${found.map(fence).join('')}`,
        )
      }
      const doc = docs.get(Number(args.id))
      if (!doc)
        return reply(
          `Error: Document with ID "${args.id}" not found in collection "x"`,
        )
      if (name.startsWith('find'))
        return reply(`Resource from collection "x":\n${JSON.stringify(doc)}`)
      if (name.startsWith('update')) {
        if (failPublish && args._status === 'published')
          return reply('Error updating resource: boom')
        doc.status = args._status
        seen()
        return reply(`Document updated successfully${fence(doc)}`)
      }
      if (name.startsWith('delete')) {
        docs.delete(doc.id)
        seen()
        return reply('Document deleted successfully')
      }
    }
    const status = visible.get(path) ? 200 : 404
    return new Response(status === 200 ? '<html>probe</html>' : 'not found', {
      status,
      headers: { 'x-vercel-cache': status === 200 ? 'HIT' : 'MISS', age: '5' },
    })
  }
  return { fetch: fetchImpl as typeof fetch, docs, calls, requestBodies }
}

async function run(
  writePath: 'rest' | 'mcp',
  site: ReturnType<typeof fakeSite>,
  extra: string[] = [],
) {
  const dir = join(tempDir(), 'evidence')
  const p = plan([
    '--write-path',
    writePath,
    '--evidence',
    dir,
    '--interval-seconds',
    '1',
    '--timeout-seconds',
    '3',
    ...extra,
  ])
  const evidence = createEvidence(dir)
  const common = { base: p.base, fetch: site.fetch, extraHeaders: {} }
  const writer =
    writePath === 'rest'
      ? await createRestWriter({
          ...common,
          email: 'probe@example.test',
          password: SECRET_PASSWORD,
        })
      : await createMcpWriter({ ...common, apiKey: SECRET_KEY })
  let clock = Date.parse('2026-11-25T21:00:00Z')
  const lines: string[] = []
  const result = await runProbe({
    plan: p,
    writer,
    fetch: site.fetch,
    evidence,
    readHeaders: {},
    log: (l) => lines.push(l),
    now: () => new Date(clock),
    wait: async (ms) => {
      clock += ms
    },
    slugTail: 'test',
  })
  await writer.close()
  return { result, dir, lines }
}

const allFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? allFiles(join(dir, e.name))
      : [readFileSync(join(dir, e.name), 'utf8')],
  )

describe('runProbe', () => {
  it.each(['rest', 'mcp'] as const)(
    'passes on a healthy site through %s, and leaves nothing',
    async (writePath) => {
      const site = fakeSite()
      const { result, dir } = await run(writePath, site, ['--article'])
      expect(result).toMatchObject({
        inclusion: 'PASS',
        removal: 'PASS',
        cleanup: 'PASS',
      })
      expect(exitCodeFor(result)).toBe(EXIT.pass)
      expect(site.docs.size).toBe(0)
      const tsv = readFileSync(join(dir, 'reads.tsv'), 'utf8')
      expect(tsv).toMatch(/inclusion\tsitemap\t.*\tpage,post\n/)
      expect(readFileSync(join(dir, 'locs-final.txt'), 'utf8')).toBe(
        readFileSync(join(dir, 'locs-baseline.txt'), 'utf8'),
      )
    },
  )

  it('reports FAIL where purges are lost (#274) and still removes every probe', async () => {
    const site = fakeSite({ brokenPurge: true })
    const { result } = await run('mcp', site, ['--article'])
    expect(result.inclusion).toBe('FAIL')
    expect(result.cleanup).toBe('PASS')
    expect(exitCodeFor(result)).toBe(EXIT.fail)
    expect(site.docs.size).toBe(0)
  })

  it('cleans up the draft when a write fails mid-run', async () => {
    const site = fakeSite({ failPublish: true })
    const { result, lines } = await run('rest', site)
    expect(result.error).toMatch(/published page: HTTP 500/)
    expect(result.cleanup).toBe('PASS')
    expect(exitCodeFor(result)).toBe(EXIT.fail)
    expect(site.docs.size).toBe(0)
    expect(lines.some((l) => /cleanup +page \d+ gone/.test(l))).toBe(true)
  })

  it('refuses to start, writing nothing, while probe leftovers exist', async () => {
    const leftover = {
      id: 7,
      kind: 'page' as const,
      slug: `${PROBE_PREFIX}page-old`,
      status: 'draft' as const,
    }
    const site = fakeSite({ leftovers: [leftover] })
    await expect(run('mcp', site)).rejects.toThrow(/leftovers exist.*page 7/)
    expect(
      site.calls.some((c) =>
        /^(POST|PATCH|DELETE) \/api\/(pages|posts)/.test(c),
      ),
    ).toBe(false)
    expect(site.docs.get(7)).toEqual(leftover)
  })

  it('writes no credential or token into the evidence', async () => {
    for (const writePath of ['rest', 'mcp'] as const) {
      const { dir } = await run(writePath, fakeSite(), ['--article'])
      for (const text of allFiles(dir)) {
        for (const secret of [SECRET_PASSWORD, SECRET_KEY, SECRET_JWT])
          expect(text).not.toContain(secret)
      }
    }
  })

  it('publishes no article without --article', async () => {
    const site = fakeSite()
    await run('rest', site)
    const created = site.requestBodies
      .filter((b) => b.includes(PROBE_PREFIX))
      .map((b) => JSON.parse(b).slug)
    expect(created).toEqual([`${PROBE_PREFIX}page-202611252100-test`])
    expect(site.calls).not.toContain('POST /api/posts')
  })
})

describe('exitCodeFor', () => {
  it('keeps 3 for a failed cleanup, and a stop before any write a plain FAIL', () => {
    expect(
      exitCodeFor({ inclusion: 'PASS', removal: 'PASS', cleanup: 'FAIL' }),
    ).toBe(EXIT.cleanupIncomplete)
    expect(
      exitCodeFor({
        inclusion: 'NOT RUN',
        removal: 'NOT RUN',
        cleanup: 'NOT NEEDED',
      }),
    ).toBe(EXIT.fail)
    expect(
      exitCodeFor({ inclusion: 'PASS', removal: 'FAIL', cleanup: 'PASS' }),
    ).toBe(EXIT.fail)
  })
})

describe('scrubEvidence', () => {
  it('replaces any file that contains a credential', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'a.txt'), `token ${SECRET_KEY}`)
    writeFileSync(join(dir, 'b.txt'), 'clean')
    expect(scrubEvidence(dir, [SECRET_KEY, ''])).toEqual([join(dir, 'a.txt')])
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).not.toContain(SECRET_KEY)
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('clean')
  })
})

describe('the CLI', () => {
  const script = fileURLToPath(
    new URL('../freshness-probe.mjs', import.meta.url),
  )

  it('refuses production without its flag before creating anything', () => {
    const evidence = join(tempDir(), 'never-made')
    const r = spawnSync(
      process.execPath,
      [
        script,
        '--write-path',
        'rest',
        '--target',
        'production',
        '--evidence',
        evidence,
      ],
      {
        encoding: 'utf8',
        env: { NODE_ENV: 'test', PATH: process.env.PATH },
      },
    )
    expect(r.status).toBe(EXIT.refused)
    expect(r.stderr).toMatch(/--allow-production-writes/)
    expect(existsSync(evidence)).toBe(false)
  })
})
