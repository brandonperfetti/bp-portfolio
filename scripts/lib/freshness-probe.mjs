import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

/**
 * The slug prefix every probe document carries (#294).
 *
 * @remarks Unmistakable on purpose: the cleanup check refuses a run while any
 * page, post or redirect matches it, and the slug says what it is to anyone
 * who finds one in the admin.
 */
export const PROBE_PREFIX = 'zz-freshness-probe-'

/** Exit codes. 2 and 3 are distinct so a caller can tell "nothing written" from "something may be left". */
export const EXIT = Object.freeze({
  pass: 0,
  fail: 1,
  refused: 2,
  cleanupIncomplete: 3,
})

/** Hosts that are production. Only the `production` target may write to them. */
export const PRODUCTION_HOSTS = Object.freeze([
  'brandonperfetti.com',
  'www.brandonperfetti.com',
])

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * The three targets, each with its default base URL, the flag that unlocks a
 * write to it, and the suffix of its script-only credential names.
 *
 * @remarks Local is the default and needs no flag. Staging is a shared
 * environment, so it needs `--allow-staging-writes`; production needs
 * `--allow-production-writes` and is pinned to its custom domain, which also
 * keeps the Vercel bypass header out of production requests
 * (`docs/CONTENT_WORKFLOW.md` §0).
 */
export const TARGETS = Object.freeze({
  local: Object.freeze({
    defaultBaseUrl: 'http://localhost:6002',
    flag: null,
    envSuffix: 'LOCAL',
  }),
  staging: Object.freeze({
    defaultBaseUrl: 'https://staging.brandonperfetti.com',
    flag: '--allow-staging-writes',
    envSuffix: 'STAGING',
  }),
  production: Object.freeze({
    defaultBaseUrl: 'https://brandonperfetti.com',
    flag: '--allow-production-writes',
    envSuffix: 'PRODUCTION',
  }),
})

/** The Vercel automation-bypass variable and header (`docs/CONTENT_WORKFLOW.md` §0). */
export const BYPASS_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET'
export const BYPASS_HEADER = 'x-vercel-protection-bypass'

/** Response headers each read records. Anything else (notably `set-cookie`) is never written. */
export const RECORDED_HEADERS = Object.freeze([
  'cache-control',
  'age',
  'x-vercel-cache',
  'x-vercel-id',
  'x-nextjs-cache',
  'x-nextjs-prerender',
  'content-type',
  'date',
])

/** A refusal before any write: bad arguments, a missing credential, leftovers. */
export class RefusalError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'RefusalError'
  }
}

export const USAGE = `Usage: pnpm probe:freshness --write-path rest|mcp --evidence <new dir> [options]

Publishes a throwaway page (and, with --article, an article), checks that
/sitemap.xml and the page itself pick up the publish and the unpublish, then
deletes the probes and checks nothing is left. Exit 0 PASS, 1 FAIL,
2 refused (nothing written), 3 cleanup incomplete (probes may remain).

Options:
  --write-path rest|mcp        Payload REST API (what /admin calls) or POST /api/mcp. Required.
  --evidence <dir>             New or empty directory for reads.tsv, raw headers and bodies. Required.
  --target local|staging|production   Default local.
  --base-url <url>             local: a loopback URL (default http://localhost:6002).
                               staging: another non-production https host (e.g. a preview).
                               production: only https://brandonperfetti.com.
  --allow-staging-writes       Required for --target staging.
  --allow-production-writes    Required for --target production.
  --article                    Also probe an article. Off by default: a live
                               article shows in the public /feed.xml.
  --interval-seconds <n>       Seconds between polls. Default 30.
  --timeout-seconds <n>        How long each poll waits for its condition. Default 300.

Credentials are script-only, per target (process env, else .env.local):
  rest: CMS_PROBE_EMAIL_<T>, CMS_PROBE_PASSWORD_<T>
  mcp:  CMS_PROBE_MCP_API_KEY_<T>
  where <T> is LOCAL, STAGING or PRODUCTION. Remote targets also send
  ${BYPASS_ENV} as ${BYPASS_HEADER} when it is set (required on *.vercel.app).`

