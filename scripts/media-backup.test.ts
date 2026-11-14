// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type Deps,
  type Manifest,
  backup,
  backupReport,
  CANONICAL_MANIFEST_KEY,
  candidateKeys,
  check,
  checkReport,
  combineSources,
  manifestKey,
  normalizeEtag,
  PUBLIC_FETCH_HEADERS,
  referenceId,
  unsafePathname,
  parseReferences,
  publicFailureLine,
  PublicError,
  publicUrl,
} from './media-backup'

/**
 * The media backup's decisions (#328): which files it reads, what it copies,
 * where, and that it never replaces bytes already in R2.
 *
 * @remarks Blob and R2 are in-memory fakes with the semantics the script
 * relies on: a public HEAD and GET per pathname, and an R2 whose create-only
 * PUT refuses an existing key the way `If-None-Match: *` does. The fakes count
 * writes, so "never overwrites" is asserted on the bucket, not on a return
 * value.
 */

const ORIGIN = 'https://store.public.blob.vercel-storage.com'

type BlobObject = { bytes: Buffer; contentType: string; etag: string }

function fakes(blob: Map<string, BlobObject>) {
  const bucket = new Map<
    string,
    { bytes: Buffer; metadata: Record<string, string> }
  >()
  const puts: string[] = []
  const downloads: string[] = []
  const byUrl = (url: string) =>
    blob.get(decodeURIComponent(new URL(url).pathname.slice(1)))
  const deps: Deps = {
    async downloadPublic(url, dest) {
      downloads.push(url)
      const object = byUrl(url)
      if (!object) throw new Error('404')
      await writeFile(dest, object.bytes)
      return {
        etag: `"${object.etag}"`,
        sha256: createHash('sha256').update(object.bytes).digest('hex'),
        size: object.bytes.byteLength,
      }
    },
    async headPublic(url) {
      const object = byUrl(url)
      if (!object) {
        return {
          contentType: null,
          etag: null,
          lastModified: null,
          size: null,
          status: 404,
        }
      }
      return {
        contentType: object.contentType,
        etag: `"${object.etag}"`,
        lastModified: 'Fri, 13 Nov 2026 21:33:54 GMT',
        size: object.bytes.byteLength,
        status: 200,
      }
    },
    async r2Head(key) {
      const stored = bucket.get(key)
      return stored
        ? { metadata: stored.metadata, size: stored.bytes.byteLength }
        : null
    },
    async r2PutCreateOnly(key, file, { metadata }) {
      if (bucket.has(key)) return 'exists'
      puts.push(key)
      bucket.set(key, { bytes: await readFile(file), metadata })
      return 'created'
    },
  }
  return { bucket, deps, downloads, puts }
}

const png = (text: string): BlobObject => ({
  bytes: Buffer.from(text),
  contentType: 'image/png',
  etag: createHash('md5').update(text).digest('hex'),
})

const jsonl = (...rows: object[]) =>
  [...rows, { count: rows.length, kind: 'end' }]
    .map((row) => JSON.stringify(row))
    .join('\n')

let workDir: string
beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'media-backup-test-'))
})
afterEach(async () => {
  await rm(workDir, { force: true, recursive: true })
})

const now = new Date('2026-11-14T09:30:12.345Z')

