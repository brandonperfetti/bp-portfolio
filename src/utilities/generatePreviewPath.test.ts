import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import { generatePreviewPath } from './generatePreviewPath'

const req = {} as PayloadRequest

/** The `path` search param the admin preview route will be handed. */
const previewedPath = (url: string | null) =>
  url === null ? null : new URLSearchParams(url.split('?')[1]).get('path')

describe('generatePreviewPath', () => {
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

  it('carries the preview secret', () => {
    const url = generatePreviewPath({
      collection: 'pages',
      doc: { slug: 'now' },
      req,
    })
    expect(url).toMatch(/^\/next\/preview\?/)
    expect(new URLSearchParams(url!.split('?')[1]).has('previewSecret')).toBe(
      true,
    )
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