/**
 * Parses the command line. Pure: it never reads the environment.
 *
 * @param {string[]} argv - Arguments after the script name.
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {}
  const valued = new Set([
    '--write-path',
    '--evidence',
    '--target',
    '--base-url',
    '--interval-seconds',
    '--timeout-seconds',
  ])
  const flags = new Set([
    '--allow-staging-writes',
    '--allow-production-writes',
    '--article',
    '--help',
    '-h',
  ])
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const name = eq > 0 ? raw.slice(0, eq) : raw
    if (flags.has(name) && eq < 0) {
      out[name === '-h' ? '--help' : name] = true
    } else if (valued.has(name)) {
      const value = eq > 0 ? raw.slice(eq + 1) : argv[(i += 1)]
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new RefusalError(`${name} needs a value`)
      }
      out[name] = value
    } else {
      throw new RefusalError(`Unknown argument: ${raw}`)
    }
  }
  const seconds = (
    /** @type {string} */ key,
    /** @type {number} */ fallback,
  ) => {
    if (out[key] === undefined) return fallback
    const n = Number(out[key])
    if (!Number.isFinite(n) || n <= 0 || n > 3600) {
      throw new RefusalError(`${key} must be a number of seconds, 1–3600`)
    }
    return n
  }
  return {
    help: out['--help'] === true,
    writePath: /** @type {string | undefined} */ (out['--write-path']),
    evidenceDir: /** @type {string | undefined} */ (out['--evidence']),
    target: /** @type {string} */ (out['--target'] ?? 'local'),
    baseUrl: /** @type {string | undefined} */ (out['--base-url']),
    allowStagingWrites: out['--allow-staging-writes'] === true,
    allowProductionWrites: out['--allow-production-writes'] === true,
    article: out['--article'] === true,
    intervalMs: seconds('--interval-seconds', 30) * 1000,
    timeoutMs: seconds('--timeout-seconds', 300) * 1000,
  }
}

/**
 * Turns parsed arguments into a run plan, refusing anything that could write
 * where the caller did not say to.
 *
 * @remarks Every refusal happens here, before a credential is read or a
 * request is sent. A production host is refused for every target but
 * `production`, so a mistyped `--base-url` cannot reach it through `local` or
 * `staging`.
 *
 * @param {ReturnType<typeof parseArgs>} args
 */
export function resolvePlan(args) {
  if (args.writePath !== 'rest' && args.writePath !== 'mcp') {
    throw new RefusalError('--write-path must be rest or mcp')
  }
  if (!args.evidenceDir) throw new RefusalError('--evidence <dir> is required')
  const target = TARGETS[/** @type {keyof typeof TARGETS} */ (args.target)]
  if (!target) {
    throw new RefusalError('--target must be local, staging or production')
  }
  if (args.target === 'staging' && !args.allowStagingWrites) {
    throw new RefusalError(
      'Staging is shared: pass --allow-staging-writes to write to it.',
    )
  }
  if (args.target === 'production' && !args.allowProductionWrites) {
    throw new RefusalError(
      'Production needs --allow-production-writes. Nothing was written.',
    )
  }
  let base
  try {
    base = new URL(args.baseUrl ?? target.defaultBaseUrl)
  } catch {
    throw new RefusalError(`--base-url is not a URL: ${args.baseUrl}`)
  }
  if (base.pathname !== '/' || base.search || base.hash || base.username) {
    throw new RefusalError(
      '--base-url must be an origin, with no path or query',
    )
  }
  const host = base.hostname.toLowerCase()
  const isProductionHost = PRODUCTION_HOSTS.includes(host)
  if (args.target === 'local') {
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new RefusalError(
        `--target local needs a loopback URL, not ${base.origin}`,
      )
    }
  } else if (args.target === 'staging') {
    if (
      base.protocol !== 'https:' ||
      isProductionHost ||
      LOOPBACK_HOSTS.has(host)
    ) {
      throw new RefusalError(
        `--target staging needs a non-production https host, not ${base.origin}`,
      )
    }
  } else if (base.origin !== target.defaultBaseUrl) {
    throw new RefusalError(
      `--target production writes only to ${target.defaultBaseUrl}`,
    )
  }
  return {
    target: /** @type {keyof typeof TARGETS} */ (args.target),
    envSuffix: target.envSuffix,
    base: base.origin,
    writePath: /** @type {'rest' | 'mcp'} */ (args.writePath),
    kinds: /** @type {Array<'page' | 'post'>} */ (
      args.article ? ['page', 'post'] : ['page']
    ),
    evidenceDir: args.evidenceDir,
    intervalMs: args.intervalMs,
    timeoutMs: args.timeoutMs,
    sendBypass: args.target !== 'local',
    bypassRequired: host.endsWith('.vercel.app'),
  }
}

/**
 * The credential variable names a plan reads. Never a bare app variable
 * (`PAYLOAD_MCP_API_KEY`, `CMS_REVALIDATE_SECRET`): those are the local dev
 * server's, and a script that fell back to them could aim one environment's
 * key at another.
 *
 * @param {{ writePath: 'rest' | 'mcp', envSuffix: string }} plan
 */
export function credentialNames(plan) {
  return plan.writePath === 'rest'
    ? {
        email: `CMS_PROBE_EMAIL_${plan.envSuffix}`,
        password: `CMS_PROBE_PASSWORD_${plan.envSuffix}`,
      }
    : { apiKey: `CMS_PROBE_MCP_API_KEY_${plan.envSuffix}` }
}