describe('parseReferences', () => {
  it('takes each media filename as its pathname, exactly', () => {
    const refs = parseReferences(
      jsonl(
        { column: 'filename', kind: 'filename', value: 'cover A.png' },
        { column: 'sizes_card_filename', kind: 'filename', value: "a'b c.png" },
      ),
    )
    expect(refs).toEqual([
      { pathname: 'cover A.png' },
      { pathname: "a'b c.png" },
    ])
  })

  it('refuses a row of any other kind, so no URL is ever read out of text', () => {
    for (const row of [
      { kind: 'text', value: `${ORIGIN}/a.png` },
      { kind: 'json', value: '{}' },
      { kind: 'filename', value: '' },
      { kind: 'filename', value: 3 },
    ]) {
      expect(() => parseReferences(jsonl(row))).toThrow('unknown kind')
    }
  })

  it('refuses output with no end line, so a failed query is never "no references"', () => {
    expect(() =>
      parseReferences(JSON.stringify({ kind: 'filename', value: 'a.png' })),
    ).toThrow('did not complete')
  })

  it('refuses output whose row count disagrees with its end line', () => {
    const truncated = [
      JSON.stringify({ kind: 'filename', value: 'a.png' }),
      JSON.stringify({ count: 2, kind: 'end' }),
    ].join('\n')
    expect(() => parseReferences(truncated)).toThrow('2 rows but 1')
  })
})

describe('keys and URLs', () => {
  it('mirrors the Blob pathname under objects/, and a changed file under versions/', () => {
    expect(candidateKeys('covers/a.png', 'abc123')).toEqual([
      'objects/covers/a.png',
      'versions/covers/a.png/abc123',
    ])
  })

  it('encodes each pathname segment the way Blob serves it', () => {
    expect(publicUrl(ORIGIN, 'covers/a b.png')).toBe(
      `${ORIGIN}/covers/a%20b.png`,
    )
  })

  it('asks Blob for uncompressed bytes, so size and etag survive the CDN', () => {
    expect(PUBLIC_FETCH_HEADERS).toEqual({ 'accept-encoding': 'identity' })
  })

  it('strips quotes and the weak prefix from an etag', () => {
    expect(normalizeEtag('W/"abc"')).toBe('abc')
    expect(normalizeEtag(null)).toBeNull()
  })

  it('dates manifest keys so the greatest key is the newest', () => {
    expect(manifestKey(now)).toBe(
      'manifests/2026-11-14/media-manifest-2026-11-14T093012Z.json',
    )
    expect(
      manifestKey(new Date('2026-11-15T00:00:00Z')) > manifestKey(now),
    ).toBe(true)
  })
})

describe('what public output may carry (#328 security review F2)', () => {
  it('prints only messages this module composed when a run does not complete', () => {
    let parseError: unknown
    try {
      JSON.parse('{"entries":unannounced-project.png}')
    } catch (error) {
      parseError = error
    }
    const line = publicFailureLine(parseError)
    expect(line).not.toContain('unannounced')
    expect(line).toContain('detail withheld')
    // An error's name is data too, and reading it can throw.
    const named = Object.assign(new Error('x'), { name: 'secret-marker' })
    expect(publicFailureLine(named)).not.toContain('secret-marker')
    const hostile = new Error('x')
    Object.defineProperty(hostile, 'name', {
      get() {
        throw new Error('secret-marker')
      },
    })
    expect(() => publicFailureLine(hostile)).not.toThrow()
    expect(
      publicFailureLine(new Error('postgresql://u:secret-marker@h/db')),
    ).not.toContain('secret-marker')
    expect(publicFailureLine('secret-marker')).not.toContain('secret-marker')
    expect(
      publicFailureLine(new PublicError('aws s3api head-object failed')),
    ).toBe(
      '::error::media backup did not complete: aws s3api head-object failed',
    )
  })

  it('names a pathname by an opaque, stable id', () => {
    const id = referenceId('unannounced-project.png')
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(id).toBe(referenceId('unannounced-project.png'))
    expect(id).not.toContain('unannounced')
  })

  it('keeps pathnames and keys out of every check reason', async () => {
    const pathname = 'unannounced-project.png'
    const result = await check({
      deps: { r2Head: async () => null },
      manifest: {
        entries: [
          {
            contentType: null,
            detail: `GET https://x/${pathname} answered 500`,
            etag: 'e',
            key: `objects/${pathname}`,
            pathname,
            sha256: null,
            size: 1,
            status: 'error',
            uploadedAt: null,
          },
        ],
        generatedAt: now.toISOString(),
        origin: ORIGIN,
        references: 1,
        version: 1,
      },
      now,
      references: [{ pathname }, { pathname: 'gone.png' }],
    })
    for (const issue of result.failures) {
      expect(issue.reason).not.toContain('unannounced')
      expect(issue.reason).not.toContain('gone')
    }
  })
})

