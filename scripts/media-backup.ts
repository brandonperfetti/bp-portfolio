/**
 * Daily incremental backup of the media table's files, from Vercel Blob's
 * public URLs into a private R2 bucket, with a dated manifest and a check that
 * every file is in it (#328).
 *
 * @remarks **Why public URLs, not the Blob API.** Vercel Blob has no read-only
 * token: listing the store takes `BLOB_READ_WRITE_TOKEN`, which can also
 * overwrite and delete every object in it — the failure this backup exists to
 * survive. Every object is public to read, so this job holds no Blob
 * credential at all. What it cannot see is an object no media row names, so the
 * backup covers the media table's files only (each row's filename and any size
 * variant's): an object named only by an older database dump, by a URL typed
 * into text, or by nothing, is not copied. That scope is the owner's decision
 * (#328); the store listing (`vercel storage inspect`) gives the total for
 * comparison.
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
 * or uncopied file), 2 the run did not complete (bad input, no manifest,
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

/** One media file a database names: its Blob pathname (the stored filename). */
export type Reference = { pathname: string }

/** What a HEAD on a public Blob URL tells us. */
export type PublicHead = {
  contentType: string | null
  etag: string | null
  lastModified: string | null
  size: number | null
  status: number
}

/**
 * An error whose message this module composed from fixed text, counts and
 * key names only, so it is safe to print in the public Actions log.
 *
 * @remarks Every other error reaching the top-level handler prints a fixed
 * line: a parse error quotes its input, which can be a private pathname,
 * and a library error can quote a connection string or a URL.
 */
export class PublicError extends Error {
  override name = 'PublicError'
}

/**
 * The one line the CLI prints when a run does not complete.
 *
 * @remarks Exported so tests pin the terminal boundary with a sensitive marker:
 * only a {@link PublicError}'s message passes through. Anything else prints a
 * fixed line: an error's `name` is data too, and reading it can throw.
 */
export function publicFailureLine(error: unknown): string {
  if (error instanceof PublicError) {
    return `::error::media backup did not complete: ${error.message}`
  }
  void error
  return '::error::media backup did not complete: an unexpected error (detail withheld from the public log)'
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
  status: 'copied' | 'unchanged' | 'retained' | 'missing' | 'error'
  uploadedAt: string | null
}

/** A dated manifest, written once per run under `manifests/`. */
export type Manifest = {
  /** One entry per pathname the databases name in this run. */
  entries: ManifestEntry[]
  generatedAt: string
  origin: string
  references: number
  /**
   * The last entry of every pathname an earlier run backed up or saw lost and
   * no database names now (a deleted media row, a database restored to an
   * earlier day). Carried forward unchanged on every run, so the newest
   * manifest still maps the file to its last good copy, and a loss once
   * recorded survives the row's absence: a returning row never falls back to
   * an older first copy. Absent from a manifest with nothing to carry.
   */
  unreferenced?: ManifestEntry[]
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

/** Key prefixes. A pathname's first copy mirrors the Blob pathname. */
export const OBJECTS_PREFIX = 'objects/'
export const VERSIONS_PREFIX = 'versions/'
export const MANIFESTS_PREFIX = 'manifests/'

/**
 * Parse the reference query's output (`scripts/media-backup-references.sql`).
 *
 * @remarks Every row is a media file's stored filename, which is its Blob
 * pathname exactly: nothing is read out of URLs or text, so there is no
 * boundary to guess (owner's decision, #328). Throws on a row of any other
 * kind, and when the closing `end` line is absent or its count disagrees, so
 * a failed or truncated query can never pass as "no references".
 */
export function parseReferences(jsonl: string): Reference[] {
  const references: Reference[] = []
  let rows = 0
  let endCount: number | null = null
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line) as {
      count?: number
      kind: string
      value?: unknown
    }
    if (row.kind === 'end') {
      endCount = Number(row.count)
      continue
    }
    rows += 1
    if (
      row.kind !== 'filename' ||
      typeof row.value !== 'string' ||
      !row.value
    ) {
      throw new PublicError('reference query output has a row of unknown kind')
    }
    references.push({ pathname: row.value })
  }
  if (endCount === null) {
    throw new PublicError(
      'reference query output has no end line: it did not complete',
    )
  }
  if (endCount !== rows) {
    throw new PublicError(
      `reference query reported ${endCount} rows but ${rows} arrived`,
    )
  }
  return references
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