/**
 * Reads the plan's credentials from `env`, then from the `.env.local` text,
 * without copying anything into `process.env`.
 *
 * @param {ReturnType<typeof resolvePlan>} plan
 * @param {Record<string, string | undefined>} env
 * @param {string | null} envLocalText - `.env.local`'s contents, or null.
 */
export function readCredentials(plan, env, envLocalText) {
  const file = envLocalText ? parseEnv(envLocalText) : {}
  const pick = (/** @type {string} */ name) => {
    const value = env[name] || file[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
  }
  const names = credentialNames(plan)
  /** @type {Record<string, string>} */
  const values = {}
  const missing = []
  for (const [key, name] of Object.entries(names)) {
    values[key] = pick(name)
    if (!values[key]) missing.push(name)
  }
  if (missing.length) {
    throw new RefusalError(
      `Missing credential: ${missing.join(', ')} (set in .env.local)`,
    )
  }
  const bypass = plan.sendBypass ? pick(BYPASS_ENV) : ''
  if (plan.bypassRequired && !bypass) {
    throw new RefusalError(`${BYPASS_ENV} is required for a *.vercel.app host`)
  }
  return { ...values, bypass }
}

/**
 * The run's probe slugs: `zz-freshness-probe-<kind>-<YYYYMMDDHHMM>`, the shape
 * #294 names, plus a short random tail so two runs in one minute never collide.
 *
 * @param {Date} now
 * @param {string} [tail]
 */
export function probeSlugs(now, tail = randomBytes(2).toString('hex')) {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12)
  return {
    page: `${PROBE_PREFIX}page-${stamp}-${tail}`,
    post: `${PROBE_PREFIX}post-${stamp}-${tail}`,
  }
}

/**
 * The public path of a probe: a page sits at `/<slug>`, an unplaced article
 * at `/articles/<slug>` (`publicPathFor`, `src/fields/slug/slugPaths.ts`).
 *
 * @param {'page' | 'post'} kind
 * @param {string} slug
 */
export const probePath = (kind, slug) =>
  kind === 'page' ? `/${slug}` : `/articles/${slug}`

/**
 * The pathnames of a sitemap's `<loc>` entries, sorted.
 *
 * @remarks Pathnames, not URLs: the sitemap's origin is the configured site
 * URL, which on a local build need not match the base URL probed.
 *
 * @param {string} xml
 */
export function sitemapPaths(xml) {
  const paths = []
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      paths.push(new URL(match[1]).pathname)
    } catch {
      paths.push(match[1])
    }
  }
  return paths.sort()
}

/**
 * Compares two `<loc>` path lists as multisets.
 *
 * @param {string[]} before
 * @param {string[]} after
 */
export function diffPaths(before, after) {
  const count = (/** @type {string[]} */ list) => {
    const m = new Map()
    for (const p of list) m.set(p, (m.get(p) ?? 0) + 1)
    return m
  }
  const a = count(before)
  const b = count(after)
  const added = []
  const removed = []
  for (const [p, n] of b)
    for (let i = a.get(p) ?? 0; i < n; i += 1) added.push(p)
  for (const [p, n] of a)
    for (let i = b.get(p) ?? 0; i < n; i += 1) removed.push(p)
  return {
    added,
    removed,
    identical: added.length === 0 && removed.length === 0,
  }
}

/**
 * The JSON-RPC message with `id` from an MCP response body, which is either
 * plain JSON or an SSE stream of `data:` lines.
 *
 * @param {string} body
 * @param {number} id
 */
export function parseMcpBody(body, id) {
  const candidates = []
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('['))
    candidates.push(trimmed)
  for (const m of body.matchAll(/^data: ?(.*)$/gm)) candidates.push(m[1])
  for (const text of candidates) {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }
    for (const msg of Array.isArray(parsed) ? parsed : [parsed]) {
      if (msg && msg.id === id) return msg
    }
  }
  throw new Error('MCP response carried no JSON-RPC reply')
}

/**
 * The fenced JSON documents in a plugin-mcp tool's text reply.
 *
 * @param {string} text
 */
export const mcpDocs = (text) =>
  [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]))

/** @param {string} text */
const isMcpError = (text) => /^(Error|❌)/.test(text.trim())

/** A minimal one-paragraph Lexical value, as `scripts/seed-e2e.ts` builds. */
const lexicalParagraph = (/** @type {string} */ text) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          {
            type: 'text',
            text,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
})

/**
 * The draft document a probe is created as.
 *
 * @remarks No `meta.robots`/`noindex`: a noindex entry would never join the
 * sitemap and the run would test nothing. `slugLock` keeps the slug from being
 * regenerated from the title on a later write.
 *
 * @param {'page' | 'post'} kind
 * @param {string} slug
 * @param {Date} now
 */
