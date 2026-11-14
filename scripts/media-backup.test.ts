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
  CANONICAL_MANIFEST_KEY,
  candidateKeys,
  check,
  combineSources,
  manifestKey,
  normalizeEtag,
  PUBLIC_FETCH_HEADERS,
  referenceId,
  unsafePathname,
  parseReferences,
  pathnameFromUrl,
  publicFailureLine,
  PublicError,
  publicUrl,
  trimUrlTail,
} from './media-backup'

/**
 * The media backup's decisions (#328): which references it finds, what it
 * copies, where, and that it never replaces bytes already in R2.
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
  it('takes media filenames and every store URL inside text, unescaping XML', () => {
    const refs = parseReferences(
      jsonl(
        { kind: 'filename', table: 'media', value: 'cover A.png' },
        {
          kind: 'text',
          table: 'posts',
          value: `see ${ORIGIN}/covers/x%20y.png?w=2 and {&quot;src&quot;:&quot;${ORIGIN}/b.svg&quot;} https://other.public.blob.vercel-storage.com/z.png`,
        },
      ),
      ORIGIN,
    )
    expect(refs).toEqual([
      { pathname: 'cover A.png', table: 'media' },
      { pathname: 'covers/x y.png', table: 'posts' },
      { pathname: 'b.svg', table: 'posts' },
    ])
  })

  it('keeps brackets a pathname holds, and drops those of the text around it', () => {
    const own = publicUrl(ORIGIN, 'release(1).png')
    const refs = parseReferences(
      jsonl(
        { kind: 'text', table: '_posts_v', value: `{"src":"${own}"}` },
        { kind: 'text', table: 'posts', value: `(see ${ORIGIN}/a.png).` },
        { kind: 'text', table: 'posts', value: `[x](${ORIGIN}/b[2].png)` },
      ),
      ORIGIN,
    )
    expect(refs.map((ref) => ref.pathname)).toEqual([
      'release(1).png',
      'a.png',
      'b[2].png',
    ])
    expect(trimUrlTail(`${own}),`)).toBe(own)
  })

  it('refuses output with no end line, so a failed query is never "no references"', () => {
    expect(() =>
      parseReferences(
        JSON.stringify({ kind: 'filename', table: 'media', value: 'a.png' }),
        ORIGIN,
      ),
    ).toThrow('did not complete')
  })

  it('refuses output whose row count disagrees with its end line', () => {
    const truncated = [
      JSON.stringify({ kind: 'filename', table: 'media', value: 'a.png' }),
      JSON.stringify({ count: 2, kind: 'end' }),
    ].join('\n')
    expect(() => parseReferences(truncated, ORIGIN)).toThrow('2 rows but 1')
  })
})

describe('keys and URLs', () => {
  it('mirrors the Blob pathname under objects/, and a changed file under versions/', () => {
    expect(candidateKeys('covers/a.png', 'abc123')).toEqual([
      'objects/covers/a.png',
      'versions/covers/a.png/abc123',
    ])
  })

  it('encodes each pathname segment the way Blob serves it, and decodes back', () => {
    const url = publicUrl(ORIGIN, 'covers/a b.png')
    expect(url).toBe(`${ORIGIN}/covers/a%20b.png`)
    expect(pathnameFromUrl(url)).toBe('covers/a b.png')
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
      references: [
        { pathname, table: 'posts' },
        { pathname: 'gone.png', table: 'posts' },
      ],
    })
    for (const issue of result.failures) {
      expect(issue.reason).not.toContain('unannounced')
      expect(issue.reason).not.toContain('gone')
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
      references: [{ pathname: 'a/../b.png', table: 'posts' }],
      workDir,
    })
    expect(manifest.entries[0]).toMatchObject({ status: 'error' })
    expect(heads).toBe(0)
    expect(downloads).toHaveLength(0)
  })
})

describe('backup', () => {
  const refs = [
    { pathname: 'a.png', table: 'media' },
    { pathname: 'a.png', table: 'posts' },
    { pathname: 'b.png', table: 'media' },
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

  it('fails closed when a URL read from markup is cut wrong (extract, back up, check)', async () => {
    // The review's counterexamples: a valid final `!`, and CSS `url(...)`.
    const blob = new Map([
      ['release!', png('R1')],
      ['a.png', png('A1')],
    ])
    const { deps } = fakes(blob)
    const references = parseReferences(
      jsonl(
        {
          kind: 'text',
          table: '_posts_v',
          value: `{"src":"${publicUrl(ORIGIN, 'release!')}"}`,
        },
        {
          kind: 'text',
          table: '_posts_v',
          value: `<div style="background-image:url(${ORIGIN}/a.png);color:red">x</div>`,
        },
      ),
      ORIGIN,
    )
    const manifest = await backup({
      deps,
      now,
      origin: ORIGIN,
      previous: null,
      references,
      workDir,
    })
    const result = await check({ deps, manifest, now, references })
    // Whatever extraction guessed, a derived URL that 404s is never clean.
    const derived404 = manifest.entries.filter((e) => e.status === 'missing')
    expect(result.failures.length).toBeGreaterThanOrEqual(derived404.length)
    expect(result.history).toEqual([])
    expect(result.failures.length + result.verified).toBe(
      new Set(references.map((r) => r.pathname)).size,
    )
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
        { pathname: 'a.png', table: 'media' },
        { pathname: 'c.png', table: 'media' },
        { pathname: 'b.png', table: 'media' },
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
      references: [{ pathname: 'a.png', table: 'media' }],
    })
    expect(result).toEqual({ failures: [], history: [], verified: 1 })
  })

  it('fails a reference absent from the manifest, or whose object is gone', async () => {
    const result = await check({
      deps: r2({}),
      manifest: manifestOf([entry('a.png', 'objects/a.png')]),
      now,
      references: [
        { pathname: 'a.png', table: 'media' },
        { pathname: 'b.png', table: 'posts' },
      ],
    })
    expect(result.failures).toEqual([
      {
        pathname: 'a.png',
        reason: 'its object is not in R2 at the recorded size',
      },
      { pathname: 'b.png', reason: 'not in the manifest' },
    ])
  })

  it('fails, never excuses, a history-only file the store answers 404 for', async () => {
    // A 404 proves only that the derived URL is gone: the URL may have been
    // cut wrong from prose, or a copy may sit under versions/.
    const result = await check({
      deps: r2({}),
      manifest: manifestOf([
        { ...entry('old.png', null), status: 'missing' as const },
      ]),
      now,
      references: [{ pathname: 'old.png', table: '_posts_v_blocks_media' }],
    })
    expect(result.history).toEqual([])
    expect(result.failures).toEqual([
      {
        pathname: 'old.png',
        reason: 'gone from the store (404) and no R2 copy found',
      },
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
      references: [
        { pathname: 'a.png', table: 'media' },
        { pathname: 'b.png', table: 'media' },
      ],
    })
    expect(result.failures).toHaveLength(2)
    for (const issue of result.failures) {
      expect(issue.reason).not.toContain(marker)
    }
  })

  it('fails a history-only file that is in the store but not backed up: it may be a current draft', async () => {
    const result = await check({
      deps: r2({}),
      manifest: manifestOf([
        { ...entry('draft-error.png', null), status: 'error' as const },
        entry('draft-gone.png', 'objects/draft-gone.png'),
      ]),
      now,
      references: [
        { pathname: 'draft-absent.png', table: '_posts_v_blocks_media' },
        { pathname: 'draft-error.png', table: '_pages_v_version_hero_slides' },
        { pathname: 'draft-gone.png', table: '_posts_v' },
      ],
    })
    expect(result.history).toEqual([])
    expect(result.failures).toEqual([
      { pathname: 'draft-absent.png', reason: 'not in the manifest' },
      { pathname: 'draft-error.png', reason: 'not backed up in the manifest' },
      {
        pathname: 'draft-gone.png',
        reason: 'its object is not in R2 at the recorded size',
      },
    ])
  })

  it('verifies a kept copy for history, and fails it for a live page', async () => {
    const kept = {
      ...entry('a.png', 'objects/a.png'),
      status: 'retained' as const,
    }
    const history = await check({
      deps: r2({ 'objects/a.png': 2 }),
      manifest: manifestOf([kept]),
      now,
      references: [{ pathname: 'a.png', table: '_posts_v' }],
    })
    expect(history).toEqual({
      failures: [],
      history: [
        {
          pathname: 'a.png',
          reason: 'gone from the store (404); an R2 copy is kept',
        },
      ],
      verified: 1,
    })
    const live = await check({
      deps: r2({ 'objects/a.png': 2 }),
      manifest: manifestOf([kept]),
      now,
      references: [{ pathname: 'a.png', table: 'posts' }],
    })
    expect(live.failures).toEqual([
      {
        pathname: 'a.png',
        reason: 'gone from the store (404); an R2 copy is kept',
      },
    ])
  })

  it('fails a live reference the store answers 404 for', async () => {
    const result = await check({
      deps: r2({}),
      manifest: manifestOf([
        { ...entry('a.png', null), status: 'missing' as const },
      ]),
      now,
      references: [
        { pathname: 'a.png', table: 'media' },
        { pathname: 'a.png', table: '_posts_v' },
      ],
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
      references: [{ pathname: 'a.png', table: 'media' }],
    })
    expect(result.failures[0]).toMatchObject({
      pathname: '',
      reason: expect.stringMatching(/older than 36 hours/),
    })
  })
})

describe('combineSources', () => {
  const ref = (pathname: string) => ({ pathname, table: 'media' })

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