describe('public report lines (#328 re-review of b0ab4b7, finding 5)', () => {
  const marker = 'SYNTHETIC_PRIVATE_MARKER'
  const key = `manifests/2026-11-14/media-manifest-2026-11-14T093012Z.json`
  const entryOf = (status: 'copied' | 'error' | 'missing' | 'retained') => ({
    contentType: null,
    detail: `GET https://x/${marker}.png answered 500`,
    etag: null,
    key: `objects/${marker}-${status}.png`,
    pathname: `${marker}-${status}.png`,
    sha256: null,
    size: 1,
    status,
    uploadedAt: null,
  })

  it('names files and manifests by id only, never a pathname, key or detail', () => {
    const manifest: Manifest = {
      entries: [
        entryOf('copied'),
        entryOf('error'),
        entryOf('missing'),
        entryOf('retained'),
      ],
      generatedAt: now.toISOString(),
      origin: ORIGIN,
      references: 4,
      unreferenced: [entryOf('copied')],
      version: 1,
    }
    const lines = [
      ...backupReport(manifest, key),
      ...checkReport(
        {
          failures: [
            { pathname: `${marker}.png`, reason: 'not in the manifest' },
            {
              pathname: '',
              reason: 'the newest manifest is older than 36 hours, or undated',
            },
          ],
          verified: 1,
        },
        key,
      ),
    ]
    expect(lines[0]).toContain('1 no longer named, carried forward')
    expect(lines.join('\n')).toContain(referenceId(key))
    for (const line of lines) {
      expect(line).not.toContain(marker)
      expect(line).not.toContain('manifests/')
      expect(line).not.toContain('objects/')
      expect(line).not.toContain('r2://')
      expect(line).not.toContain(ORIGIN)
    }
  })
})

describe('unsafePathname', () => {
  it('passes an ordinary pathname, folders included', () => {
    expect(unsafePathname('covers/my post-cover A.png')).toBeNull()
  })

  it('refuses dot segments, empty segments and control characters', () => {
    expect(unsafePathname('a/../manifests/x.json')).toMatch(/segment/)
    expect(unsafePathname('./a.png')).toMatch(/segment/)
    expect(unsafePathname('/a.png')).toMatch(/segment/)
    expect(unsafePathname('a//b.png')).toMatch(/segment/)
    expect(unsafePathname('a\nb.png')).toBe('control character')
  })

  it("refuses a pathname whose key would pass R2's 1,024-byte limit", () => {
    expect(unsafePathname('é'.repeat(451))).toMatch(/900 bytes/)
  })

  it('records an unsafe pathname as an error without fetching it', async () => {
    const { deps, downloads } = fakes(new Map())
    let heads = 0
    deps.headPublic = async () => {
      heads += 1
      throw new Error('must not be called')
    }
    const manifest = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: [{ pathname: 'a/../b.png' }],
      workDir,
    })
    expect(manifest.entries[0]).toMatchObject({ status: 'error' })
    expect(heads).toBe(0)
    expect(downloads).toHaveLength(0)
  })
})

