/**
 * Daily incremental backup of the media the database references, from Vercel
 * Blob's public URLs into a private R2 bucket, with a dated manifest and a
 * check that every reference is in it (#328).
 *
 * @remarks **Why public URLs, not the Blob API.** Vercel Blob has no read-only
 * token: listing the store takes `BLOB_READ_WRITE_TOKEN`, which can also
 * overwrite and delete every object in it — the failure this backup exists to
 * survive. Every object is public to read, so this job holds no Blob
 * credential at all. What it cannot see is an object nothing in the database
 * references; such an object is not needed to restore the site, and the store
 * listing (`vercel storage inspect`) gives its count for comparison.
 *
 * **Never overwrite, never delete.** The first copy of a pathname goes to
 * `objects/<pathname>`, which mirrors the Blob pathname under one prefix, so
 * the bucket can seed an R2-primary store later. A changed file (another etag
 * or size) goes to `versions/<pathname>/<etag>`. Every write is a create-only
 * PUT (`If-None-Match: *`, which R2 evaluates atomically), so a second writer
 * or a re-run can never replace bytes already backed up. The manifest records
 * which key holds each pathname's current bytes.
 *
 * **Incremental.** A pathname whose etag and size match the newest manifest,
 * and whose recorded object still answers a HEAD in R2, is carried forward
 * without a download.
 *
 * Usage (the workflow runs both; the R2 settings come from the environment):
 * `node scripts/media-backup.ts backup --refs FILE... --out DIR` and
 * `node scripts/media-backup.ts check --refs FILE...`.
 *
 * Exit codes follow `audit-served-prefix.yml`: 0 clean, 1 a finding (a missing
 * or uncopied reference), 2 the run did not complete (bad input, no manifest,
 * an R2 or network error).
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

/** One media reference: the Blob pathname and where in the database it is. */
export type Reference = { pathname: string; table: string }

/** What a HEAD on a public Blob URL tells us. */
export type PublicHead = {
  contentType: string | null
  etag: string | null
  lastModified: string | null
  size: number | null
  status: number
}

/** One pathname's line in a manifest. */
export type ManifestEntry = {
  contentType: string | null
  detail?: string
  etag: string | null
  key: string | null
  pathname: string
  sha256: string | null
  size: number | null
  status: 'copied' | 'unchanged' | 'missing' | 'error'
  uploadedAt: string | null
}

/** A dated manifest, written once per run under `manifests/`. */
export type Manifest = {
  entries: ManifestEntry[]
  generatedAt: string
  origin: string
  references: number
  version: 1
}

/** An object already in R2, as HEAD reports it. */
export type StoredObject = { metadata: Record<string, string>; size: number }

/** Everything the backup touches outside its own memory, injectable for tests. */
export type Deps = {
  downloadPublic: (
    url: string,
    dest: string,
  ) => Promise<{ etag: string | null; sha256: string; size: number }>
  headPublic: (url: string) => Promise<PublicHead>
  r2Head: (key: string) => Promise<StoredObject | null>
  r2PutCreateOnly: (
    key: string,
    file: string,
    options: { contentType: string | null; metadata: Record<string, string> },
  ) => Promise<'created' | 'exists'>
}

/**
 * Payload's version-history tables (`_posts_v`, `_posts_v_blocks_…`): their
 * references are reported but never fail the check.
 */
const HISTORY_TABLE = /^_.+_v($|_)/

/** Key prefixes. A pathname's first copy mirrors the Blob pathname. */
export const OBJECTS_PREFIX = 'objects/'
export const VERSIONS_PREFIX = 'versions/'
export const MANIFESTS_PREFIX = 'manifests/'

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}

/** Undo the XML escaping `query_to_xml` applies to text values. */
function unescapeXml(value: string): string {
  return value.replace(
    /&(amp|apos|gt|lt|quot|#x[\da-f]+|#\d+);/gi,
    (_, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x'
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10)
        return String.fromCodePoint(code)
      }
      return XML_ENTITIES[entity.toLowerCase()] ?? `&${entity};`
    },
  )
}

