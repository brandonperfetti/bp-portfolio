import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import { generatePreviewPath } from './generatePreviewPath'

const req = {} as PayloadRequest

/** The `path` search param the admin preview route will be handed. */
const previewedPath = (url: string | null) =>
  url === null ? null : new URLSearchParams(url.split('?')[1]).get('path')

describe('generatePreviewPath', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('previews a top-level page at its own path', () => {
    expect(
      previewedPath(
        generatePreviewPath({ collection: 'pages', doc: { slug: 'now' }, req }),
      ),
    ).toBe('/now')
  })

  it('previews a PLACED page at its full nested path (#148)', () => {
    // The bug the deleted `collectionPrefixMap` guaranteed: a slug-only preview
    // opens `/brytecore`, a URL that never existed.
    expect(
      previewedPath(
        generatePreviewPath({
          collection: 'pages',
          doc: { slug: 'brytecore', path: 'work/brytecore' },
          req,
        }),
      ),
    ).toBe('/work/brytecore')
  })

  it('previews the root page at /', () => {
    expect(
      previewedPath(
        generatePreviewPath({
          collection: 'pages',
          doc: { slug: 'home' },
          req,
        }),
      ),
    ).toBe('/')
  })

  it('previews a post under /articles — the preserved v3 shape', () => {
    expect(
      previewedPath(
        generatePreviewPath({
          collection: 'posts',
          slug: 'hello-world',
          req,
        }),
      ),
    ).toBe('/articles/hello-world')
  })

  it('previews a PLACED post at its placed path (#153)', () => {
    // The Posts mirror of the `/brytecore` bug above: a placed article's URL
    // is a section path, and previewing it at `/articles/<slug>` only lands
    // by riding the article route's 308.
    expect(
      previewedPath(
        generatePreviewPath({
          collection: 'posts',
          doc: { slug: 'brytecore-launch', path: 'work/brytecore-launch' },
          req,
        }),
      ),
    ).toBe('/work/brytecore-launch')
  })

  it('previews an UNPLACED post under /articles when handed the whole doc', () => {
    // `path: null` is the state of every article that exists today, and the
    // doc-shaped call must agree with the slug-only one on it.
    expect(
      previewedPath(
        generatePreviewPath({
          collection: 'posts',
          doc: { slug: 'hello-world', path: null },
          req,
        }),
      ),
    ).toBe('/articles/hello-world')
  })

  it('encodes each segment without encoding the separators', () => {
    expect(
      previewedPath(
        generatePreviewPath({
          collection: 'pages',
          doc: { slug: 'a b', path: 'work/a b' },
          req,
        }),
      ),
    ).toBe('/work/a%20b')
  })

  it('carries only the path: no secret or other credential (#275)', () => {
    // The admin's preview URL is written to request logs and browser history,
    // so it must hold nothing a reader could replay. Set a secret in the
    // environment to prove the URL ignores it rather than happening to lack it.
    const secret = 'fixture-preview-secret-0123456789'
    vi.stubEnv('PREVIEW_SECRET', secret)
    vi.stubEnv('PAYLOAD_SECRET', 'fixture-payload-secret')
    const url = generatePreviewPath({
      collection: 'pages',
      doc: { slug: 'now', path: 'work/now' },
      req,
    })
    expect(url).toMatch(/^\/next\/preview\?/)
    const params = new URLSearchParams(String(url).split('?')[1])
    expect([...params.keys()]).toEqual(['path'])
    expect(String(url)).not.toContain(secret)
    expect(String(url)).not.toContain('fixture-payload-secret')
  })

  it('returns null when the document has no public path yet', () => {
    expect(
      generatePreviewPath({ collection: 'pages', doc: {}, req }),
    ).toBeNull()
    expect(
      generatePreviewPath({ collection: 'pages', slug: undefined, req }),
    ).toBeNull()
    expect(generatePreviewPath({ collection: 'pages', slug: null, req })).toBe(
      null,
    )
  })

  it('makes a call that names neither a doc nor a slug a TYPE error', () => {
    // The discriminated union is the point: supplying neither used to compile
    // and hand the admin a null preview URL, which renders as a dead button.
    // @ts-expect-error - PreviewTarget requires exactly one of doc | slug
    generatePreviewPath({ collection: 'pages', req })
    // @ts-expect-error - and never both
    generatePreviewPath({
      collection: 'pages',
      doc: { slug: 'a' },
      slug: 'b',
      req,
    })
  })
})