/** The shape of every key {@link manifestKey} makes. */
export const CANONICAL_MANIFEST_KEY =
  /^manifests\/\d{4}-\d{2}-\d{2}\/media-manifest-\d{4}-\d{2}-\d{2}T\d{6}Z\.json$/

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
      return await goneFromStore(pathname, base, context)
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
      isBackedUp(prior.status) &&
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
            detail: 'its key was created by another writer during this run',
            status: 'error',
          }
        }
        return { ...found, key, sha256: downloaded.sha256, status: 'copied' }
      } finally {
        // A temporary file left behind must not discard a copy already made.
        await rm(file, { force: true }).catch(() => undefined)
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

/**
 * Back up every pathname the databases name and return the run's manifest.
 *
 * @remarks The previous manifest's entries and its `unreferenced` list are
 * both read, so a pathname that comes back after a run without it resumes
 * from its last recorded state; every pathname not named now is carried into
 * this manifest's `unreferenced` list unchanged.
 */
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
    [
      ...(options.previous?.unreferenced ?? []),
      ...(options.previous?.entries ?? []),
    ].map((entry) => [entry.pathname, entry]),
  )
  await mkdir(options.workDir, { recursive: true })
  const pathnames = uniquePathnames(options.references)
  const named = new Set(pathnames)
  const unreferenced = [...previous.values()].filter(
    (entry) => !named.has(entry.pathname),
  )
  const entries = await mapPool(
    pathnames,
    options.concurrency ?? 4,
    async (pathname) =>
      keepLastGood(
        await backupOne(pathname, {
          deps: options.deps,
          origin: options.origin,
          previous,
          workDir: options.workDir,
        }),
        previous.get(pathname),
        options.deps,
      ),
  )
  return {
    entries,
    generatedAt: options.now.toISOString(),
    origin: options.origin,
    references: options.references.length,
    ...(unreferenced.length > 0 ? { unreferenced } : {}),
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
  verified: number
}

/**
 * An opaque id for a pathname, safe to print in a public log.
 *
 * @remarks Media rows include files only drafts and gated posts use, and this
 * repository's Actions logs are public. A pathname can name unannounced work
 * even when its bytes are public by URL, so logs and summaries carry this id;
 * the private manifest carries the pathname, and `sha256(pathname)` finds it
 * there. A manifest is named the same way, by the id of its key.
 */
export function referenceId(pathname: string): string {
  return createHash('sha256').update(pathname).digest('hex').slice(0, 12)
}

/**
 * The lines a backup run prints to the public log, the first also to the run
 * summary: counts and opaque ids only, never a pathname, key, bucket or
 * error detail.
 */
export function backupReport(
  manifest: Manifest,
  manifestKeyWritten: string,
): string[] {
  const count = (status: ManifestEntry['status']) =>
    manifest.entries.filter((entry) => entry.status === status).length
  const lines = [
    `Media backup: ${manifest.entries.length} files from ${manifest.references} media filenames — ${count('copied')} copied, ${count('unchanged')} unchanged, ${count('retained')} kept though gone from the store, ${count('missing')} missing, ${count('error')} errors; ${manifest.unreferenced?.length ?? 0} no longer named, carried forward. Manifest ${referenceId(manifestKeyWritten)}.`,
  ]
  for (const entry of manifest.entries) {
    if (
      entry.status === 'missing' ||
      entry.status === 'error' ||
      entry.status === 'retained'
    ) {
      lines.push(`  ${entry.status}: ${referenceId(entry.pathname)}`)
    }
  }
  return lines
}

/**
 * The lines a check run prints to the public log, the first also to the run
 * summary: counts, opaque ids and fixed reasons only.
 */
export function checkReport(
  result: CheckResult,
  manifestKeyRead: string,
): string[] {
  return [
    `Media check against manifest ${referenceId(manifestKeyRead)}: ${result.verified} verified, ${result.failures.length} failing.`,
    ...result.failures.map(
      (issue) =>
        `  FAIL ${issue.pathname ? `${referenceId(issue.pathname)} ` : ''}${issue.reason}`,
    ),
  ]
}

/** The detail of an entry whose last good R2 copy was found gone. */
const LOST_COPY_DETAIL = 'its last good R2 copy is gone'

/** The detail of an entry whose last good R2 copy could not be looked up. */
const UNVERIFIED_COPY_DETAIL =
  'R2 did not answer for its last good copy; the next run retries'

/**
 * The prior entry that still names the pathname's last good R2 copy: a backed
 * up entry, or an `error` entry that carried that key forward.
 */
function lastGood(prior: ManifestEntry | undefined): ManifestEntry | null {
  if (!prior?.key) return null
  return isBackedUp(prior.status) || prior.status === 'error' ? prior : null
}