/**
 * Parse the reference query's output (`scripts/media-backup-references.sql`).
 *
 * @remarks Throws when the closing `end` line is absent or its count disagrees,
 * so a failed or truncated query can never pass as "no references". Text
 * values contribute every URL on `origin`'s host; URLs on other hosts are
 * ignored, since they are not this store's.
 */
export function parseReferences(jsonl: string, origin: string): Reference[] {
  const host = new URL(origin).host
  const urlPattern = new RegExp(
    `https?://${host.replace(/\./g, '\\.')}/[^\\s"'<>\\\\)\\]]+`,
    'g',
  )
  const references: Reference[] = []
  let rows = 0
  let endCount: number | null = null
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line) as {
      count?: number
      kind: string
      table?: string
      value?: string
    }
    if (row.kind === 'end') {
      endCount = Number(row.count)
      continue
    }
    rows += 1
    const table = row.table ?? 'unknown'
    if (row.kind === 'filename' && row.value) {
      references.push({ pathname: row.value, table })
    } else if (row.kind === 'text' && row.value) {
      for (const match of unescapeXml(row.value).matchAll(urlPattern)) {
        const pathname = pathnameFromUrl(match[0])
        if (pathname) references.push({ pathname, table })
      }
    }
  }
  if (endCount === null) {
    throw new Error(
      'reference query output has no end line: it did not complete',
    )
  }
  if (endCount !== rows) {
    throw new Error(
      `reference query reported ${endCount} rows but ${rows} arrived`,
    )
  }
  return references
}

/** The Blob pathname a public URL names, or `null` when it names none. */
export function pathnameFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url)
    const decoded = decodeURIComponent(pathname.replace(/^\/+/, ''))
    return decoded || null
  } catch {
    return null
  }
}

/**
 * Why a pathname cannot be backed up safely, or `null` when it can.
 *
 * @remarks Pathnames come from editor-written rows. URL parsing folds `.` and
 * `..` segments, so `a/../b` would fetch `b` and store it as `a/../b`; control
 * characters and empty segments make keys no tool round-trips; R2 caps a key
 * at 1,024 bytes, and the `versions/` key adds the prefix and an etag. Such a
 * pathname is recorded as an error, which fails the check, never copied.
 */
export function unsafePathname(pathname: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(pathname)) return 'control character'
  const segments = pathname.split('/')
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    return 'empty, . or .. path segment'
  }
  if (Buffer.byteLength(pathname) > 900) return 'longer than 900 bytes'
  return null
}