describe('backup', () => {
  const refs = [
    { pathname: 'a.png' },
    { pathname: 'a.png' },
    { pathname: 'b.png' },
  ]

  it('copies each referenced pathname once, to objects/<pathname>', async () => {
    const blob = new Map([
      ['a.png', png('A1')],
      ['b.png', png('B1')],
    ])
    const { bucket, deps, puts } = fakes(blob)
    const manifest = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs,
      workDir,
    })
    expect([...puts].sort()).toEqual(['objects/a.png', 'objects/b.png'])
    expect(manifest.entries.map((entry) => entry.status)).toEqual([
      'copied',
      'copied',
    ])
    expect(bucket.get('objects/a.png')?.bytes.toString()).toBe('A1')
    expect(bucket.get('objects/a.png')?.metadata['blob-etag']).toBe(
      blob.get('a.png')?.etag,
    )
    expect(manifest.references).toBe(3)
  })

  it('carries an unchanged pathname forward without downloading it again', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { deps, downloads, puts } = fakes(blob)
    const first = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    const second = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: first,
      references: refs.slice(0, 1),
      workDir,
    })
    expect(second.entries[0]).toMatchObject({
      key: 'objects/a.png',
      status: 'unchanged',
    })
    expect(downloads).toHaveLength(1)
    expect(puts).toHaveLength(1)
  })

  it('stores a changed file under a new key and never touches the first copy', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { bucket, deps, puts } = fakes(blob)
    const first = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    blob.set('a.png', png('A2-overwritten'))
    const second = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: first,
      references: refs.slice(0, 1),
      workDir,
    })
    const versionKey = `versions/a.png/${blob.get('a.png')?.etag}`
    expect(second.entries[0]).toMatchObject({
      key: versionKey,
      status: 'copied',
    })
    expect(puts).toEqual(['objects/a.png', versionKey])
    expect(bucket.get('objects/a.png')?.bytes.toString()).toBe('A1')
  })

  it('recognises bytes already in R2 when the previous manifest has expired', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { deps, puts } = fakes(blob)
    await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    const again = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    expect(again.entries[0].status).toBe('unchanged')
    expect(puts).toHaveLength(1)
  })

  it('never lets another existing object stand in for the named one', async () => {
    // A filename is the pathname exactly: `release` existing changes nothing.
    const blob = new Map([
      ['release!', png('ACTUAL')],
      ['release', png('OTHER')],
    ])
    const { bucket, deps, puts } = fakes(blob)
    const references = parseReferences(
      jsonl({ column: 'filename', kind: 'filename', value: 'release!' }),
    )
    const manifest = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references,
      workDir,
    })
    expect(puts).toEqual(['objects/release!'])
    expect(bucket.get('objects/release!')?.bytes.toString()).toBe('ACTUAL')
    const result = await check({ deps, manifest, now, references })
    expect(result).toEqual({ failures: [], verified: 1 })
  })

  it('keeps a lost newest copy an error on every later run, never falling back to an older first copy', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { bucket, deps } = fakes(blob)
    const run = (previous: Manifest | null) =>
      backup({
        deps,
        now,
        origin: ORIGIN,
        previous,
        references: refs.slice(0, 1),
        workDir,
      })
    const first = await run(null)
    blob.set('a.png', png('A2-newest'))
    const second = await run(first)
    const newest = second.entries[0].key as string
    expect(newest).toMatch(/^versions\//)
    bucket.delete(newest)
    // Source still answers with A2, but the download fails: the carried key
    // is re-checked and found gone.
    const realDownload = deps.downloadPublic
    deps.downloadPublic = async () => {
      throw new Error('socket hang up')
    }
    const third = await run(second)
    expect(third.entries[0]).toMatchObject({ key: null, status: 'error' })
    deps.downloadPublic = realDownload
    blob.delete('a.png')
    let previous = third
    for (let round = 0; round < 3; round += 1) {
      const next = await run(previous)
      expect(next.entries[0]).toMatchObject({ key: null, status: 'error' })
      previous = next
    }
    const result = await check({
      deps,
      manifest: previous,
      now,
      references: [{ pathname: 'a.png' }],
    })
    expect(result.failures).toHaveLength(1)
  })

  it('keeps a recorded loss through runs that do not name the file, so its return is never clean on older bytes', async () => {
    // Re-review of b0ab4b7, finding 3: a run without the row dropped the loss.
    const blob = new Map([
      ['a.png', png('A1')],
      ['b.png', png('B1')],
    ])
    const { bucket, deps } = fakes(blob)
    const run = (previous: Manifest | null, names: string[]) =>
      backup({
        deps,
        now,
        origin: ORIGIN,
        previous,
        references: names.map((pathname) => ({ pathname })),
        workDir,
      })
    const first = await run(null, ['a.png', 'b.png'])
    blob.set('a.png', png('A2-newest'))
    const second = await run(first, ['a.png', 'b.png'])
    const newest = second.entries[0].key as string
    expect(newest).toMatch(/^versions\//)
    bucket.delete(newest)
    blob.delete('a.png')
    const lost = await run(second, ['a.png', 'b.png'])
    expect(lost.entries[0]).toMatchObject({ key: null, status: 'error' })

    // The row goes away for a run (deleted, or a restore to an earlier day)...
    const without = await run(lost, ['b.png'])
    expect(without.entries.map((e) => e.pathname)).toEqual(['b.png'])
    expect(without.unreferenced).toEqual([lost.entries[0]])
    const still = await run(without, ['b.png'])
    expect(still.unreferenced).toEqual([lost.entries[0]])

    // ...and comes back: still lost, never `retained` on objects/a.png (A1).
    const back = await run(still, ['a.png', 'b.png'])
    expect(back.entries[0]).toMatchObject({ key: null, status: 'error' })
    expect(back.unreferenced).toBeUndefined()
    const result = await check({
      deps,
      manifest: back,
      now,
      references: [{ pathname: 'a.png' }, { pathname: 'b.png' }],
    })
    expect(result.failures).toEqual([
      { pathname: 'a.png', reason: 'not backed up in the manifest' },
    ])
  })

  it('carries a file no longer named with its last good mapping, for a restore by hand', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { deps } = fakes(blob)
    const first = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: [{ pathname: 'a.png' }],
      workDir,
    })
    const next = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: first,
      references: [{ pathname: 'b.png' }],
      workDir,
    })
    expect(next.unreferenced).toEqual([first.entries[0]])
    expect(next.unreferenced?.[0]).toMatchObject({ key: 'objects/a.png' })
  })

  it('keeps the mapping when R2 cannot be asked, rather than recording a loss', async () => {
    // Re-review of b0ab4b7, finding 4: a transient R2 error became permanent.
    const blob = new Map([['a.png', png('A1')]])
    const { deps } = fakes(blob)
    const run = (previous: Manifest | null) =>
      backup({
        deps,
        now,
        origin: ORIGIN,
        previous,
        references: [{ pathname: 'a.png' }],
        workDir,
      })
    const first = await run(null)
    const realHead = deps.headPublic
    const realR2Head = deps.r2Head
    deps.headPublic = async () => {
      throw new Error('socket hang up')
    }
    deps.r2Head = async () => {
      throw new Error('503 Service Unavailable')
    }
    const outage = await run(first)
    expect(outage.entries[0]).toMatchObject({
      key: 'objects/a.png',
      status: 'error',
    })
    expect(outage.entries[0].detail).toContain('next run retries')

    // R2 recovers and the store answers 404: the intact copy is kept.
    deps.headPublic = realHead
    deps.r2Head = realR2Head
    blob.delete('a.png')
    const recovered = await run(outage)
    expect(recovered.entries[0]).toMatchObject({
      key: 'objects/a.png',
      status: 'retained',
    })
  })

  it('keeps the newest copy mapped through a failed run, so a later 404 restores it, not the first copy', async () => {
    // CodeRabbit preflight, push 1 of PR 2: A1 under objects/, A2 under
    // versions/, a failed HEAD, then a 404.
    const blob = new Map([['a.png', png('A1')]])
    const { deps } = fakes(blob)
    const run = (previous: Manifest | null) =>
      backup({
        deps,
        now,
        origin: ORIGIN,
        previous,
        references: refs.slice(0, 1),
        workDir,
      })
    const first = await run(null)
    blob.set('a.png', png('A2-longer'))
    const second = await run(first)
    const newest = second.entries[0].key
    expect(newest).toMatch(/^versions\/a\.png\//)

    const realHead = deps.headPublic
    deps.headPublic = async () => {
      throw new Error('socket hang up')
    }
    const failed = await run(second)
    expect(failed.entries[0]).toMatchObject({ key: newest, status: 'error' })
    // Still a failure for the check: only the mapping survives.
    expect(
      (
        await check({
          deps,
          manifest: failed,
          now,
          references: refs.slice(0, 1),
        })
      ).failures,
    ).toHaveLength(1)

    deps.headPublic = realHead
    blob.delete('a.png')
    const gone = await run(failed)
    expect(gone.entries[0]).toMatchObject({ key: newest, status: 'retained' })
  })

  it('keeps an earlier R2 copy of a file the store now answers 404 for', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { bucket, deps } = fakes(blob)
    const first = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    blob.delete('a.png')
    const second = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: first,
      references: refs.slice(0, 1),
      workDir,
    })
    expect(second.entries[0]).toMatchObject({
      key: 'objects/a.png',
      size: first.entries[0].size,
      status: 'retained',
    })
    // With no manifest at all, the first-copy key is found in R2 directly.
    const cold = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    expect(cold.entries[0]).toMatchObject({
      key: 'objects/a.png',
      status: 'retained',
    })
    // A prior key whose object has gone is an error, never a clean "missing".
    bucket.delete('objects/a.png')
    const lost = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: first,
      references: refs.slice(0, 1),
      workDir,
    })
    expect(lost.entries[0]).toMatchObject({ key: null, status: 'error' })
  })

  it('records a 404 as missing and a failure as error, and keeps going', async () => {
    const blob = new Map([['b.png', png('B1')]])
    const { deps } = fakes(blob)
    deps.headPublic = async (url) => {
      if (url.endsWith('/c.png')) throw new Error('socket hang up')
      return fakes(blob).deps.headPublic(url)
    }
    const manifest = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: [
        { pathname: 'a.png' },
        { pathname: 'c.png' },
        { pathname: 'b.png' },
      ],
      workDir,
    })
    expect(
      manifest.entries.map((entry) => [entry.pathname, entry.status]),
    ).toEqual([
      ['a.png', 'missing'],
      ['c.png', 'error'],
      ['b.png', 'copied'],
    ])
  })

  it('reports a create-only refusal as an error, not as a copy', async () => {
    const blob = new Map([['a.png', png('A1')]])
    const { deps } = fakes(blob)
    deps.r2PutCreateOnly = async () => 'exists'
    const manifest = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references: refs.slice(0, 1),
      workDir,
    })
    expect(manifest.entries[0]).toMatchObject({ status: 'error' })
  })
})