/**
 * Carry the last good R2 mapping through a failed run.
 *
 * @remarks An `error` entry would otherwise record `key: null`, and the
 * newest manifest would forget where the pathname's newest bytes are (say
 * `versions/<pathname>/<etag>`). A later 404 would then fall back to the
 * first copy under `objects/`, an older version, and a restore would follow
 * it. The entry stays `error`, so {@link check} still fails it; only the
 * mapping survives, for the next run and for a person restoring by hand. The
 * carried key is re-checked in R2 first: a copy found gone (R2 answers 404, or
 * another size) is recorded as lost ({@link LOST_COPY_DETAIL}, key `null`),
 * and a loss once recorded stays an error on every later run until a new copy
 * is made, never silently replaced by an older first copy. A lookup that
 * fails (an outage, a refused token) proves nothing either way, so the
 * mapping is kept for the next run to verify.
 */
async function keepLastGood(
  entry: ManifestEntry,
  prior: ManifestEntry | undefined,
  deps: Pick<Deps, 'r2Head'>,
): Promise<ManifestEntry> {
  if (entry.status !== 'error' || entry.key) return entry
  if (entry.detail === LOST_COPY_DETAIL) return entry
  if (prior?.detail === LOST_COPY_DETAIL && !prior.key) {
    // A loss once seen stays an error until a new copy is made.
    return { ...entry, detail: LOST_COPY_DETAIL }
  }
  const good = lastGood(prior)
  if (!good?.key) return entry
  let stored: StoredObject | null
  let detail = entry.detail
  try {
    stored = await deps.r2Head(good.key)
  } catch {
    stored = null
    detail = UNVERIFIED_COPY_DETAIL
  }
  if (
    detail !== UNVERIFIED_COPY_DETAIL &&
    (!stored || stored.size !== good.size)
  ) {
    return { ...entry, detail: LOST_COPY_DETAIL }
  }
  return {
    ...entry,
    detail,
    contentType: good.contentType,
    etag: good.etag,
    key: good.key,
    sha256: good.sha256,
    size: good.size,
    uploadedAt: good.uploadedAt,
  }
}

/** Statuses whose entry names an R2 key holding the pathname's bytes. */
function isBackedUp(status: ManifestEntry['status']): boolean {
  return status === 'copied' || status === 'unchanged' || status === 'retained'
}

/**
 * The entry for a pathname whose public URL answers 404.
 *
 * @remarks A 404 alone is not proof nothing can be restored: an earlier run
 * may hold its bytes. The prior manifest's last good key (carried through a
 * failed run by {@link keepLastGood}, and through runs that did not name the
 * file in `unreferenced`), or, with no prior entry at all, the first-copy key
 * `objects/<pathname>`, is checked in R2, and a copy found there is kept as
 * `retained`, so the newest manifest still maps the pathname to its bytes when
 * older manifests expire. With no copy at either key it is `missing`, which
 * means only "none found there" (a `versions/` copy is not searched for), so
 * {@link check} fails it rather than excusing it; a prior successful key whose
 * object has gone is an `error`.
 */
async function goneFromStore(
  pathname: string,
  base: Omit<ManifestEntry, 'status'>,
  context: { deps: Deps; previous: Map<string, ManifestEntry> },
): Promise<ManifestEntry> {
  const before = context.previous.get(pathname)
  if (before?.detail === LOST_COPY_DETAIL && !before.key) {
    // Seen lost before: never fall back to an older first copy silently.
    return { ...base, detail: LOST_COPY_DETAIL, status: 'error' }
  }
  const prior = lastGood(before)
  if (prior?.key) {
    const stored = await context.deps.r2Head(prior.key)
    if (stored && stored.size === prior.size) {
      return {
        ...prior,
        detail: 'public URL answers 404; earlier R2 copy kept',
        status: 'retained',
      }
    }
    return {
      ...base,
      detail: LOST_COPY_DETAIL,
      status: 'error',
    }
  }
  const firstKey = `${OBJECTS_PREFIX}${pathname}`
  const stored = await context.deps.r2Head(firstKey)
  if (stored) {
    return {
      ...base,
      detail: 'public URL answers 404; earlier R2 copy kept',
      etag: stored.metadata['blob-etag'] ?? null,
      key: firstKey,
      sha256: stored.metadata.sha256 ?? null,
      size: stored.size,
      status: 'retained',
    }
  }
  return { ...base, detail: 'public URL answers 404', status: 'missing' }
}

/**
 * Check that every media file is in the manifest with its bytes in R2.
 *
 * @remarks Fails closed: every file fails unless its manifest entry names an
 * R2 object that answers at the recorded size. A `missing` entry fails, and so
 * does a `retained` one: its bytes are safe in R2, but a media row points at a
 * file the store answers 404 for, so a page is broken and a person decides.
 * Reasons are fixed text: manifest fields are never quoted into them, since
 * they are printed in the public log. A manifest older than `maxAgeHours`
 * fails, so a backup that stopped running cannot keep passing on an old
 * manifest.
 */
