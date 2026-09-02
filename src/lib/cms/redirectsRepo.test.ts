import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find: mocks.find })),
}))

import {
  getCmsRedirects,
  getRedirectForPath,
  normalizeRedirectPath,
  resolveRedirect,
} from '@/lib/cms/redirectsRepo'

/**
 * The redirect reader (#120 part C).
 *
 * Before this module nothing in `src/` read the `redirects` collection at all
 * — a row was inert. These tests cover the flattening (reference rows resolve
 * through the document's CURRENT slug, which is what keeps chains from
 * forming) and the lookup rules.
 */

/** Route `payload.find` by collection, so the reference join can be asserted. */
const stubFind = (byCollection: Record<string, unknown[]>) => {
  mocks.find.mockImplementation(
    async ({ collection }: { collection: string }) => ({
      docs: byCollection[collection] ?? [],
    }),
  )
}

const referenceRow = (from: string, relationTo: string, value: number) => ({
  from,
  to: { type: 'reference', reference: { relationTo, value } },
})

describe('normalizeRedirectPath', () => {
  it.each([
    ['/articles/x', '/articles/x'],
    ['articles/x', '/articles/x'],
    ['/articles/x/', '/articles/x'],
    ['/articles/x?utm=1', '/articles/x'],
    ['/articles/x#top', '/articles/x'],
    ['/', '/'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeRedirectPath(input)).toBe(expected)
  })
})

describe('resolveRedirect', () => {
  const rows = [{ from: '/articles/old', to: '/articles/new' }]

  it('matches regardless of trailing slash', () => {
    expect(resolveRedirect(rows, '/articles/old/')).toBe('/articles/new')
  })

  it('returns null when nothing matches', () => {
    expect(resolveRedirect(rows, '/articles/unrelated')).toBeNull()
  })

  it('refuses a self-redirect', () => {
    // The shape a rename-back-to-the-original leaves behind; serving it would
    // be an infinite redirect.
    expect(
      resolveRedirect(
        [{ from: '/articles/a', to: '/articles/a' }],
        '/articles/a',
      ),
    ).toBeNull()
  })

  it('serves a custom destination with its query intact', () => {
    // The reason normalisation moved off the destination. An editor pointing a
    // retired page at a campaign link means the query; stripping it hands the
    // reader a URL that works and does not do what the row was written for.
    expect(
      resolveRedirect(
        [{ from: '/old-offer', to: '/signup?campaign=launch' }],
        '/old-offer',
      ),
    ).toBe('/signup?campaign=launch')
  })

  it('keeps a fragment on a custom destination', () => {
    expect(
      resolveRedirect([{ from: '/faq', to: '/about#contact' }], '/faq'),
    ).toBe('/about#contact')
  })

  it('serves an absolute destination unchanged', () => {
    // Normalising this produced `/https://example.com/moved` — a path nothing
    // on this site serves, from a row that read perfectly in the admin.
    expect(
      resolveRedirect(
        [{ from: '/moved', to: 'https://example.com/moved' }],
        '/moved',
      ),
    ).toBe('https://example.com/moved')
  })

  it('does not mistake an absolute destination for a self-redirect', () => {
    // Same stem as the request, different site. Under the old normalisation
    // the check compared two mangled paths; the rule only ever applied to
    // destinations that stay here.
    expect(
      resolveRedirect(
        [{ from: '/articles/a', to: 'https://example.com/articles/a' }],
        '/articles/a',
      ),
    ).toBe('https://example.com/articles/a')
    expect(
      resolveRedirect(
        [{ from: '/articles/a', to: '//cdn.example.com/articles/a' }],
        '/articles/a',
      ),
    ).toBe('//cdn.example.com/articles/a')
  })

  it('still refuses a self-redirect that only differs by a query', () => {
    // The loop check compares stems on purpose: this destination re-enters the
    // same not-found branch, query and all.
    expect(
      resolveRedirect(
        [{ from: '/articles/a', to: '/articles/a?utm=1' }],
        '/articles/a',
      ),
    ).toBeNull()
  })

  it('returns null for an empty destination instead of sending to /', () => {
    expect(resolveRedirect([{ from: '/x', to: '   ' }], '/x')).toBeNull()
  })

  it('matches a trailing-slash request against a query-bearing row', () => {
    // Both halves at once: `from` is still normalised for MATCHING, while the
    // destination is served exactly as configured.
    expect(
      resolveRedirect(
        [{ from: '/old-offer/', to: '/signup?campaign=launch' }],
        '/old-offer',
      ),
    ).toBe('/signup?campaign=launch')
  })
})