export function probeDocument(kind, slug, now) {
  const text = `Temporary freshness probe (#294), deleted by the script that made it.`
  const common = {
    title: `Freshness probe ${slug}`,
    slug,
    slugLock: true,
    _status: 'draft',
  }
  if (kind === 'page') {
    return {
      ...common,
      hero: { type: 'blank' },
      layout: [{ blockType: 'prose', content: lexicalParagraph(text) }],
    }
  }
  return {
    ...common,
    excerpt: text,
    content: lexicalParagraph(text),
    // In the past, so the future-publication gate never hides it.
    publishedAt: new Date(now.getTime() - 60_000).toISOString(),
    access: { visibility: 'public' },
  }
}

const COLLECTION = /** @type {const} */ ({ page: 'pages', post: 'posts' })

/**
 * @typedef {object} Writer
 * @property {(kind: 'page' | 'post', data: object) => Promise<number | string>} create
 * @property {(kind: 'page' | 'post', id: number | string, status: 'published' | 'draft') => Promise<void>} setStatus
 * @property {(kind: 'page' | 'post', id: number | string) => Promise<void>} remove
 * @property {(kind: 'page' | 'post', id: number | string) => Promise<boolean>} exists
 * @property {(kind: 'page' | 'post') => Promise<Array<{ id: number | string, slug: string }>>} findProbes
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {object} WriterOptions
 * @property {string} base
 * @property {typeof fetch} fetch
 * @property {Record<string, string>} extraHeaders
 * @property {number} [requestTimeoutMs]
 */

/** @param {number} ms */
const timeoutSignal = (ms) => AbortSignal.timeout(ms)

/**
 * Writes through the Payload REST API, as `/admin` does, signed in as a user.
 *
 * @remarks The login response carries the JWT, so neither it nor any write
 * response body is recorded; callers see ids and statuses only. The session
 * is logged out in `close`.
 *
 * @param {WriterOptions & { email: string, password: string }} options
 * @returns {Promise<Writer>}
 */