export async function check(options: {
  deps: Pick<Deps, 'r2Head'>
  manifest: Manifest
  maxAgeHours?: number
  now: Date
  references: Reference[]
}): Promise<CheckResult> {
  const failures: CheckIssue[] = []
  const ageHours =
    (options.now.getTime() - Date.parse(options.manifest.generatedAt)) / 3.6e6
  if (!(ageHours <= (options.maxAgeHours ?? 36))) {
    failures.push({
      pathname: '',
      reason: `the newest manifest is older than ${options.maxAgeHours ?? 36} hours, or undated`,
    })
  }
  const entries = new Map(
    options.manifest.entries.map((entry) => [entry.pathname, entry]),
  )

  let verified = 0
  for (const pathname of uniquePathnames(options.references)) {
    const entry = entries.get(pathname)
    if (!entry) {
      failures.push({ pathname, reason: 'not in the manifest' })
      continue
    }
    if (entry.status === 'retained') {
      failures.push({
        pathname,
        reason: 'gone from the store (404); an R2 copy is kept',
      })
      continue
    }
    if (
      !isBackedUp(entry.status) ||
      typeof entry.key !== 'string' ||
      !entry.key
    ) {
      failures.push({
        pathname,
        reason:
          entry.status === 'missing'
            ? 'gone from the store (404) and no R2 copy found'
            : 'not backed up in the manifest',
      })
      continue
    }
    const stored = await options.deps.r2Head(entry.key)
    if (
      !stored ||
      typeof entry.size !== 'number' ||
      stored.size !== entry.size
    ) {
      failures.push({
        pathname,
        reason: 'its object is not in R2 at the recorded size',
      })
      continue
    }
    verified += 1
  }
  return { failures, verified }
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
              new PublicError(`aws ${args.slice(0, 2).join(' ')} failed`),
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
  // Only this job's own shape, never whatever else sits under the prefix.
  if (!CANONICAL_MANIFEST_KEY.test(key)) {
    throw new PublicError(
      'the newest object under manifests/ is not one this job wrote',
    )
  }
  return { key, manifest: JSON.parse(await deps.getObject(key)) as Manifest }
}

/**
 * Join the references read from each database, refusing any source that
 * names no media.
 *
 * @remarks Each source is checked on its own, not only their union: an empty
 * production read (a secret pointing at an empty restore, a role that sees
 * no rows) would otherwise hide behind staging's rows, and production-only
 * files would never be backed up while the check passed. Sources are named by
 * position, never by connection string.
 */
export function combineSources(perSource: Reference[][]): Reference[] {
  if (perSource.length === 0)
    throw new PublicError('at least one --refs file is required')
  perSource.forEach((list, index) => {
    if (list.length === 0) {
      throw new PublicError(
        `reference source ${index + 1} of ${perSource.length} names no media at all: refusing to call that clean`,
      )
    }
  })
  return perSource.flat()
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
    else throw new PublicError('unknown argument (see the usage in this file)')
  }
  return { command, out, refs }
}

async function main(argv: string[]): Promise<number> {
  const { command, out, refs } = parseArgs(argv)
  const origin = process.env.MEDIA_BLOB_ORIGIN
  const bucket = process.env.R2_MEDIA_BACKUP_BUCKET
  if (!origin || !bucket) {
    throw new PublicError(
      'MEDIA_BLOB_ORIGIN and R2_MEDIA_BACKUP_BUCKET must be set',
    )
  }
  const references = combineSources(
    (await Promise.all(refs.map((file) => readFile(file, 'utf8')))).map(
      (text) => parseReferences(text),
    ),
  )
  const deps = realDeps(bucket)
  const summary = process.env.GITHUB_STEP_SUMMARY

  if (command === 'backup') {
    if (!out) throw new PublicError('backup needs --out <dir>')
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
      throw new PublicError(
        "a manifest with this run's timestamp already exists",
      )
    }
    const lines = backupReport(manifest, key)
    for (const line of lines) console.log(line)
    if (summary) await writeFile(summary, `${lines[0]}\n`, { flag: 'a' })
    return 0 // the check step decides pass or fail, from the manifest in R2
  }

  if (command === 'check') {
    const prior = await latestManifest(deps)
    if (!prior)
      throw new PublicError(
        'no manifest in the bucket: the backup has never run',
      )
    const result = await check({
      deps,
      manifest: prior.manifest,
      now: new Date(),
      references,
    })
    const lines = checkReport(result, prior.key)
    for (const line of lines) console.log(line)
    if (summary) await writeFile(summary, `${lines[0]}\n`, { flag: 'a' })
    return result.failures.length === 0 ? 0 : 1
  }

  throw new PublicError('unknown command (backup | check)')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(publicFailureLine(error))
      process.exit(2)
    },
  )
}