describe('getCmsRedirects', () => {
  beforeEach(() => {
    mocks.find.mockReset()
  })

  it('resolves a reference row through the document’s current slug', async () => {
    stubFind({
      redirects: [referenceRow('/articles/old', 'posts', 55)],
      posts: [{ id: 55, slug: 'current' }],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      { from: '/articles/old', to: '/articles/current' },
    ])
  })

  it('collapses a would-be chain because every hop targets the document', async () => {
    // a -> doc and b -> doc, with the doc now at `c`. Neither row points at
    // another row, so `/articles/a` reaches `/articles/c` in ONE hop.
    stubFind({
      redirects: [
        referenceRow('/articles/a', 'posts', 55),
        referenceRow('/articles/b', 'posts', 55),
      ],
      posts: [{ id: 55, slug: 'c' }],
    })

    const redirects = await getCmsRedirects()
    expect(redirects).toEqual([
      { from: '/articles/a', to: '/articles/c' },
      { from: '/articles/b', to: '/articles/c' },
    ])
    expect(resolveRedirect(redirects, '/articles/a')).toBe('/articles/c')
  })

  it('reads references at depth 0 and joins them in one query per collection', async () => {
    stubFind({
      redirects: [
        referenceRow('/articles/a', 'posts', 1),
        referenceRow('/articles/b', 'posts', 2),
        referenceRow('/old-page', 'pages', 3),
      ],
      posts: [
        { id: 1, slug: 'one' },
        { id: 2, slug: 'two' },
      ],
      pages: [{ id: 3, slug: 'new-page' }],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      { from: '/articles/a', to: '/articles/one' },
      { from: '/articles/b', to: '/articles/two' },
      { from: '/old-page', to: '/new-page' },
    ])
    // redirects + posts + pages, and nothing populated at depth > 0.
    expect(mocks.find).toHaveBeenCalledTimes(3)
    for (const [args] of mocks.find.mock.calls) {
      expect(args.depth).toBe(0)
    }
  })

  it('serves hand-written custom rows too', async () => {
    stubFind({
      redirects: [
        { from: '/legacy', to: { type: 'custom', url: '/articles/x' } },
      ],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      { from: '/legacy', to: '/articles/x' },
    ])
  })

  it('flattens a custom row to the editor’s URL verbatim', async () => {
    // The flattening never touched the URL; the corruption was downstream in
    // `resolveRedirect`. Pinned here so the two halves stay separable.
    stubFind({
      redirects: [
        {
          from: '/old-offer',
          to: { type: 'custom', url: '/signup?campaign=launch' },
        },
        {
          from: '/moved',
          to: { type: 'custom', url: 'https://example.com/moved' },
        },
      ],
    })

    const redirects = await getCmsRedirects()
    expect(redirects).toEqual([
      { from: '/old-offer', to: '/signup?campaign=launch' },
      { from: '/moved', to: 'https://example.com/moved' },
    ])
    expect(resolveRedirect(redirects, '/old-offer')).toBe(
      '/signup?campaign=launch',
    )
    expect(resolveRedirect(redirects, '/moved')).toBe(
      'https://example.com/moved',
    )
  })

  it('drops a row whose referenced document was deleted', async () => {
    stubFind({
      redirects: [referenceRow('/articles/gone', 'posts', 99)],
      posts: [],
    })

    await expect(getCmsRedirects()).resolves.toEqual([])
  })

  it('caches under the redirects tag with the cmsContent profile', async () => {
    stubFind({ redirects: [] })
    await getCmsRedirects()
    // The tag/profile pairing itself is pinned in cacheTags.test.ts; this just
    // proves the read runs without a Next cache scope in unit tests.
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        overrideAccess: false,
      }),
    )
  })
})

describe('getRedirectForPath', () => {
  beforeEach(() => {
    mocks.find.mockReset()
  })

  it('returns the destination for a renamed article', async () => {
    stubFind({
      redirects: [referenceRow('/articles/old', 'posts', 55)],
      posts: [{ id: 55, slug: 'new' }],
    })

    await expect(getRedirectForPath('/articles/old')).resolves.toBe(
      '/articles/new',
    )
  })

  it('returns null for a path with no row', async () => {
    stubFind({ redirects: [] })
    await expect(getRedirectForPath('/articles/nope')).resolves.toBeNull()
  })
})
