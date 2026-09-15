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

  /**
   * #178 — the SECOND move, and the hop that survives it.
   *
   * The rule-4 block above stops one step short of the ticket: it never moves
   * the grandchild. Once the grandchild has its own row, rule 4's answer is a
   * URL nothing serves, because that row is keyed at the spelling in force when
   * the grandchild moved — an era the current-path rewrite skips over.
   *
   * The rows here are as `getCmsRedirects` flattens them AFTER all three steps:
   * every `to` already resolved through its target's CURRENT path, and every
   * `toPathAtCapture` frozen at the row's own capture.
   */
  describe('a URL captured under an ancestor that moved AGAIN (#178)', () => {
    /** A: the child renamed under the OLD parent; target now at /lab-base/lab-kid. */
    const rowA: CmsRedirect = {
      ...prefixRow('/lab-parent/lab-child', '/lab-base/lab-kid'),
      toPathAtCapture: '/lab-parent/lab-kid',
    }
    /** B: the grandchild moved up one level; target now at /lab-base/lab-grandchild. */
    const rowB: CmsRedirect = {
      ...prefixRow(
        '/lab-parent/lab-kid/lab-grandchild',
        '/lab-base/lab-grandchild',
      ),
      toPathAtCapture: '/lab-parent/lab-grandchild',
    }
    /** C: the parent renamed; target now at /lab-base. */
    const rowC: CmsRedirect = {
      ...prefixRow('/lab-parent', '/lab-base'),
      toPathAtCapture: '/lab-base',
    }
    const inbound = '/lab-parent/lab-child/lab-grandchild'

    it('resolves the four-step repro to the live URL, in any list order', () => {
      // THE ticket. Before the hop this answered
      // `/lab-base/lab-kid/lab-grandchild` — a 404 with row B unread in the
      // same list.
      for (const list of [
        [rowA, rowB, rowC],
        [rowC, rowB, rowA],
        [rowB, rowC, rowA],
      ]) {
        expect(resolveRedirect(list, inbound)).toEqual(
          permanentlyTo('/lab-base/lab-grandchild'),
        )
      }
    })

    it('never emits a segment that stopped existing at step 1', () => {
      expect(
        resolveRedirect([rowA, rowB, rowC], inbound)?.destination,
      ).not.toContain('lab-child')
    })

    it('falls back to the current path when nothing is keyed at the capture-time form', () => {
      // Row A alone. Its snapshot `/lab-parent/lab-kid` differs from its
      // current destination `/lab-base/lab-kid`, so the target HAS moved since
      // capture — under a complete table there would be a row keyed at the
      // snapshot (row C is that row) and the hop would have matched it. There
      // is not one here, so the capture-time form names a parent that has not
      // existed since step 3, and serving it would be a PERMANENT redirect to a
      // dead URL. The current-path rewrite is at least built on the live path
      // of row A's own target, which is what the pre-#178 code answered.
      expect(resolveRedirect([rowA], inbound)).toEqual(
        permanentlyTo('/lab-base/lab-kid/lab-grandchild'),
      )
    })

    it('answers the LIVE destination when an intermediate row is missing', () => {
      // The regression guard. Both ways a table goes incomplete are reachable:
      // the redirects collection carries no delete restriction, and a row can
      // fall outside the REDIRECT_LIMIT read. Chain `/a` → `/b` → `/c`.
      const chainStart: CmsRedirect = {
        ...prefixRow('/a', '/c'),
        toPathAtCapture: '/b',
      }
      const middle: CmsRedirect = {
        ...prefixRow('/b', '/c'),
        toPathAtCapture: '/c',
      }

      // Complete table: unchanged by this rule — the hop finds the `/b` row and
      // the walk composes exactly as it did.
      expect(resolveRedirect([chainStart, middle], '/a/leaf')).toEqual(
        permanentlyTo('/c/leaf'),
      )
      // The `/b` row gone: the capture-time form `/b/leaf` is a URL nothing
      // serves. Falling through answers the live one instead.
      expect(resolveRedirect([chainStart], '/a/leaf')).toEqual(
        permanentlyTo('/c/leaf'),
      )
      // The bar this has to clear: a pre-#178 row, which has always answered
      // the live URL for exactly this request.
      expect(resolveRedirect([prefixRow('/a', '/c')], '/a/leaf')).toEqual(
        permanentlyTo('/c/leaf'),
      )
    })

    it('never answers the request path when the chain leads back to it', () => {
      // The self-redirect guard, on the HOP's answer. The exact pass guards a
      // row's own `to` and the fall-through guards the rewritten form, but the
      // hop's answer was resolved against the CAPTURE-TIME spelling and had
      // never been re-asked against the request. A chain whose last row points
      // back at the requested path therefore composed a redirect to the path
      // that was asked for — and, every row here being a 301, a 308 the
      // browser caches indefinitely.
      const chainStart: CmsRedirect = {
        ...prefixRow('/a', '/c'),
        toPathAtCapture: '/b',
      }
      const backAtTheRequest = row('/b/leaf', '/a/leaf')

      const resolved = resolveRedirect(
        [chainStart, backAtTheRequest],
        '/a/leaf',
      )

      expect(resolved?.destination).not.toBe('/a/leaf')
      // Not merely "not a loop" — a null would satisfy that and 404 a request
      // this table can still answer. A chain that leads back to the request is
      // the same evidence as a chain that leads nowhere: the capture-time
      // spelling is not to be trusted. So it takes the same branch, and the
      // current-path rewrite (built on the live path of the chosen row's own
      // target) answers, subject to its own `rewritten === target` guard.
      expect(resolved).toEqual(permanentlyTo('/c/leaf'))
    })

    it('re-resolves the capture-time form through a LATER ancestor move', () => {
      // Row B dropped — the grandchild never moved — but the parent still did.
      // The capture-time form `/lab-parent/lab-kid/lab-grandchild` is stale in
      // its FIRST segment, and row C is what fixes it. The walk composes: hop
      // one restores the era, hop two brings that era forward.
      expect(resolveRedirect([rowA, rowC], inbound)).toEqual(
        permanentlyTo('/lab-base/lab-kid/lab-grandchild'),
      )
    })

    it('falls back to the current path for a row with no snapshot', () => {
      // A pre-#178 row, byte for byte the old behaviour — which is also why
      // such a row still survives only ONE move and is not backfilled: not
      // because the value is unrecorded (`_pages_v` holds historical paths),
      // but because `maxPerDoc: 50` under a 100 ms autosave prunes that
      // history, and a partly-wrong snapshot is worse than a NULL.
      const legacyA = prefixRow('/lab-parent/lab-child', '/lab-base/lab-kid')

      expect(resolveRedirect([legacyA, rowB, rowC], inbound)).toEqual(
        permanentlyTo('/lab-base/lab-kid/lab-grandchild'),
      )
    })

    it('walks four hops, one short of the cap', () => {
      // Four ancestors renamed in turn. Each row's snapshot names the era the
      // next row is filed under, so the walk is exactly as long as the history.
      const chain: CmsRedirect[] = [
        { ...prefixRow('/v0', '/v4'), toPathAtCapture: '/v1' },
        { ...prefixRow('/v1', '/v4'), toPathAtCapture: '/v2' },
        { ...prefixRow('/v2', '/v4'), toPathAtCapture: '/v3' },
        { ...prefixRow('/v3', '/v4'), toPathAtCapture: '/v4' },
      ]

      expect(resolveRedirect(chain, '/v0/leaf')).toEqual(
        permanentlyTo('/v4/leaf'),
      )
    })

    it('answers null when the walk outruns the hop cap', () => {
      // Six links: one more than MAX_REDIRECT_HOPS. Serving the partial walk
      // would be asserting a destination this function has not actually
      // reached, so it declines.
      const chain: CmsRedirect[] = Array.from({ length: 6 }, (_unused, i) => ({
        ...prefixRow(`/w${i}`, '/w6'),
        toPathAtCapture: `/w${i + 1}`,
      }))

      expect(resolveRedirect(chain, '/w0/leaf')).toBeNull()
    })

    it('answers null for a cyclic pair rather than looping', () => {
      // Two rows whose snapshots name each other — the shape a move-and-move-
      // back leaves if both rows survive. The budget is what terminates it, and
      // `exhausted` is what stops the outer frame serving `/a/leaf` as if the
      // inner walk had ended cleanly.
      const cycle: CmsRedirect[] = [
        { ...prefixRow('/a', '/current'), toPathAtCapture: '/b' },
        { ...prefixRow('/b', '/current'), toPathAtCapture: '/a' },
      ]

      expect(resolveRedirect(cycle, '/a/leaf')).toBeNull()
      expect(resolveRedirect(cycle, '/b/leaf')).toBeNull()
    })

    it('re-asks the absolute-destination guard on the capture-time form', () => {
      // The wave-6 `//host` guard (#182), on the new form. A snapshot at the
      // root would spell `//lab-grandchild` if concatenated naively.
      const rootCapture: CmsRedirect = {
        ...prefixRow('/lab-parent/lab-child', '/lab-base/lab-kid'),
        toPathAtCapture: '/',
      }

      // Pinned through a row keyed at the capture-time form rather than on the
      // walk's own answer: an exact match on `/lab-grandchild` is only possible
      // if that is the string the hop looked up, which is the assertion — a
      // naive concatenation would have looked up `//lab-grandchild` and matched
      // nothing. (The single-row spelling of this case now falls through to the
      // current-path rewrite, so it can no longer show which form was tried.)
      const landing = row('/lab-grandchild', '/moved-grandchild')

      expect(resolveRedirect([rootCapture, landing], inbound)).toEqual(
        permanentlyTo('/moved-grandchild'),
      )
      // And the fall-through answer is a same-origin path either way.
      expect(resolveRedirect([rootCapture], inbound)?.destination).not.toMatch(
        /^\/\//,
      )
    })

    it('refuses a snapshot that leaves the site instead of appending to a host', () => {
      const hostCapture: CmsRedirect = {
        ...prefixRow('/lab-parent/lab-child', '/lab-base/lab-kid'),
        toPathAtCapture: 'https://example.com/lab-kid',
      }

      // The snapshot is unusable, so the current-path rewrite answers — the
      // pre-#178 behaviour, not a null.
      expect(resolveRedirect([hostCapture], inbound)).toEqual(
        permanentlyTo('/lab-base/lab-kid/lab-grandchild'),
      )
    })

    it('collapses permanence to the chain’s product', () => {
      // Worth stating loudly: a 301 whose walk passes through a 302 answers
      // 307, not 308. See the docblock — the 302 is an editor saying the
      // destination is not settled, and caching the composite forever would
      // outlive that.
      const temporaryB: CmsRedirect = {
        ...prefixRow(
          '/lab-parent/lab-kid/lab-grandchild',
          '/lab-base/lab-grandchild',
          '302',
        ),
        toPathAtCapture: '/lab-parent/lab-grandchild',
      }

      expect(resolveRedirect([rowA, temporaryB, rowC], inbound)).toEqual({
        destination: '/lab-base/lab-grandchild',
        permanent: false,
      })
    })

    it('still lets an EXACT row beat the whole walk', () => {
      expect(
        resolveRedirect(
          [rowA, rowB, rowC, row(inbound, '/clients/gc')],
          inbound,
        ),
      ).toEqual(permanentlyTo('/clients/gc'))
    })
  })

  /**
   * #201 — a re-used path, and the identity that keeps a capture honest.
   *
   * `toPathAtCapture` records a PATH, and a path is not a stable identity: once
   * the document it named vacates it, another document can take it. Two shapes
   * follow, and both are reachable from the hooks as written:
   *
   * 1. **The row itself is repointed.** `from` is `unique` on the collection,
   *    so when the new occupant vacates the same path `createPathRedirect`
   *    updates the existing row rather than stacking a second one. The row's
   *    `to` then names the NEW document while its write-once snapshot still
   *    names the era of the old one.
   * 2. **The hop walks into the new occupant's own row.** A row keyed exactly
   *    at the captured path is normally the captured document's next move —
   *    that is what makes the #178 walk work — but after the path is re-used it
   *    can instead be a different document's.
   *
   * Both are silent 301s into a subtree the link was never about. The fix is
   * the id recorded beside the path (`toIdAtCapture`, resolved to
   * `capturedTargetPath` by {@link getCmsRedirects}); these tests are the
   * semantics table.
   */
  describe('a path vacated by one document and taken by another (#201)', () => {
    /** Add the capture-time identity, and where that document lives now. */
    const capturedFor = (
      redirect: CmsRedirect,
      toIdAtCapture: string,
      capturedTargetPath?: string,
    ): CmsRedirect => ({
      ...redirect,
      toIdAtCapture,
      ...(capturedTargetPath ? { capturedTargetPath } : {}),
    })

    /**
     * A was renamed `/work/acme` → `/work/acme-corp`, writing this row. B was
     * later created at the vacated `/work/acme` and renamed to `/work/beta`,
     * and `from` being unique the hook REPOINTED this same row at B while
     * preserving A's snapshot (#178's write-once rule).
     */
    const repointedAtB = capturedFor(
      {
        ...prefixRow('/work/acme', '/work/beta'),
        toPathAtCapture: '/work/acme-corp',
      },
      'pages:1',
      '/work/acme-corp',
    )

    it('rewrites a descendant onto the CAPTURED document, not the new occupant', () => {
      // THE ticket. `/work/acme/leaf` is a URL from A's tenure; the row's `to`
      // now names B, so the pre-#201 rewrite answered `/work/beta/leaf` — a
      // live page in a subtree the link was never about, served as a 301.
      expect(resolveRedirect([repointedAtB], '/work/acme/leaf')).toEqual(
        permanentlyTo('/work/acme-corp/leaf'),
      )
    })

    it('leaves the EXACT key answering the row’s own destination', () => {
      // Deliberately unchanged, and the boundary of this ticket. `/work/acme`
      // itself was most recently B's URL — B vacated it, which is why the row
      // was repointed — so the last document to leave a path keeps that path's
      // own redirect (#120's rule). Only the subtree, which no row is keyed at
      // and which the snapshot is the sole key for, is anchored to the capture.
      expect(resolveRedirect([repointedAtB], '/work/acme')).toEqual(
        permanentlyTo('/work/beta'),
      )
    })

    it('never hops through the row of a later occupant of the captured path', () => {
      // A's first move row, whose snapshot names `/work/acme`; A has since
      // moved on to `/work/acme-corp`. B took `/work/acme` and moved to
      // `/work/beta`, writing its OWN row keyed at `/work/acme` (A's row there
      // was deleted in admin, or fell outside the REDIRECT_LIMIT read — the
      // two ways the docblock already names for an incomplete table).
      const captureOfA = capturedFor(
        {
          ...prefixRow('/work/old', '/work/acme-corp'),
          toPathAtCapture: '/work/acme',
        },
        'pages:1',
        '/work/acme-corp',
      )
      const bsOwnRow = capturedFor(
        {
          ...prefixRow('/work/acme', '/work/beta'),
          toPathAtCapture: '/work/beta',
        },
        'pages:2',
        '/work/beta',
      )

      // Without B in the table this already answered A's subtree; adding a row
      // about a DIFFERENT document must not change that answer.
      expect(resolveRedirect([captureOfA], '/work/old/leaf')).toEqual(
        permanentlyTo('/work/acme-corp/leaf'),
      )
      expect(resolveRedirect([captureOfA, bsOwnRow], '/work/old/leaf')).toEqual(
        permanentlyTo('/work/acme-corp/leaf'),
      )
    })

    it('still hops through a row keyed at the captured path when it is the SAME document', () => {
      // The guard on the guard: the exclusion above is about a re-occupier, not
      // about every row keyed at a snapshot. A's own next move is keyed there
      // too, and that row is exactly what #178's walk exists to reach.
      const captureOfA = capturedFor(
        {
          ...prefixRow('/work/old', '/work/acme-x'),
          toPathAtCapture: '/work/acme',
        },
        'pages:1',
        '/work/acme-x',
      )
      const asNextMove = capturedFor(
        {
          ...prefixRow('/work/acme', '/work/acme-x'),
          toPathAtCapture: '/work/acme-corp',
        },
        'pages:1',
        '/work/acme-x',
      )
      const leafMovedOut = row('/work/acme-corp/leaf', '/work/moved-leaf')

      expect(
        resolveRedirect(
          [captureOfA, asNextMove, leafMovedOut],
          '/work/old/leaf',
        ),
      ).toEqual(permanentlyTo('/work/moved-leaf'))
    })

    it('still hops through a row that records no identity at all', () => {
      // A pre-#201 row in the middle of a chain is not evidence of a
      // re-occupier — it is evidence of nothing, and the walk treats it as it
      // always did.
      const captureOfA = capturedFor(
        {
          ...prefixRow('/work/old', '/work/acme-x'),
          toPathAtCapture: '/work/acme',
        },
        'pages:1',
        '/work/acme-x',
      )
      const legacyMiddle: CmsRedirect = {
        ...prefixRow('/work/acme', '/work/acme-x'),
        toPathAtCapture: '/work/acme-corp',
      }
      const leafMovedOut = row('/work/acme-corp/leaf', '/work/moved-leaf')

      expect(
        resolveRedirect(
          [captureOfA, legacyMiddle, leafMovedOut],
          '/work/old/leaf',
        ),
      ).toEqual(permanentlyTo('/work/moved-leaf'))
    })

    it('lets an editor’s custom redirect at the captured path answer the hop', () => {
      // Boundary 4, and the one shape rule 3 deliberately does NOT reject.
      //
      // A row keyed exactly at the capture base normally belongs either to the
      // captured document's own next move (hop through it) or to a later
      // occupant (reject it, rule 3). A row whose `to` is a custom URL is
      // neither: it carries no identity at all, because a custom destination is
      // an editor's statement rather than a document reference (boundary 3), so
      // the filter cannot see it — and it should not want to.
      // `createPathRedirect` writes `to.type: 'reference'` on every row it
      // creates AND on every row it repoints, so a custom destination at this
      // key can only have been typed by a person, about this exact path. A
      // human statement about where a path's era goes outranks a lineage this
      // module infers from a snapshot.
      const captureOfA = capturedFor(
        {
          ...prefixRow('/work/old', '/work/acme-corp'),
          toPathAtCapture: '/work/acme',
        },
        'pages:1',
        '/work/acme-corp',
      )
      // As `getCmsRedirects` flattens an editor's custom row: a destination and
      // no identity, whatever the identity COLUMNS still hold.
      const editorsOwnRow = prefixRow('/work/acme', '/campaigns/spring')

      expect(
        resolveRedirect([captureOfA, editorsOwnRow], '/work/old/leaf'),
      ).toEqual(permanentlyTo('/campaigns/spring/leaf'))
      // The contrast that makes this a decision rather than a hole: the same
      // key, a hook-written row, a different document's identity — rejected,
      // and the walk falls back to the captured document's subtree.
      expect(
        resolveRedirect(
          [
            captureOfA,
            capturedFor(
              {
                ...prefixRow('/work/acme', '/work/beta'),
                toPathAtCapture: '/work/beta',
              },
              'pages:2',
              '/work/beta',
            ),
          ],
          '/work/old/leaf',
        ),
      ).toEqual(permanentlyTo('/work/acme-corp/leaf'))
    })

    it('404s a descendant when the captured document is gone', () => {
      // The case the ticket asked to be decided rather than left to fall out of
      // the query. The identity is recorded and resolves to NOTHING — the page
      // was deleted or unpublished — so the only paths on offer are the new
      // occupant's, and a wrong 200 is the failure worth refusing. A 404 is
      // visible and gets reported; a plausible wrong page does not.
      const orphaned = capturedFor(
        {
          ...prefixRow('/work/acme', '/work/beta'),
          toPathAtCapture: '/work/acme-corp',
        },
        'pages:1',
      )

      expect(resolveRedirect([orphaned], '/work/acme/leaf')).toBeNull()
      // The exact key is unaffected: that URL is B's to answer.
      expect(resolveRedirect([orphaned], '/work/acme')).toEqual(
        permanentlyTo('/work/beta'),
      )
    })

    it('leaves a row with no captured identity exactly as it was (AC 4)', () => {
      // Every row written before this change carries no identity, and nothing
      // can reconstruct one — so it keeps today's answer, this bug included.
      // That is the whole of the compatibility promise, and it is why the
      // assertion here is the WRONG destination: making it right would mean
      // inventing an identity, which is the one thing a null row cannot have.
      const legacyRepointed: CmsRedirect = {
        ...prefixRow('/work/acme', '/work/beta'),
        toPathAtCapture: '/work/acme-corp',
      }

      expect(resolveRedirect([legacyRepointed], '/work/acme/leaf')).toEqual(
        permanentlyTo('/work/beta/leaf'),
      )
    })

    it('keeps the #178 three-move lineage resolving once identities are recorded (AC 3)', () => {
      // The same repro as the block above, with every row carrying the id of
      // the document it was captured for — which is what every row written
      // after this change looks like. The walk is unchanged: each hop passes
      // through a row keyed at the previous row's snapshot, and each of those
      // rows belongs to the document whose era it names.
      const rowA = capturedFor(
        {
          ...prefixRow('/lab-parent/lab-child', '/lab-base/lab-kid'),
          toPathAtCapture: '/lab-parent/lab-kid',
        },
        'pages:11',
        '/lab-base/lab-kid',
      )
      const rowB = capturedFor(
        {
          ...prefixRow(
            '/lab-parent/lab-kid/lab-grandchild',
            '/lab-base/lab-grandchild',
          ),
          toPathAtCapture: '/lab-parent/lab-grandchild',
        },
        'pages:12',
        '/lab-base/lab-grandchild',
      )
      const rowC = capturedFor(
        {
          ...prefixRow('/lab-parent', '/lab-base'),
          toPathAtCapture: '/lab-base',
        },
        'pages:10',
        '/lab-base',
      )

      for (const list of [
        [rowA, rowB, rowC],
        [rowC, rowB, rowA],
        [rowB, rowC, rowA],
      ]) {
        expect(
          resolveRedirect(list, '/lab-parent/lab-child/lab-grandchild'),
        ).toEqual(permanentlyTo('/lab-base/lab-grandchild'))
      }
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

  /**
   * A prefix row whose destination is the site ROOT (#182). The root is a
   * legitimate destination — a page's public path can be `/` — but it is the
   * one destination that normalises to a bare slash, and the carried remainder
   * already begins with one. Concatenating the two spelled `//<remainder>`: a
   * protocol-relative URL, which the catch-all hands straight to `redirect`
   * and the browser resolves against the current scheme, i.e. off this site.
   */
  describe('a prefix row whose destination is the root (#182)', () => {
    const toRoot = [prefixRow('/old', '/')]

    it('rewrites to an internal path, not the protocol-relative //host', () => {
      const resolved = resolveRedirect(toRoot, '/old/evil.com')

      expect(resolved).toEqual(permanentlyTo('/evil.com'))
      // Said twice on purpose: the value above is the answer, and NOT leaving
      // the site is the property that made this a defect rather than a typo.
      expect(resolved?.destination.startsWith('//')).toBe(false)
    })

    it('rewrites at any depth beneath the root destination', () => {
      expect(resolveRedirect(toRoot, '/old/a/b')).toEqual(permanentlyTo('/a/b'))
    })

    /**
     * The re-check on the REWRITTEN destination, for the same reason the
     * self-redirect guard is measured there: the rewritten form is the only
     * form that can be served. A request that already carries a doubled slash
     * reaches the concatenation with a `//`-leading remainder, so the stored
     * `to` being an ordinary internal path proves nothing about the answer.
     */
    it('answers null when the REWRITTEN destination leaves the site', () => {
      expect(resolveRedirect(toRoot, '/old//evil.com')).toBeNull()
    })

    it('leaves an ordinary prefix rewrite untouched', () => {
      // The control: collapsing the root to an empty base must not cost the
      // normal case its own leading slash.
      expect(resolveRedirect([prefixRow('/old', '/new')], '/old/x')).toEqual(
        permanentlyTo('/new/x'),
      )
    })
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

  it('carries toPathAtCapture through the flattening (#178)', async () => {
    // The two destinations DISAGREE on purpose: `to` follows the reference to
    // where the page lives now, `toPathAtCapture` is frozen where it lived when
    // the row was written. A flattening that dropped the column, or that
    // rebuilt it from the reference, would make them agree and the whole hop
    // in `resolveRedirect` would be dead code.
    stubFind({
      redirects: [
        {
          ...referenceRow('/lab-parent/lab-child', 'pages', 19),
          matchDescendants: true,
          toPathAtCapture: '/lab-parent/lab-kid',
        },
      ],
      pages: [{ id: 19, path: 'lab-base/lab-kid', slug: 'lab-kid' }],
    })

    await expect(getCmsRedirects()).resolves.toEqual([
      {
        from: '/lab-parent/lab-child',
        matchDescendants: true,
        to: '/lab-base/lab-kid',
        toPathAtCapture: '/lab-parent/lab-kid',
        type: '301',
      },
    ])
  })

  it('reads a row written before #178 with the snapshot key omitted', async () => {
    // Omitted, not `null` — same guarantee as `matchDescendants` above, and it
    // is what tells `resolveRedirect` to fall back to the current path.
    stubFind({
      redirects: [
        { ...referenceRow('/work', 'pages', 7), matchDescendants: true },
      ],
      pages: [{ id: 7, path: 'experience', slug: 'experience' }],
    })

    const [flattened] = await getCmsRedirects()
    expect('toPathAtCapture' in flattened).toBe(false)
  })

  it('asks Payload for the snapshot column (#178)', async () => {
    stubFind({ redirects: [] })
    await getCmsRedirects()

    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        select: expect.objectContaining({ toPathAtCapture: true }),
      }),
    )
  })

  it('asks Payload for the capture identity columns (#201)', async () => {
    stubFind({ redirects: [] })
    await getCmsRedirects()

    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        select: expect.objectContaining({
          toCollectionAtCapture: true,
          toIdAtCapture: true,
        }),
      }),
    )
  })

  it('resolves the capture identity to that document’s CURRENT path (#201)', async () => {
    // The row was captured for page 19 and has since been repointed at page 20
    // — the shape a re-used path leaves behind. All three destinations
    // disagree on purpose: `to` is where the row points NOW, `toPathAtCapture`
    // is a spelling frozen in the past, and `capturedTargetPath` is where the
    // document the row was actually about lives today. Only the third can
    // rewrite that document's old subtree correctly.
    stubFind({
      redirects: [
        {
          ...referenceRow('/work/acme', 'pages', 20),
          matchDescendants: true,
          toPathAtCapture: '/work/acme-corp',
          toCollectionAtCapture: 'pages',
          toIdAtCapture: '19',
        },
      ],
      pages: [
        { id: 19, path: 'work/acme-corp', slug: 'acme-corp' },
        { id: 20, path: 'work/beta', slug: 'beta' },
      ],
    })

    const redirects = await getCmsRedirects()
    expect(redirects).toEqual([
      {
        capturedTargetPath: '/work/acme-corp',
        from: '/work/acme',
        matchDescendants: true,
        to: '/work/beta',
        toIdAtCapture: 'pages:19',
        toPathAtCapture: '/work/acme-corp',
        type: '301',
      },
    ])
    // And end to end through the resolver: the subtree follows the captured
    // document, the exact key stays with the row's own destination.
    expect(resolveRedirect(redirects, '/work/acme/leaf')).toEqual(
      permanentlyTo('/work/acme-corp/leaf'),
    )
    expect(resolveRedirect(redirects, '/work/acme')).toEqual(
      permanentlyTo('/work/beta'),
    )
  })

  it('keeps the identity but drops the path when the captured document is gone (#201)', async () => {
    // The distinction the two keys exist to carry. Page 19 was deleted, so the
    // join answers nothing for it — but the row still records that it was ABOUT
    // page 19, which is what makes the resolver decline rather than hand the
    // subtree to page 20.
    stubFind({
      redirects: [
        {
          ...referenceRow('/work/acme', 'pages', 20),
          matchDescendants: true,
          toPathAtCapture: '/work/acme-corp',
          toCollectionAtCapture: 'pages',
          toIdAtCapture: '19',
        },
      ],
      pages: [{ id: 20, path: 'work/beta', slug: 'beta' }],
    })

    const [flattened] = await getCmsRedirects()
    expect(flattened.toIdAtCapture).toBe('pages:19')
    expect('capturedTargetPath' in flattened).toBe(false)
    expect(resolveRedirect([flattened], '/work/acme/leaf')).toBeNull()
  })

  /**
   * #201 — the identity is for REFERENCE rows, and the gate is at the
   * flattening because that is the last place the distinction survives.
   *
   * An editor can repoint any row's `to` at a custom URL. That URL is the
   * editor's own statement about where the path goes, and the two identity
   * rules would each override it in a different direction: rule 1 would rewrite
   * descendants onto the captured document's path instead of the editor's
   * destination, and rule 2 would 404 them outright because a document the row
   * no longer mentions has been deleted. Neither is the editor's intent, and
   * `resolveRedirect` cannot tell the two row kinds apart — a relative custom
   * URL and a reference-derived path are the same string by then.
   */
  describe('a row repointed at a CUSTOM url keeps its editor’s destination (#201)', () => {
    const customRowCapturedForPage19 = {
      from: '/work/acme',
      matchDescendants: true,
      to: { type: 'custom', url: '/campaigns/spring' },
      toCollectionAtCapture: 'pages',
      toIdAtCapture: '19',
      toPathAtCapture: '/work/acme-corp',
      type: '301' as const,
    }

    it('does not rewrite descendants onto the captured document', async () => {
      // Page 19 is alive and elsewhere; rule 1 must not pull the subtree back
      // to it, because this row no longer points at page 19 at all.
      stubFind({
        redirects: [customRowCapturedForPage19],
        pages: [{ id: 19, path: 'work/acme-corp', slug: 'acme-corp' }],
      })

      const redirects = await getCmsRedirects()
      expect('toIdAtCapture' in redirects[0]).toBe(false)
      expect('capturedTargetPath' in redirects[0]).toBe(false)
      expect(resolveRedirect(redirects, '/work/acme/leaf')).toEqual(
        permanentlyTo('/campaigns/spring/leaf'),
      )
    })

    it('does not 404 descendants because the captured document was deleted', async () => {
      // The same row with page 19 gone. Rule 2's 404 exists so a live document
      // cannot inherit another's subtree; there is no such inheritance here —
      // the destination is a URL an editor typed, and withdrawing it would be
      // a redirect the row's own contents never asked for.
      stubFind({ redirects: [customRowCapturedForPage19], pages: [] })

      const redirects = await getCmsRedirects()
      expect(resolveRedirect(redirects, '/work/acme/leaf')).toEqual(
        permanentlyTo('/campaigns/spring/leaf'),
      )
      expect(resolveRedirect(redirects, '/work/acme')).toEqual(
        permanentlyTo('/campaigns/spring'),
      )
    })
  })

  it('reads a row written before #201 with both identity keys omitted', async () => {
    // Omitted, not `null` — the third time this file asserts it, and the reason
    // is unchanged: a row that predates the column must flatten byte-identically
    // to what this function returned before, so every existing assertion here
    // is also the compatibility promise (AC 4).
    stubFind({
      redirects: [
        {
          ...referenceRow('/work', 'pages', 7),
          matchDescendants: true,
          toPathAtCapture: '/experience',
        },
      ],
      pages: [{ id: 7, path: 'experience', slug: 'experience' }],
    })

    const [flattened] = await getCmsRedirects()
    expect('toIdAtCapture' in flattened).toBe(false)
    expect('capturedTargetPath' in flattened).toBe(false)
  })

  it('joins the captured document in the SAME query as the reference (#201)', async () => {
    // One query per collection, not two: the identity's cost is a couple more
    // ids in an `in` clause the read already makes.
    stubFind({
      redirects: [
        {
          ...referenceRow('/work/acme', 'pages', 20),
          toPathAtCapture: '/work/acme-corp',
          toCollectionAtCapture: 'pages',
          toIdAtCapture: '19',
        },
      ],
      pages: [
        { id: 19, path: 'work/acme-corp', slug: 'acme-corp' },
        { id: 20, path: 'work/beta', slug: 'beta' },
      ],
    })

    await getCmsRedirects()

    const pageQueries = (
      mocks.find.mock.calls as Array<
        [{ collection: string; where?: { id?: { in?: unknown[] } } }]
      >
    ).filter(([args]) => args.collection === 'pages')
    expect(pageQueries).toHaveLength(1)
    // The captured id goes into the clause as the string the varchar holds;
    // Payload sanitises it against the `id` field's own type on the way to
    // Postgres. [measured: the pg-tier test in
    // `evals/redirect-capture-identity-integration.test.ts` resolves a captured
    // id through this exact path against a real `serial` column.]
    expect(pageQueries[0][0].where?.id?.in).toEqual(
      expect.arrayContaining(['19', 20]),
    )
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