describe('check', () => {
  const manifestOf = (
    entries: Manifest['entries'],
    generatedAt = now.toISOString(),
  ): Manifest => ({
    entries,
    generatedAt,
    origin: ORIGIN,
    references: entries.length,
    version: 1,
  })

  const entry = (pathname: string, key: string | null, size = 2) => ({
    contentType: 'image/png',
    etag: 'e',
    key,
    pathname,
    sha256: null,
    size,
    status: 'copied' as const,
    uploadedAt: null,
  })

  const r2 = (keys: Record<string, number>) => ({
    r2Head: async (key: string) =>
      key in keys ? { metadata: {}, size: keys[key] } : null,
  })

  it('passes when every reference is in the manifest and in R2', async () => {
    const result = await check({
      deps: r2({ 'objects/a.png': 2 }),
      manifest: manifestOf([entry('a.png', 'objects/a.png')]),
      now,
      references: [{ pathname: 'a.png' }],
    })
    expect(result).toEqual({ failures: [], verified: 1 })
  })

  it('fails a reference absent from the manifest, or whose object is gone', async () => {
    const result = await check({
      deps: r2({}),
      manifest: manifestOf([entry('a.png', 'objects/a.png')]),
      now,
      references: [{ pathname: 'a.png' }, { pathname: 'b.png' }],
    })
    expect(result.failures).toEqual([
      {
        pathname: 'a.png',
        reason: 'its object is not in R2 at the recorded size',
      },
      { pathname: 'b.png', reason: 'not in the manifest' },
    ])
  })

  it('never quotes manifest fields into a reason, since reasons are public', async () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER'
    const result = await check({
      deps: r2({ 'objects/a.png': 3, 'objects/b.png': 3 }),
      manifest: manifestOf([
        { ...entry('a.png', 'objects/a.png'), status: marker as never },
        { ...entry('b.png', 'objects/b.png'), size: marker as never },
      ]),
      now,
      references: [{ pathname: 'a.png' }, { pathname: 'b.png' }],
    })
    expect(result.failures).toHaveLength(2)
    for (const issue of result.failures) {
      expect(issue.reason).not.toContain(marker)
    }
  })

  it('fails a kept copy: its bytes are safe, but a media row names a 404', async () => {
    const result = await check({
      deps: r2({ 'objects/a.png': 2 }),
      manifest: manifestOf([
        { ...entry('a.png', 'objects/a.png'), status: 'retained' as const },
      ]),
      now,
      references: [{ pathname: 'a.png' }],
    })
    expect(result).toEqual({
      failures: [
        {
          pathname: 'a.png',
          reason: 'gone from the store (404); an R2 copy is kept',
        },
      ],
      verified: 0,
    })
  })

  it('fails a file the store answers 404 for, once however often it is named', async () => {
    const result = await check({
      deps: r2({}),
      manifest: manifestOf([
        { ...entry('a.png', null), status: 'missing' as const },
      ]),
      now,
      references: [{ pathname: 'a.png' }, { pathname: 'a.png' }],
    })
    expect(result.failures).toEqual([
      {
        pathname: 'a.png',
        reason: 'gone from the store (404) and no R2 copy found',
      },
    ])
  })

  it('fails a stale manifest, so a stopped backup cannot keep passing', async () => {
    const result = await check({
      deps: r2({ 'objects/a.png': 2 }),
      manifest: manifestOf(
        [entry('a.png', 'objects/a.png')],
        '2026-11-12T09:00:00.000Z',
      ),
      now,
      references: [{ pathname: 'a.png' }],
    })
    expect(result.failures[0]).toMatchObject({
      pathname: '',
      reason: expect.stringMatching(/older than 36 hours/),
    })
  })
})

describe('combineSources', () => {
  const ref = (pathname: string) => ({ pathname })

  it('joins every source', () => {
    expect(combineSources([[ref('a.png')], [ref('b.png')]])).toEqual([
      ref('a.png'),
      ref('b.png'),
    ])
  })

  it('refuses one empty source even when the other has rows', () => {
    expect(() => combineSources([[ref('a.png')], []])).toThrow(
      'reference source 2 of 2 names no media at all',
    )
  })

  it('refuses no sources', () => {
    expect(() => combineSources([])).toThrow('at least one --refs file')
  })
})

describe('CANONICAL_MANIFEST_KEY', () => {
  it('accepts every key this job makes, and nothing else under manifests/', () => {
    expect(CANONICAL_MANIFEST_KEY.test(manifestKey(now))).toBe(true)
    expect(
      CANONICAL_MANIFEST_KEY.test('manifests/SYNTHETIC_PRIVATE_MARKER.json'),
    ).toBe(false)
    expect(
      CANONICAL_MANIFEST_KEY.test(`${manifestKey(now)}/../private.json`),
    ).toBe(false)
  })
})
