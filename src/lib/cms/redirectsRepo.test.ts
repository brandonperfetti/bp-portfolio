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

/**
 * A prefix row: `from` plus everything beneath it, remainder carried across
 * (#150 D4).
 */
const prefixRow = (
  from: string,
  to: string,
  type: CmsRedirectType = '301',
): CmsRedirect => ({ from, matchDescendants: true, to, type })

describe('resolveRedirect · descendant prefix rows (#150)', () => {
  const move = [prefixRow('/work', '/experience')]

  it('serves the row for the moved path itself', () => {
    expect(resolveRedirect(move, '/work')).toEqual(permanentlyTo('/experience'))
  })

  it('rewrites the prefix and keeps the remainder', () => {
    expect(resolveRedirect(move, '/work/brytecore')).toEqual(
      permanentlyTo('/experience/brytecore'),
    )
  })

  it('rewrites at any depth beneath the prefix', () => {
    expect(resolveRedirect(move, '/work/brytecore/team')).toEqual(
      permanentlyTo('/experience/brytecore/team'),
    )
  })

  it('stops at a slash — /workshops is a different page', () => {
    expect(resolveRedirect(move, '/workshops')).toBeNull()
    expect(resolveRedirect(move, '/workshops/intro')).toBeNull()
  })

  it('does NOT rewrite for a row without the flag', () => {
    expect(
      resolveRedirect([row('/work', '/experience')], '/work/brytecore'),
    ).toBeNull()
  })

  /**
   * Exact beats prefix, and it must do so regardless of row ORDER — the list
   * arrives in whatever order Payload returned it, so a single pass would make
   * the answer depend on that.
   */
  it('lets an exact row win over a prefix row that sits EARLIER', () => {
    expect(
      resolveRedirect(
        [prefixRow('/work', '/experience'), row('/work/bc', '/clients/bc')],
        '/work/bc',
      ),
    ).toEqual(permanentlyTo('/clients/bc'))
  })

  it('lets an exact row win over a prefix row that sits LATER', () => {
    expect(
      resolveRedirect(
        [row('/work/bc', '/clients/bc'), prefixRow('/work', '/experience')],
        '/work/bc',
      ),
    ).toEqual(permanentlyTo('/clients/bc'))
  })

  /**
   * The guard applies to the REWRITTEN destination. `/work → /work` looks
   * harmless on the raw `to` for a request of `/work/x`; it is an infinite
   * redirect once the suffix is appended.
   */
  it('refuses a self-redirect measured on the rewritten destination', () => {
    expect(
      resolveRedirect([prefixRow('/work', '/work')], '/work/brytecore'),
    ).toBeNull()
  })

  it('carries permanence from the row', () => {
    expect(
      resolveRedirect([prefixRow('/work', '/experience', '302')], '/work/bc'),
    ).toEqual({ destination: '/experience/bc', permanent: false })
  })

  /**
   * Longest prefix wins (rule 4), from the orchestrator's walkthrough on a
   * prod-restore database: a three-level tree renamed from the inside out
   * leaves two prefix rows that both match one inbound URL, and only the more
   * specific one produces a URL that still exists.
   */
  describe('two nested prefix rows both matching (#150, rule 4)', () => {
    // Row A: the child was renamed lab-child -> lab-kid, under the OLD parent.
    const rowA = prefixRow('/lab-parent/lab-child', '/lab-parent/lab-kid')
    // Row C: the parent was then renamed lab-parent -> lab-base.
    const rowC = prefixRow('/lab-parent', '/lab-base')
    const inbound = '/lab-parent/lab-child/lab-grandchild'

    it('picks the longer row regardless of list order', () => {
      // The whole point. Row order is whatever Payload returned, and before
      // rule 4 it decided the answer: [C, A] produced the dead
      // `/lab-base/lab-child/lab-grandchild`, [A, C] the live one.
      const fromCFirst = resolveRedirect([rowC, rowA], inbound)
      const fromAFirst = resolveRedirect([rowA, rowC], inbound)

      expect(fromCFirst).toEqual(fromAFirst)
      expect(fromCFirst).toEqual(
        permanentlyTo('/lab-parent/lab-kid/lab-grandchild'),
      )
    })

    it('does not carry a segment that no longer exists', () => {
      // What the shorter row would have done: `lab-child` has not existed
      // since the first rename, so `/lab-base/lab-child/lab-grandchild` 404s.
      expect(resolveRedirect([rowC, rowA], inbound)?.destination).not.toContain(
        'lab-child',
      )
    })

    /**
     * The chain case, asserted at ONE hop. Row A's real destination is a
     * document reference, which `getCmsRedirects` has already resolved through
     * the child's CURRENT path — so the row this function sees says
     * `/lab-base/lab-kid`, and the answer is the grandchild under the renamed
     * parent. The grandchild's own move (row B) is a separate request and is
     * deliberately not simulated here.
     */
    it('yields the live single-hop destination once the reference is resolved', () => {
      const resolvedA = prefixRow('/lab-parent/lab-child', '/lab-base/lab-kid')

      for (const list of [
        [resolvedA, rowC],
        [rowC, resolvedA],
      ]) {
        expect(resolveRedirect(list, inbound)).toEqual(
          permanentlyTo('/lab-base/lab-kid/lab-grandchild'),
        )
      }
    })

    it('answers null when the LONGEST row leaves the site — no fallback to the shorter one', () => {
      // The negative control. Falling through to `/lab-parent` here would let a
      // less specific ancestor answer for a subtree the specific row owns —
      // rule 4's defect arriving by a side door.
      const absoluteA = prefixRow(
        '/lab-parent/lab-child',
        'https://example.com/moved',
      )

      expect(resolveRedirect([absoluteA, rowC], inbound)).toBeNull()
      expect(resolveRedirect([rowC, absoluteA], inbound)).toBeNull()
    })

    it('answers null when the LONGEST row self-redirects, rather than falling back', () => {
      const selfA = prefixRow('/lab-parent/lab-child', '/lab-parent/lab-child')

      expect(resolveRedirect([selfA, rowC], inbound)).toBeNull()
      expect(resolveRedirect([rowC, selfA], inbound)).toBeNull()
    })

    it('keeps first-in-list on a tie between equally specific rows', () => {
      const first = prefixRow('/lab-parent', '/first')
      const second = prefixRow('/lab-parent', '/second')

      expect(resolveRedirect([first, second], '/lab-parent/x')).toEqual(
        permanentlyTo('/first/x'),
      )
      expect(resolveRedirect([second, first], '/lab-parent/x')).toEqual(
        permanentlyTo('/second/x'),
      )
    })

    it('still lets an EXACT row beat the longest prefix row', () => {
      // Rule 1 is unchanged by rule 4: the exact pass runs first and completes.
      expect(
        resolveRedirect([rowA, rowC, row(inbound, '/clients/gc')], inbound),
      ).toEqual(permanentlyTo('/clients/gc'))
    })
  })

  it('skips a prefix row whose destination leaves the site', () => {
    // Appending a path suffix to an editor's absolute URL is a URL this
    // function has no business inventing.
    expect(
      resolveRedirect(
        [prefixRow('/work', 'https://example.com/moved')],
        '/work/bc',
      ),
    ).toBeNull()
    // The exact request that row genuinely describes is still served.
    expect(
      resolveRedirect(
        [prefixRow('/work', 'https://example.com/moved')],
        '/work',
      ),
    ).toEqual(permanentlyTo('https://example.com/moved'))
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

  /**
   * #150. A reference row's destination is the target's current PUBLIC URL, and
   * for a placed post that is its `path` — resolving it through the slug alone
   * sent every inbound link to `/articles/<slug>`, a URL the document stopped
   * serving the moment it was placed.
   */
  it('resolves a reference to a PLACED post through its path, not /articles', async () => {
    stubFind({
      redirects: [referenceRow('/work/old', 'posts', 55)],
      posts: [{ id: 55, path: 'work/current', slug: 'current' }],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      { from: '/work/old', to: '/work/current', type: '301' },
    ])
  })

  it('resolves a reference to a NESTED page through its path', async () => {
    stubFind({
      redirects: [referenceRow('/work/brytecore', 'pages', 7)],
      pages: [{ id: 7, path: 'experience/brytecore', slug: 'brytecore' }],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      { from: '/work/brytecore', to: '/experience/brytecore', type: '301' },
    ])
  })

  it('selects the path column alongside the slug on the reference join', async () => {
    stubFind({
      redirects: [referenceRow('/articles/old', 'posts', 55)],
      posts: [{ id: 55, slug: 'current' }],
    })

    await getCmsRedirects()

    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        select: { path: true, slug: true },
      }),
    )
  })

  it('carries matchDescendants through the flattening (#150)', async () => {
    stubFind({
      redirects: [
        { ...referenceRow('/work', 'pages', 7), matchDescendants: true },
        referenceRow('/articles/old', 'posts', 55),
      ],
      pages: [{ id: 7, path: 'experience', slug: 'experience' }],
      posts: [{ id: 55, slug: 'current' }],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      {
        from: '/work',
        matchDescendants: true,
        to: '/experience',
        type: '301',
      },
      { from: '/articles/old', to: '/articles/current', type: '301' },
    ])
  })

  it('reads a row written before M4 as exact-only, with the key omitted', async () => {
    // Omitted rather than `false`, so a flattened exact row is byte-identical
    // to what this function returned before #150 — every existing assertion in
    // this file is that guarantee.
    stubFind({
      redirects: [referenceRow('/articles/old', 'posts', 55)],
      posts: [{ id: 55, slug: 'current' }],
    })

    const [flattened] = await getCmsRedirects()
    expect('matchDescendants' in flattened).toBe(false)
    expect(resolveRedirect([flattened], '/articles/old/deeper')).toBeNull()
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
