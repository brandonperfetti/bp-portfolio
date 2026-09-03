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
  type CmsRedirect,
  type CmsRedirectType,
  getCmsRedirects,
  getRedirectForPath,
  isPermanentRedirect,
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

const referenceRow = (
  from: string,
  relationTo: string,
  value: number,
  type: CmsRedirectType = '301',
) => ({
  from,
  to: { type: 'reference', reference: { relationTo, value } },
  type,
})

/**
 * A flattened row for the pure-lookup tests.
 *
 * @remarks Defaults to `'301'` so every pre-#130 case below reads exactly as it
 * did, and the permanence tests are the ones that have to say something.
 */
const row = (
  from: string,
  to: string,
  type: CmsRedirectType = '301',
): CmsRedirect => ({ from, to, type })

/** The shape a permanent match resolves to — `permanentRedirect`, 308. */
const permanentlyTo = (destination: string) => ({
  destination,
  permanent: true,
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
  const rows = [row('/articles/old', '/articles/new')]

  it('matches regardless of trailing slash', () => {
    expect(resolveRedirect(rows, '/articles/old/')).toEqual(
      permanentlyTo('/articles/new'),
    )
  })

  it('returns null when nothing matches', () => {
    expect(resolveRedirect(rows, '/articles/unrelated')).toBeNull()
  })

  it('refuses a self-redirect', () => {
    // The shape a rename-back-to-the-original leaves behind; serving it would
    // be an infinite redirect.
    expect(
      resolveRedirect([row('/articles/a', '/articles/a')], '/articles/a'),
    ).toBeNull()
  })

  it('serves a custom destination with its query intact', () => {
    // The reason normalisation moved off the destination. An editor pointing a
    // retired page at a campaign link means the query; stripping it hands the
    // reader a URL that works and does not do what the row was written for.
    expect(
      resolveRedirect(
        [row('/old-offer', '/signup?campaign=launch')],
        '/old-offer',
      ),
    ).toEqual(permanentlyTo('/signup?campaign=launch'))
  })

  it('keeps a fragment on a custom destination', () => {
    expect(resolveRedirect([row('/faq', '/about#contact')], '/faq')).toEqual(
      permanentlyTo('/about#contact'),
    )
  })

  it('serves an absolute destination unchanged', () => {
    // Normalising this produced `/https://example.com/moved` — a path nothing
    // on this site serves, from a row that read perfectly in the admin.
    expect(
      resolveRedirect([row('/moved', 'https://example.com/moved')], '/moved'),
    ).toEqual(permanentlyTo('https://example.com/moved'))
  })

  it('does not mistake an absolute destination for a self-redirect', () => {
    // Same stem as the request, different site. Under the old normalisation
    // the check compared two mangled paths; the rule only ever applied to
    // destinations that stay here.
    expect(
      resolveRedirect(
        [row('/articles/a', 'https://example.com/articles/a')],
        '/articles/a',
      ),
    ).toEqual(permanentlyTo('https://example.com/articles/a'))
    expect(
      resolveRedirect(
        [row('/articles/a', '//cdn.example.com/articles/a')],
        '/articles/a',
      ),
    ).toEqual(permanentlyTo('//cdn.example.com/articles/a'))
  })

  it('still refuses a self-redirect that only differs by a query', () => {
    // The loop check compares stems on purpose: this destination re-enters the
    // same not-found branch, query and all.
    expect(
      resolveRedirect([row('/articles/a', '/articles/a?utm=1')], '/articles/a'),
    ).toBeNull()
  })

  it('returns null for an empty destination instead of sending to /', () => {
    expect(resolveRedirect([row('/x', '   ')], '/x')).toBeNull()
  })

  it('matches a trailing-slash request against a query-bearing row', () => {
    // Both halves at once: `from` is still normalised for MATCHING, while the
    // destination is served exactly as configured.
    expect(
      resolveRedirect(
        [row('/old-offer/', '/signup?campaign=launch')],
        '/old-offer',
      ),
    ).toEqual(permanentlyTo('/signup?campaign=launch'))
  })
})

/**
 * Permanence (#130).
 *
 * Before this, every match was handed to `permanentRedirect` — a 308, cached
 * by browsers and search engines effectively forever, which is right for a
 * rename and wrong for a campaign page. The reader now answers the question the
 * routes need to choose an API, and the whole risk of the change lives in the
 * fallback: a row written before the field existed carries no value, and it
 * must keep resolving exactly as it did.
 */