/** The public URL for a pathname: each segment percent-encoded, as Blob serves it. */
export function publicUrl(origin: string, pathname: string): string {
  return `${origin.replace(/\/+$/, '')}/${pathname
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

/** An etag without its quotes or weak prefix, safe inside an object key. */
export function normalizeEtag(etag: string | null): string | null {
  if (!etag) return null
  const bare = etag.replace(/^W\//, '').replace(/"/g, '').trim()
  return bare || null
}

/** The two keys a pathname's bytes may live under, in the order they are tried. */
export function candidateKeys(pathname: string, etag: string): string[] {
  return [
    `${OBJECTS_PREFIX}${pathname}`,
    `${VERSIONS_PREFIX}${pathname}/${etag.replace(/[^\w.-]/g, '_')}`,
  ]
}

/** A manifest key that sorts by time, so the greatest key is the newest. */
export function manifestKey(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, '')
    .replace(/\d{3}Z$/, 'Z')
  return `${MANIFESTS_PREFIX}${stamp.slice(0, 10)}/media-manifest-${stamp}.json`
}

/** Unique pathnames, in first-seen order. */
export function uniquePathnames(references: Reference[]): string[] {
  return [...new Set(references.map((reference) => reference.pathname))]
}

/**
 * Back up one pathname, returning its manifest entry.
 *
 * @remarks Never throws for a single object's failure: that becomes an
 * `error` entry, the run continues, and the check fails on it.
 */
export async function backupOne(
  pathname: string,
  context: {
    deps: Deps
    origin: string
    previous: Map<string, ManifestEntry>
    workDir: string
  },
): Promise<ManifestEntry> {
  const { deps, origin, previous, workDir } = context
  const base = {
    contentType: null,
    etag: null,
    key: null,
    pathname,
    sha256: null,
    size: null,
    uploadedAt: null,
  }
  const unsafe = unsafePathname(pathname)
  if (unsafe) return { ...base, detail: unsafe, status: 'error' }
  const url = publicUrl(origin, pathname)
  try {
    const head = await deps.headPublic(url)
    if (head.status === 404) {
      return { ...base, detail: 'public URL answers 404', status: 'missing' }
    }
    const etag = normalizeEtag(head.etag)
    if (head.status !== 200 || !etag || head.size === null) {
      return {
        ...base,
        detail: `public HEAD answered ${head.status} without etag and size`,
        status: 'error',
      }
    }
    const found = {
      contentType: head.contentType,
      etag,
      key: null,
      sha256: null,
      pathname,
      size: head.size,
      uploadedAt: head.lastModified,
    }

    const prior = previous.get(pathname)
    if (
      prior?.key &&
      (prior.status === 'copied' || prior.status === 'unchanged') &&
      prior.etag === etag &&
      prior.size === head.size
    ) {
      const stored = await deps.r2Head(prior.key)
      if (stored && stored.size === head.size) {
        return {
          ...found,
          key: prior.key,
          sha256: prior.sha256,
          status: 'unchanged',
        }
      }
    }

    for (const key of candidateKeys(pathname, etag)) {
      const stored = await deps.r2Head(key)
      if (stored) {
        if (
          stored.metadata['blob-etag'] === etag &&
          stored.size === head.size
        ) {
          return {
            ...found,
            key,
            sha256: stored.metadata.sha256 ?? null,
            status: 'unchanged',
          }
        }
        continue // other bytes hold this key: never overwrite them
      }
      const file = path.join(
        workDir,
        createHash('sha256').update(key).digest('hex'),
      )
      try {
        const downloaded = await deps.downloadPublic(url, file)
        if (downloaded.size !== head.size) {
          return {
            ...found,
            detail: `downloaded ${downloaded.size} bytes, HEAD said ${head.size}`,
            status: 'error',
          }
        }
        if (normalizeEtag(downloaded.etag) !== etag) {
          return {
            ...found,
            detail:
              'the object changed between HEAD and GET; the next run retries',
            status: 'error',
          }
        }
        const put = await deps.r2PutCreateOnly(key, file, {
          contentType: head.contentType,
          metadata: { 'blob-etag': etag, sha256: downloaded.sha256 },
        })
        if (put === 'exists') {
          return {
            ...found,
            detail: `${key} was created by another writer during this run`,
            status: 'error',
          }
        }
        return { ...found, key, sha256: downloaded.sha256, status: 'copied' }
      } finally {
        await rm(file, { force: true })
      }
    }
    return {
      ...found,
      detail: 'both candidate keys hold other bytes',
      status: 'error',
    }
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    const message = error instanceof Error ? error.message : String(error)
    return {
      ...base,
      detail: stderr ? `${message}: ${stderr.slice(0, 500)}` : message,
      status: 'error',
    }
  }
}

/** Run `task` over `items` with at most `limit` in flight, keeping order. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

/** Back up every referenced pathname and return the run's manifest. */
export async function backup(options: {
  concurrency?: number
  deps: Deps
  now: Date
  origin: string
  previous: Manifest | null
  references: Reference[]
  workDir: string
}): Promise<Manifest> {
  const previous = new Map(
    (options.previous?.entries ?? []).map((entry) => [entry.pathname, entry]),
  )
  await mkdir(options.workDir, { recursive: true })
  const entries = await mapPool(
    uniquePathnames(options.references),
    options.concurrency ?? 4,
    (pathname) =>
      backupOne(pathname, {
        deps: options.deps,
        origin: options.origin,
        previous,
        workDir: options.workDir,
      }),
  )
  return {
    entries,
    generatedAt: options.now.toISOString(),
    origin: options.origin,
    references: options.references.length,
    version: 1,
  }
}

/**
 * One check problem. `reason` never contains the pathname or a key: output
 * names a problem by {@link referenceId} only.
 */
export type CheckIssue = { pathname: string; reason: string }

/** The outcome of checking references against a manifest. */
export type CheckResult = {
  failures: CheckIssue[]
  history: CheckIssue[]
  verified: number
}

/**
 * An opaque id for a pathname, safe to print in a public log.
 *
 * @remarks References come from drafts, gated posts and version history as
 * well as published pages, and this repository's Actions logs are public. A
 * pathname can name unannounced work even when its bytes are public by URL,
 * so logs and summaries carry this id; the private manifest carries the
 * pathname, and `sha256(pathname)` finds it there.
 */
export function referenceId(pathname: string): string {
  return createHash('sha256').update(pathname).digest('hex').slice(0, 12)
}

/**
 * Check that every referenced pathname is in the manifest with its bytes in R2.
 *
 * @remarks A reference from a version-history table (`*_v`) that is not backed
 * up is reported but does not fail: history can name a file deleted long ago.
 * A manifest older than `maxAgeHours` fails, so a backup that stopped running
 * cannot keep passing on an old manifest.
 */
export async function check(options: {
  deps: Pick<Deps, 'r2Head'>
  manifest: Manifest
  maxAgeHours?: number
  now: Date
  references: Reference[]
}): Promise<CheckResult> {
  const failures: CheckIssue[] = []
  const history: CheckIssue[] = []
  const ageHours =
    (options.now.getTime() - Date.parse(options.manifest.generatedAt)) / 3.6e6
  if (!(ageHours <= (options.maxAgeHours ?? 36))) {
    failures.push({
      pathname: '',
      reason: `the newest manifest is ${Number.isFinite(ageHours) ? ageHours.toFixed(1) : '?'} hours old`,
    })
  }
  const entries = new Map(
    options.manifest.entries.map((entry) => [entry.pathname, entry]),
  )
  const live = new Set<string>()
  const historyOnly = new Set<string>()
  for (const reference of options.references) {
    if (HISTORY_TABLE.test(reference.table)) historyOnly.add(reference.pathname)
    else live.add(reference.pathname)
  }
  for (const pathname of live) historyOnly.delete(pathname)

  let verified = 0
  for (const pathname of [...live, ...historyOnly]) {
    const target = live.has(pathname) ? failures : history
    const entry = entries.get(pathname)
    if (!entry) {
      target.push({ pathname, reason: 'not in the manifest' })
      continue
    }
    if (
      (entry.status !== 'copied' && entry.status !== 'unchanged') ||
      !entry.key
    ) {
      target.push({ pathname, reason: `${entry.status} in the manifest` })
      continue
    }
    const stored = await options.deps.r2Head(entry.key)
    if (!stored || stored.size !== entry.size) {
      target.push({
        pathname,
        reason: `its object is not in R2 at ${entry.size} bytes`,
      })
      continue
    }
    verified += 1
  }
  return { failures, history, verified }
}

// ---------------------------------------------------------------------------
// The real dependencies: public HTTPS for Blob, the AWS CLI for R2.
// ---------------------------------------------------------------------------

/**
 * Headers for every public Blob request. The CDN compresses text types such as
 * SVG when asked, and then sends a weak etag and no content length, so neither
 * size nor identity could be checked [measured 2026-11-14, curl with and
 * without `accept-encoding: br`]. Asking for the stored bytes keeps both.
 */
export const PUBLIC_FETCH_HEADERS = { 'accept-encoding': 'identity' } as const

function aws(args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'aws',
      args,
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // Not execFile's own error: its message repeats the command line,
          // which holds the object key and so the pathname. The stderr rides
          // along for the 404/412 tests and the private manifest only.
          reject(
            Object.assign(
              new Error(`aws ${args.slice(0, 2).join(' ')} failed`),
              { stderr: String(stderr) },
            ),
          )
        } else {
          resolve({ stdout: String(stdout) })
        }
      },
    )
  })
}

/** The R2 and Blob dependencies, from the workflow's environment. */
export function realDeps(bucket: string): Deps & {
  getObject: (key: string) => Promise<string>
  listKeys: (prefix: string) => Promise<string[]>
} {
  return {
    async downloadPublic(url, dest) {
      const response = await fetch(url, {
        headers: PUBLIC_FETCH_HEADERS,
        redirect: 'error',
      })
      if (!response.ok || !response.body) {
        throw new Error(`GET ${url} answered ${response.status}`)
      }
      const hash = createHash('sha256')
      const body = Readable.fromWeb(response.body as never)
      body.on('data', (chunk: Buffer) => hash.update(chunk))
      await pipeline(body, createWriteStream(dest))
      return {
        etag: response.headers.get('etag'),
        sha256: hash.digest('hex'),
        size: (await stat(dest)).size,
      }
    },
    async getObject(key) {
      const file = path.join(
        process.env.RUNNER_TEMP ?? '/tmp',
        'media-manifest.json',
      )
      await aws(['s3api', 'get-object', '--bucket', bucket, '--key', key, file])
      return readFile(file, 'utf8')
    },
    async headPublic(url) {
      const response = await fetch(url, {
        headers: PUBLIC_FETCH_HEADERS,
        method: 'HEAD',
        redirect: 'error',
      })
      const length = response.headers.get('content-length')
      return {
        contentType: response.headers.get('content-type'),
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        size: length === null ? null : Number(length),
        status: response.status,
      }
    },
    async listKeys(prefix) {
      const { stdout } = await aws([
        's3api',
        'list-objects-v2',
        '--bucket',
        bucket,
        '--prefix',
        prefix,
        '--query',
        'Contents[].Key',
        '--output',
        'json',
      ])
      return (JSON.parse(stdout || 'null') as string[] | null) ?? []
    },
    async r2Head(key) {
      try {
        const { stdout } = await aws([
          's3api',
          'head-object',
          '--bucket',
          bucket,
          '--key',
          key,
          '--output',
          'json',
        ])
        const parsed = JSON.parse(stdout) as {
          ContentLength: number
          Metadata?: Record<string, string>
        }
        return { metadata: parsed.Metadata ?? {}, size: parsed.ContentLength }
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? ''
        if (/\(404\)|Not Found|NoSuchKey/i.test(stderr)) return null
        throw error
      }
    },
    async r2PutCreateOnly(key, file, { contentType, metadata }) {
      const args = [
        's3api',
        'put-object',
        '--bucket',
        bucket,
        '--key',
        key,
        '--body',
        file,
        '--if-none-match',
        '*',
      ]
      const pairs = Object.entries(metadata)
      if (pairs.length > 0) {
        args.push(
          '--metadata',
          pairs.map(([name, value]) => `${name}=${value}`).join(','),
        )
      }
      if (contentType) args.push('--content-type', contentType)
      try {
        await aws(args)
        return 'created'
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? ''
        if (/PreconditionFailed|\(412\)/i.test(stderr)) return 'exists'
        throw error
      }
    },
  }
}

/** The newest manifest in the bucket, or `null` when there is none yet. */
async function latestManifest(
  deps: ReturnType<typeof realDeps>,
): Promise<{ key: string; manifest: Manifest } | null> {
  const keys = (await deps.listKeys(MANIFESTS_PREFIX)).sort()
  const key = keys.at(-1)
  if (!key) return null
  return { key, manifest: JSON.parse(await deps.getObject(key)) as Manifest }
}

/** Parse `--name value` pairs; `--refs` may repeat. */
function parseArgs(argv: string[]): {
  command: string
  out?: string
  refs: string[]
} {
  const [command = '', ...rest] = argv
  const refs: string[] = []
  let out: string | undefined
  for (let index = 0; index < rest.length; index += 2) {
    if (rest[index] === '--refs') refs.push(rest[index + 1])
    else if (rest[index] === '--out') out = rest[index + 1]
    else throw new Error(`unknown argument ${rest[index]}`)
  }
  return { command, out, refs }
}

async function main(argv: string[]): Promise<number> {
  const { command, out, refs } = parseArgs(argv)
  const origin = process.env.MEDIA_BLOB_ORIGIN
  const bucket = process.env.R2_MEDIA_BACKUP_BUCKET
  if (!origin || !bucket) {
    throw new Error('MEDIA_BLOB_ORIGIN and R2_MEDIA_BACKUP_BUCKET must be set')
  }
  if (refs.length === 0) throw new Error('at least one --refs file is required')
  const references = (
    await Promise.all(refs.map((file) => readFile(file, 'utf8')))
  ).flatMap((text) => parseReferences(text, origin))
  if (references.length === 0) {
    throw new Error(
      'the database names no media at all: refusing to call that clean',
    )
  }
  const deps = realDeps(bucket)
  const summary = process.env.GITHUB_STEP_SUMMARY

  if (command === 'backup') {
    if (!out) throw new Error('backup needs --out <dir>')
    const now = new Date()
    const prior = await latestManifest(deps)
    const manifest = await backup({
      deps,
      now,
      origin,
      previous: prior?.manifest ?? null,
      references,
      workDir: path.join(out, 'work'),
    })
    const file = path.join(out, 'manifest.json')
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
    const key = manifestKey(now)
    if (
      (await deps.r2PutCreateOnly(key, file, {
        contentType: 'application/json',
        metadata: {},
      })) === 'exists'
    ) {
      throw new Error(`manifest ${key} already exists`)
    }
    const count = (status: ManifestEntry['status']) =>
      manifest.entries.filter((entry) => entry.status === status).length
    const line = `Media backup: ${manifest.entries.length} pathnames from ${references.length} references — ${count('copied')} copied, ${count('unchanged')} unchanged, ${count('missing')} missing, ${count('error')} errors. Manifest r2://${bucket}/${key}`
    console.log(line)
    for (const entry of manifest.entries) {
      if (entry.status === 'missing' || entry.status === 'error') {
        // An id, never the pathname or the detail: this log is public.
        console.log(`  ${entry.status}: ${referenceId(entry.pathname)}`)
      }
    }
    if (summary) await writeFile(summary, `${line}\n`, { flag: 'a' })
    return 0 // the check step decides pass or fail, from the manifest in R2
  }

  if (command === 'check') {
    const prior = await latestManifest(deps)
    if (!prior)
      throw new Error('no manifest in the bucket: the backup has never run')
    const result = await check({
      deps,
      manifest: prior.manifest,
      now: new Date(),
      references,
    })
    const line = `Media check against ${prior.key}: ${result.verified} verified, ${result.failures.length} failing, ${result.history.length} history-only not backed up.`
    console.log(line)
    // Ids and fixed reasons only: this log and the summary are public.
    const print = (issue: CheckIssue) =>
      issue.pathname
        ? `${referenceId(issue.pathname)} ${issue.reason}`
        : issue.reason
    for (const failure of result.failures)
      console.log(`  FAIL ${print(failure)}`)
    for (const note of result.history) console.log(`  history ${print(note)}`)
    if (summary) await writeFile(summary, `${line}\n`, { flag: 'a' })
    return result.failures.length === 0 ? 0 : 1
  }

  throw new Error(`unknown command "${command}" (backup | check)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        `::error::media backup did not complete: ${error instanceof Error ? error.message : String(error)}`,
      )
      process.exit(2)
    },
  )
}