export async function createRestWriter({
  base,
  fetch,
  extraHeaders,
  email,
  password,
  requestTimeoutMs = 30_000,
}) {
  const call = async (
    /** @type {string} */ method,
    /** @type {string} */ path,
    /** @type {unknown} */ body,
    /** @type {string | null} */ token,
  ) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...extraHeaders,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `JWT ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: timeoutSignal(requestTimeoutMs),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* not JSON */
    }
    return { status: res.status, json }
  }
  const login = await call(
    'POST',
    '/api/users/login',
    { email, password },
    null,
  )
  const token = login.json?.token
  if (login.status !== 200 || typeof token !== 'string') {
    throw new RefusalError(`REST login refused (HTTP ${login.status})`)
  }
  const ok = (
    /** @type {{ status: number }} */ r,
    /** @type {string} */ what,
  ) => {
    if (r.status < 200 || r.status >= 300)
      throw new Error(`${what}: HTTP ${r.status}`)
  }
  return {
    async create(kind, data) {
      const r = await call(
        'POST',
        `/api/${COLLECTION[kind]}?draft=true&depth=0`,
        data,
        token,
      )
      ok(r, `create ${kind}`)
      return r.json.doc.id
    },
    async setStatus(kind, id, status) {
      ok(
        await call(
          'PATCH',
          `/api/${COLLECTION[kind]}/${id}?depth=0`,
          { _status: status },
          token,
        ),
        `${status} ${kind}`,
      )
    },
    async remove(kind, id) {
      const r = await call(
        'DELETE',
        `/api/${COLLECTION[kind]}/${id}`,
        undefined,
        token,
      )
      if (r.status !== 404) ok(r, `delete ${kind}`)
    },
    async exists(kind, id) {
      const r = await call(
        'GET',
        `/api/${COLLECTION[kind]}/${id}?draft=true&depth=0`,
        undefined,
        token,
      )
      if (r.status === 404) return false
      ok(r, `find ${kind}`)
      return true
    },
    async findProbes(kind) {
      const q = `where[slug][contains]=${PROBE_PREFIX}&draft=true&depth=0&limit=100&select[slug]=true`
      const r = await call(
        'GET',
        `/api/${COLLECTION[kind]}?${q}`,
        undefined,
        token,
      )
      ok(r, `find ${kind} probes`)
      return r.json.docs.map((/** @type {any} */ d) => ({
        id: d.id,
        slug: d.slug,
      }))
    },
    async close() {
      await call('POST', '/api/users/logout', {}, token).catch(() => {})
    },
  }
}

/**
 * Writes through `POST /api/mcp` with an MCP API key, as an agent does.
 *
 * @remarks Stateless JSON-RPC `tools/call`, one request per tool, with no
 * session: the plugin accepts that, and it keeps each write in its own
 * request, which is the unit #274's purge order was about. A tool error is
 * a text reply starting `Error`/`❌`, not a JSON-RPC error, so both are
 * thrown.
 *
 * @param {WriterOptions & { apiKey: string }} options
 * @returns {Promise<Writer>}
 */
export async function createMcpWriter({
  base,
  fetch,
  extraHeaders,
  apiKey,
  requestTimeoutMs = 60_000,
}) {
  let rpcId = 0
  const tool = async (
    /** @type {string} */ name,
    /** @type {object} */ args,
  ) => {
    const id = (rpcId += 1)
    const res = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: {
        ...extraHeaders,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      redirect: 'manual',
      signal: timeoutSignal(requestTimeoutMs),
    })
    const body = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new RefusalError(`MCP refused the key (HTTP ${res.status})`)
    }
    if (res.status < 200 || res.status >= 300)
      throw new Error(`${name}: HTTP ${res.status}`)
    const msg = parseMcpBody(body, id)
    if (msg.error)
      throw new Error(
        `${name}: JSON-RPC ${msg.error.code ?? ''} ${msg.error.message ?? ''}`.trim(),
      )
    const text =
      msg.result?.content
        ?.map((/** @type {any} */ c) => c.text ?? '')
        .join('\n') ?? ''
    return { text, isError: msg.result?.isError === true || isMcpError(text) }
  }
  const toolName = (
    /** @type {string} */ verb,
    /** @type {'page' | 'post'} */ kind,
  ) => `${verb}${kind === 'page' ? 'Pages' : 'Posts'}`
  const must = async (
    /** @type {string} */ name,
    /** @type {object} */ args,
  ) => {
    const r = await tool(name, args)
    if (r.isError) throw new Error(`${name}: ${r.text.slice(0, 200)}`)
    return r.text
  }
  const exists = async (
    /** @type {'page' | 'post'} */ kind,
    /** @type {number | string} */ id,
  ) => {
    const r = await tool(toolName('find', kind), { id, draft: true, depth: 0 })
    if (/^Error: Document with ID .* not found/.test(r.text.trim()))
      return false
    if (r.isError)
      throw new Error(`${toolName('find', kind)}: ${r.text.slice(0, 200)}`)
    return true
  }
  return {
    async create(kind, data) {
      const text = await must(toolName('create', kind), {
        ...data,
        draft: true,
      })
      const [doc] = mcpDocs(text)
      if (!doc?.id)
        throw new Error(`${toolName('create', kind)}: no id in reply`)
      return doc.id
    },
    async setStatus(kind, id, status) {
      await must(toolName('update', kind), {
        id,
        _status: status,
        slugLock: true,
      })
    },
    async remove(kind, id) {
      const r = await tool(toolName('delete', kind), { id })
      // An error reply for a document that is already gone is a success.
      if (r.isError && (await exists(kind, id))) {
        throw new Error(`${toolName('delete', kind)}: ${r.text.slice(0, 200)}`)
      }
    },
    exists,
    async findProbes(kind) {
      const text = await must(toolName('find', kind), {
        where: JSON.stringify({ slug: { contains: PROBE_PREFIX } }),
        draft: true,
        depth: 0,
        limit: 100,
        select: { slug: true },
      })
      return mcpDocs(text).map((d) => ({ id: d.id, slug: d.slug }))
    },
    async close() {},
  }
}

/**
 * Evidence on disk: `reads.tsv`, `writes.tsv`, `raw/` headers and bodies,
 * the baseline and final `<loc>` lists, and `summary.json`.
 *
 * @param {string} dir - Must not exist, or be empty.
 */
export function createEvidence(dir) {
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new RefusalError(
      `--evidence must be a new or empty directory: ${dir}`,
    )
  }
  mkdirSync(join(dir, 'raw'), { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const readsHeader = [
    'utc',
    'phase',
    'label',
    'url',
    'status',
    ...RECORDED_HEADERS,
    'loc_count',
    'probes_present',
  ].join('\t')
  writeFileSync(join(dir, 'reads.tsv'), `${readsHeader}\n`)
  writeFileSync(
    join(dir, 'writes.tsv'),
    'utc\tpath\taction\tkind\tid\tresult\n',
  )
  let seq = 0
  return {
    dir,
    /** @param {string[]} cells */
    read(cells) {
      writeFileSync(join(dir, 'reads.tsv'), `${cells.join('\t')}\n`, {
        flag: 'a',
      })
    },
    /** @param {string[]} cells */
    write(cells) {
      writeFileSync(join(dir, 'writes.tsv'), `${cells.join('\t')}\n`, {
        flag: 'a',
      })
    },
    /** @param {string} label @param {string} headers @param {string} body */
    raw(label, headers, body) {
      seq += 1
      const name = `${String(seq).padStart(3, '0')}-${label.replace(/[^\w.-]+/g, '_')}`
      writeFileSync(join(dir, 'raw', `${name}.headers`), headers)
      writeFileSync(join(dir, 'raw', `${name}.body`), body)
    },
    /** @param {string} name @param {string} text */
    file(name, text) {
      writeFileSync(join(dir, name), text)
    },
  }
}

/**
 * Backstop for "no secret in the evidence" (#294 AC): any file that contains
 * a credential value is overwritten with a marker, and its name returned.
 *
 * @param {string} dir
 * @param {string[]} secrets
 */
export function scrubEvidence(dir, secrets) {
  const values = secrets.filter((s) => typeof s === 'string' && s.length >= 6)
  const hit = []
  const walk = (/** @type {string} */ d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (values.some((v) => readFileSync(path, 'utf8').includes(v))) {
        writeFileSync(
          path,
          '[removed by freshness-probe: contained a credential]\n',
        )
        hit.push(path)
      }
    }
  }
  if (values.length) walk(dir)
  return hit
}

/** @param {number} ms @param {AbortSignal} [signal] */
export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(signal.reason ?? new Error('aborted'))
      },
      { once: true },
    )
  })

/**
 * @typedef {object} RunOptions
 * @property {ReturnType<typeof resolvePlan>} plan
 * @property {Writer} writer
 * @property {typeof fetch} fetch
 * @property {ReturnType<typeof createEvidence>} evidence
 * @property {Record<string, string>} readHeaders - Sent on public reads (the bypass header, if any).
 * @property {(line: string) => void} log
 * @property {() => Date} [now]
 * @property {typeof sleep} [wait]
 * @property {AbortSignal} [signal]
 * @property {string} [slugTail]
 */

/**
 * Runs the probe: baseline, create drafts, publish and poll for inclusion,
 * warm the probe URLs, unpublish and poll for removal, then clean up in a
 * `finally` whatever happened before.
 *
 * @remarks Inclusion needs every probe in `/sitemap.xml` and answering 200.
 * Removal needs every probe gone from the sitemap and its URL answering 404,
 * read after the URL was warmed: #274's failure was an unpublished page still
 * served from cache. Cleanup deletes only ids this run created, then checks
 * the API returns nothing for them, that no page, post or redirect matches
 * {@link PROBE_PREFIX}, and that the final `<loc>` list equals the baseline.
 *
 * @param {RunOptions} options
 */
export async function runProbe({
  plan,
  writer,
  fetch,
  evidence,
  readHeaders,
  log,
  now = () => new Date(),
  wait = sleep,
  signal,
  slugTail,
}) {
  const utc = () => now().toISOString()
  const startedAt = now()
  const slugs = probeSlugs(startedAt, slugTail)
  const probes = plan.kinds.map((kind) => ({
    kind,
    slug: slugs[kind],
    path: probePath(kind, slugs[kind]),
    id: /** @type {number | string | null} */ (null),
  }))
  const result = {
    target: plan.target,
    base: plan.base,
    writePath: plan.writePath,
    probes: probes.map(({ kind, slug, path }) => ({ kind, slug, path })),
    startedAt: startedAt.toISOString(),
    inclusion: /** @type {'PASS' | 'FAIL' | 'NOT RUN'} */ ('NOT RUN'),
    removal: /** @type {'PASS' | 'FAIL' | 'NOT RUN'} */ ('NOT RUN'),
    // 'NOT NEEDED' when the run stopped before its first write.
    cleanup: /** @type {'PASS' | 'FAIL' | 'NOT NEEDED'} */ ('NOT NEEDED'),
    llms: /** @type {string[]} */ ([]),
    notes: /** @type {string[]} */ ([]),
    error: /** @type {string | null} */ (null),
  }
  let reads = 0
  /** @type {string[]} */
  let baseline = []

  const read = async (
    /** @type {string} */ phase,
    /** @type {string} */ label,
    /** @type {string} */ path,
  ) => {
    reads += 1
    const url = `${plan.base}${path}`
    const at = utc()
    let status = 'ERR'
    let headers = /** @type {Record<string, string>} */ ({})
    let body = ''
    try {
      const res = await fetch(url, {
        headers: readHeaders,
        redirect: 'manual',
        cache: 'no-store',
        signal: timeoutSignal(30_000),
      })
      status = String(res.status)
      for (const name of RECORDED_HEADERS)
        headers[name] = res.headers.get(name) ?? ''
      body = await res.text()
    } catch (error) {
      body = `fetch failed: ${error instanceof Error ? error.message : String(error)}`
    }
    const isSitemap = path === '/sitemap.xml'
    const locs = isSitemap && status === '200' ? sitemapPaths(body) : null
    const present = locs
      ? probes.filter((p) => locs.includes(p.path)).map((p) => p.kind)
      : []
    evidence.read([
      at,
      phase,
      label,
      url,
      status,
      ...RECORDED_HEADERS.map((h) => headers[h]),
      locs ? String(locs.length) : '',
      locs ? present.join(',') || 'none' : '',
    ])
    evidence.raw(
      `${phase}-${label}`,
      [
        `${status} ${url}`,
        `utc: ${at}`,
        ...RECORDED_HEADERS.map((h) => `${h}: ${headers[h]}`),
      ].join('\n') + '\n',
      body,
    )
    log(
      [
        at,
        phase.padEnd(9),
        label.padEnd(12),
        status,
        `x-vercel-cache=${headers['x-vercel-cache'] || '-'}`,
        `age=${headers.age || '-'}`,
        `x-vercel-id=${headers['x-vercel-id'] || '-'}`,
        locs ? `locs=${locs.length} probes=${present.join(',') || 'none'}` : '',
      ]
        .join('  ')
        .trimEnd(),
    )
    return { status, body, locs, present }
  }

  const write = async (
    /** @type {string} */ action,
    /** @type {typeof probes[number]} */ probe,
    /** @type {() => Promise<unknown>} */ fn,
  ) => {
    const at = utc()
    try {
      const out = await fn()
      evidence.write([
        at,
        plan.writePath,
        action,
        probe.kind,
        String(probe.id ?? out ?? ''),
        'ok',
      ])
      log(
        `${at}  write      ${plan.writePath} ${action} ${probe.kind} ${probe.id ?? out ?? ''} ok`,
      )
      return out
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      evidence.write([
        at,
        plan.writePath,
        action,
        probe.kind,
        String(probe.id ?? ''),
        `error: ${message}`,
      ])
      log(
        `${at}  write      ${plan.writePath} ${action} ${probe.kind} FAILED: ${message}`,
      )
      throw error
    }
  }

  /** Polls `check` immediately and then every interval, until it holds or the timeout passes. */
  const poll = async (
    /** @type {string} */ phase,
    /** @type {() => Promise<boolean>} */ check,
  ) => {
    const deadline = now().getTime() + plan.timeoutMs
    for (;;) {
      if (await check()) return true
      if (now().getTime() + plan.intervalMs > deadline) return false
      await wait(plan.intervalMs, signal)
    }
  }

  const llmsRead = async (/** @type {string} */ phase) => {
    if (!probes.some((p) => p.kind === 'post')) return
    const post = /** @type {typeof probes[number]} */ (
      probes.find((p) => p.kind === 'post')
    )
    // A cache-busted read reaches the function, so it shows the `posts` data; the
    // plain URL keeps its own s-maxage, which no purge reaches (#274 AC 3).
    const busted = await read(
      phase,
      'llms-fresh',
      `/llms.txt?freshness-probe=${reads}`,
    )
    const plain = await read(phase, 'llms-plain', '/llms.txt')
    result.llms.push(
      `${phase}: function read ${busted.body.includes(post.slug) ? 'has' : 'lacks'} the article; plain URL ${plain.body.includes(post.slug) ? 'has' : 'lacks'} it`,
    )
  }

  let wrote = false
  try {
    const base = await read('baseline', 'sitemap', '/sitemap.xml')
    if (!base.locs)
      throw new RefusalError(`Baseline /sitemap.xml answered ${base.status}`)
    baseline = base.locs
    evidence.file('locs-baseline.txt', `${baseline.join('\n')}\n`)
    const leftovers = await findLeftovers()
    if (leftovers.length) {
      throw new RefusalError(
        `Probe leftovers exist; delete them first: ${leftovers.join(', ')}`,
      )
    }
    for (const p of probes) await read('baseline', p.kind, p.path)

    wrote = true
    for (const p of probes) {
      p.id = /** @type {number | string} */ (
        await write('create-draft', p, () =>
          writer.create(p.kind, probeDocument(p.kind, p.slug, startedAt)),
        )
      )
    }
    for (const p of probes)
      await write('publish', p, () =>
        writer.setStatus(
          p.kind,
          /** @type {number | string} */ (p.id),
          'published',
        ),
      )
    const included = await poll('inclusion', async () => {
      const sm = await read('inclusion', 'sitemap', '/sitemap.xml')
      let allUp = sm.present.length === probes.length
      for (const p of probes) {
        const r = await read('inclusion', p.kind, p.path)
        allUp = allUp && r.status === '200'
      }
      return allUp
    })
    result.inclusion = included ? 'PASS' : 'FAIL'
    await llmsRead('inclusion')

    for (const p of probes) {
      await read('warm', p.kind, p.path)
      await read('warm', p.kind, p.path)
    }
    for (const p of probes)
      await write('unpublish', p, () =>
        writer.setStatus(
          p.kind,
          /** @type {number | string} */ (p.id),
          'draft',
        ),
      )
    const removed = await poll('removal', async () => {
      const sm = await read('removal', 'sitemap', '/sitemap.xml')
      let allGone = sm.locs !== null && sm.present.length === 0
      for (const p of probes) {
        const r = await read('removal', p.kind, p.path)
        allGone = allGone && r.status === '404'
      }
      return allGone
    })
    result.removal = removed ? 'PASS' : 'FAIL'
    await llmsRead('removal')
  } catch (error) {
    if (error instanceof RefusalError && !wrote) throw error
    result.error = error instanceof Error ? error.message : String(error)
    log(`${utc()}  error      ${result.error}`)
  } finally {
    if (wrote) result.cleanup = await cleanup()
  }
  if (result.inclusion === 'PASS' && result.removal === 'FAIL') {
    result.notes.push(
      'Removal failed after a passing inclusion: an unpublish did not reach a cached reader.',
    )
  }
  if (result.inclusion === 'FAIL' && result.removal === 'PASS') {
    result.notes.push(
      'Removal PASS is weak here: the probes never fully joined the sitemap.',
    )
  }
  evidence.file('summary.json', `${JSON.stringify(result, null, 2)}\n`)
  return result

  async function findLeftovers() {
    const found = []
    for (const kind of /** @type {const} */ (['page', 'post'])) {
      for (const d of await writer.findProbes(kind))
        found.push(`${kind} ${d.id} ${d.slug}`)
    }
    const redirects = await redirectLeftovers()
    if (redirects === null)
      result.notes.push('Redirects could not be read anonymously; not checked.')
    else found.push(...redirects)
    return found
  }

  async function redirectLeftovers() {
    try {
      const res = await fetch(
        `${plan.base}/api/redirects?where[from][contains]=${PROBE_PREFIX}&depth=0&limit=100`,
        {
          headers: readHeaders,
          redirect: 'manual',
          signal: timeoutSignal(30_000),
        },
      )
      if (res.status !== 200) return null
      const json = await res.json()
      return json.docs.map(
        (/** @type {any} */ d) => `redirect ${d.id} ${d.from}`,
      )
    } catch {
      return null
    }
  }

  async function cleanup() {
    let ok = true
    const at = () => utc()
    // A create that timed out may have landed without returning its id: adopt
    // any document carrying this run's own slug. Other runs' leftovers are
    // never touched; the prefix check below reports them.
    for (const p of probes) {
      if (p.id !== null) continue
      try {
        const mine = (await writer.findProbes(p.kind)).find(
          (d) => d.slug === p.slug,
        )
        if (mine) p.id = mine.id
      } catch {
        ok = false
      }
    }
    for (const p of probes) {
      if (p.id === null) continue
      let deleted = false
      for (let attempt = 1; attempt <= 3 && !deleted; attempt += 1) {
        try {
          await write('delete', p, () =>
            writer.remove(p.kind, /** @type {number | string} */ (p.id)),
          )
          deleted = !(await writer.exists(
            p.kind,
            /** @type {number | string} */ (p.id),
          ))
        } catch {
          /* retried below */
        }
        // No abort signal: cleanup runs to the end even after Ctrl-C.
        if (!deleted && attempt < 3) await wait(2000)
      }
      log(
        `${at()}  cleanup    ${p.kind} ${p.id} ${deleted ? 'gone (API 404)' : 'STILL PRESENT'}`,
      )
      if (!deleted) ok = false
    }
    try {
      const left = await findLeftovers()
      log(
        `${at()}  cleanup    prefix matches: ${left.length ? left.join(', ') : 'none'}`,
      )
      if (left.length) ok = false
    } catch (error) {
      ok = false
      log(
        `${at()}  cleanup    prefix check failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    for (const p of probes) {
      const r = await read('final', p.kind, p.path)
      if (r.status !== '404') ok = false
    }
    const final = await read('final', 'sitemap', '/sitemap.xml')
    if (final.locs) {
      evidence.file('locs-final.txt', `${final.locs.join('\n')}\n`)
      const diff = diffPaths(baseline, final.locs)
      log(
        `${at()}  cleanup    final <loc> list ${diff.identical ? 'identical to the baseline' : `differs: +${diff.added.join(' +')} -${diff.removed.join(' -')}`}`,
      )
      if (!diff.identical) {
        result.notes.push(
          `Final sitemap differs from the baseline (+${diff.added.length}/-${diff.removed.length}); a concurrent content change would also show here.`,
        )
        ok = false
      }
    } else {
      ok = false
    }
    return /** @type {'PASS' | 'FAIL'} */ (ok ? 'PASS' : 'FAIL')
  }
}

/**
 * The exit code for a finished run.
 *
 * @param {{ inclusion: string, removal: string, cleanup: string }} result
 */
export function exitCodeFor(result) {
  if (result.cleanup === 'FAIL') return EXIT.cleanupIncomplete
  return result.inclusion === 'PASS' && result.removal === 'PASS'
    ? EXIT.pass
    : EXIT.fail
}