describe('redirect permanence (#130)', () => {
  beforeEach(() => {
    mocks.find.mockReset()
  })

  // Two cases, because the function now takes two. The unset/legacy fallback
  // is not tested here on purpose: it lives at the boundary in
  // `getCmsRedirects`, and it is exercised through that function by "treats a
  // row stored with no type as permanent" below — the path a real row takes.
  // Testing it here as well would have meant widening this signature to
  // `unknown` for the test's benefit alone.
  it.each([
    ['301', true],
    ['302', false],
  ] as const)('isPermanentRedirect(%o) === %s', (type, expected) => {
    expect(isPermanentRedirect(type)).toBe(expected)
  })

  it('resolves a 302 row as a temporary redirect', () => {
    expect(
      resolveRedirect([row('/promo', '/signup', '302')], '/promo'),
    ).toEqual({ destination: '/signup', permanent: false })
  })

  it('resolves a 301 row as a permanent redirect', () => {
    expect(
      resolveRedirect([row('/promo', '/signup', '301')], '/promo'),
    ).toEqual(permanentlyTo('/signup'))
  })

  it('carries permanence onto an absolute destination too', () => {
    // The absolute-URL branch returns early, so it needs its own pin: it was
    // the one exit that could have been left answering the old unconditional
    // permanent.
    expect(
      resolveRedirect(
        [row('/moved', 'https://example.com/moved', '302')],
        '/moved',
      ),
    ).toEqual({ destination: 'https://example.com/moved', permanent: false })
  })

  it('treats a row stored with no type as permanent', async () => {
    // The pre-#130 rows. The migration backfills them with a `DEFAULT '301'`,
    // so this is belt and braces — but the reader is also what an import or a
    // hand-written INSERT would go through, and a NULL there must not silently
    // become a 307.
    stubFind({
      redirects: [{ from: '/legacy', to: { type: 'custom', url: '/x' } }],
    })

    const redirects = await getCmsRedirects()
    expect(redirects).toEqual([{ from: '/legacy', to: '/x', type: '301' }])
    expect(resolveRedirect(redirects, '/legacy')).toEqual(permanentlyTo('/x'))
  })

  it('flattens a stored 302 through the reference join', async () => {
    stubFind({
      redirects: [referenceRow('/articles/old', 'posts', 55, '302')],
      posts: [{ id: 55, slug: 'new' }],
    })

    await expect(getRedirectForPath('/articles/old')).resolves.toEqual({
      destination: '/articles/new',
      permanent: false,
    })
  })

  it('asks Payload for the type column', async () => {
    // The flattening cannot report a permanence it never selected — a missing
    // `type: true` here would make every row read as the fallback and quietly
    // undo the feature.
    stubFind({ redirects: [] })
    await getCmsRedirects()

    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        select: expect.objectContaining({ type: true }),
      }),
    )
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
      { from: '/articles/old', to: '/articles/current', type: '301' },
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
      { from: '/articles/a', to: '/articles/c', type: '301' },
      { from: '/articles/b', to: '/articles/c', type: '301' },
    ])
    expect(resolveRedirect(redirects, '/articles/a')).toEqual(
      permanentlyTo('/articles/c'),
    )
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
      { from: '/articles/a', to: '/articles/one', type: '301' },
      { from: '/articles/b', to: '/articles/two', type: '301' },
      { from: '/old-page', to: '/new-page', type: '301' },
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
        {
          from: '/legacy',
          to: { type: 'custom', url: '/articles/x' },
          type: '301',
        },
      ],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      { from: '/legacy', to: '/articles/x', type: '301' },
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
          type: '301',
        },
        {
          from: '/moved',
          to: { type: 'custom', url: 'https://example.com/moved' },
          type: '301',
        },
      ],
    })

    const redirects = await getCmsRedirects()
    expect(redirects).toEqual([
      { from: '/old-offer', to: '/signup?campaign=launch', type: '301' },
      { from: '/moved', to: 'https://example.com/moved', type: '301' },
    ])
    expect(resolveRedirect(redirects, '/old-offer')).toEqual(
      permanentlyTo('/signup?campaign=launch'),
    )
    expect(resolveRedirect(redirects, '/moved')).toEqual(
      permanentlyTo('https://example.com/moved'),
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

    await expect(getRedirectForPath('/articles/old')).resolves.toEqual(
      permanentlyTo('/articles/new'),
    )
  })

  it('returns null for a path with no row', async () => {
    stubFind({ redirects: [] })
    await expect(getRedirectForPath('/articles/nope')).resolves.toBeNull()
  })
})
