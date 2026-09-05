import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: cacheMocks.revalidatePath }))

import {
  CODE_OWNED_FIRST_SEGMENTS,
  PATH_MAX_DEPTH,
  parentIdOf,
} from '@/fields/slug/documentPath'
import {
  cascadePagePaths,
  computePagePath,
  validatePageHierarchy,
} from './pageHierarchy'
import { refreshCorvusEmbeddings } from '@/hooks/corvusEmbeddings'

/**
 * A page row as the hooks read it back through `findByID` / `find`.
 */
type Row = {
  id: number
  slug: string
  path: string | null
  parent: number | null
}

let rows: Row[] = []

/**
 * A `PayloadRequest` stub backed by {@link rows}. It implements exactly the
 * three reads the hooks make — `findByID` on pages, `find` on pages by `path`,
 * and `find` on posts by `slug` — so a test can state a tree as data and assert
 * on the hook's decision without booting Payload.
 */
const req = () =>
  ({
    payload: {
      find: async ({
        collection,
        where,
      }: {
        collection: string
        where: Record<string, { equals: unknown }>
      }) => {
        if (collection === 'posts') {
          // #153: posts are queried two ways now — by slug (the unplaced
          // `/articles/<slug>` namespace) and by path (a placed article).
          if (where.slug?.equals !== undefined) {
            const slug = where.slug.equals
            return { docs: postSlugs.includes(String(slug)) ? [{ slug }] : [] }
          }
          const path = where.path?.equals
          const hit = placedPostPaths.find((p) => p.path === path)
          return { docs: hit ? [hit] : [] }
        }
        const path = where.path?.equals
        return { docs: rows.filter((r) => r.path === path) }
      },
      findByID: async ({ id }: { id: number | string }) => {
        const row = rows.find((r) => String(r.id) === String(id))
        return row ?? null
      },
    },
  }) as unknown as PayloadRequest

let postSlugs: string[] = []
/** Placed articles (#153), which now compete for the same path namespace. */
let placedPostPaths: Array<{ slug: string; path: string }> = []

/** Hook args shaped like Payload's, with only the fields the hooks read. */
const args = (
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
) =>
  ({
    collection: { slug: 'pages' },
    context: {},
    data,
    operation: originalDoc ? 'update' : 'create',
    originalDoc,
    req: req(),
  }) as never

beforeEach(() => {
  placedPostPaths = []
  postSlugs = []
  rows = [
    { id: 1, slug: 'home', path: 'home', parent: null },
    { id: 2, slug: 'work', path: 'work', parent: null },
    { id: 3, slug: 'brytecore', path: 'work/brytecore', parent: 2 },
    { id: 4, slug: 'tech', path: 'tech', parent: null },
  ]
})

describe('parentIdOf', () => {
  it('reads a bare id, a populated doc, and the unset cases', () => {
    expect(parentIdOf(7)).toBe(7)
    expect(parentIdOf('7')).toBe('7')
    expect(parentIdOf({ id: 7, slug: 'x' })).toBe(7)
    expect(parentIdOf(null)).toBeNull()
    expect(parentIdOf(undefined)).toBeNull()
    expect(parentIdOf('')).toBeNull()
    expect(parentIdOf({})).toBeNull()
  })
})

describe('computePagePath', () => {
  it('stores path = slug for a top-level page — every existing URL is unchanged', async () => {
    const out = await computePagePath(args({ slug: 'colophon', parent: null }))
    expect(out).toMatchObject({ path: 'colophon' })
  })

  it('stores parent.path + / + slug for a child', async () => {
    const out = await computePagePath(args({ slug: 'careers', parent: 2 }))
    expect(out).toMatchObject({ path: 'work/careers' })
  })

  it('stores a depth-3 path under a grandchild', async () => {
    const out = await computePagePath(args({ slug: 'deep', parent: 3 }))
    expect(out).toMatchObject({ path: 'work/brytecore/deep' })
  })

  it('omits the root segment for a child of the site root', async () => {
    // The storage half of the root contract: the root serves `/`, so its
    // children serve `/<child>` and not `/home/<child>`.
    const out = await computePagePath(args({ slug: 'colophon', parent: 1 }))
    expect(out).toMatchObject({ path: 'colophon' })
  })

  it('keeps the stored placement when a PATCH sends only a title', async () => {
    const out = await computePagePath(
      args({ title: 'Renamed' }, { id: 3, slug: 'brytecore', parent: 2 }),
    )
    expect(out).toMatchObject({ path: 'work/brytecore' })
  })

  it('honours an explicit parent: null that unplaces a child', async () => {
    const out = await computePagePath(
      args({ parent: null }, { id: 3, slug: 'brytecore', parent: 2 }),
    )
    expect(out).toMatchObject({ path: 'brytecore' })
  })

  it('leaves data alone when there is no slug yet', async () => {
    const out = await computePagePath(args({ title: 'Untitled' }))
    expect(out).not.toHaveProperty('path')
  })
})

describe('validatePageHierarchy', () => {
  it('accepts a plain top-level page', async () => {
    await expect(
      validatePageHierarchy(args({ slug: 'colophon', parent: null })),
    ).resolves.toBeTruthy()
  })

  it('accepts a child under a reserved first segment — /tech/ai resolves (D1)', async () => {
    // `tech` is in RESERVED_PAGE_SLUGS and `/tech` is a dedicated route. That
    // reservation is an *emit* exclusion, not a save-time one: the dedicated
    // route owns exactly `/tech`, so `/tech/ai` falls through to the catch-all.
    await expect(
      validatePageHierarchy(args({ slug: 'ai', parent: 4 })),
    ).resolves.toBeTruthy()
  })

  it('accepts re-saving a page that already owns its path', async () => {
    await expect(
      validatePageHierarchy(
        args({ slug: 'brytecore' }, { id: 3, slug: 'brytecore', parent: 2 }),
      ),
    ).resolves.toBeTruthy()
  })

  it('accepts the live reserved-slug pages the dedicated routes read', async () => {
    // `/about` and `/articles` are dedicated routes that take their copy from a
    // Pages doc. Rejecting a reserved root slug here would make those documents
    // unsaveable — the reason CODE_OWNED_FIRST_SEGMENTS is a different set.
    rows.push({ id: 5, slug: 'about', path: 'about', parent: null })
    await expect(
      validatePageHierarchy(
        args({ slug: 'about' }, { id: 5, slug: 'about', parent: null }),
      ),
    ).resolves.toBeTruthy()
  })

  it('rejects a page that is its own parent', async () => {
    await expect(
      validatePageHierarchy(
        args({ slug: 'work', parent: 2 }, { id: 2, slug: 'work' }),
      ),
    ).rejects.toThrow(/cannot be its own parent/i)
  })

  it('rejects a parent that is a descendant of the page (cycle)', async () => {
    // Making `work` a child of its own child `brytecore` would loop.
    await expect(
      validatePageHierarchy(
        args({ slug: 'work', parent: 3 }, { id: 2, slug: 'work' }),
      ),
    ).rejects.toThrow(/would create a loop/i)
  })

  it('rejects a 4-deep path (D3 depth cap)', async () => {
    rows.push({
      id: 5,
      slug: 'deep',
      path: 'work/brytecore/deep',
      parent: 3,
    })
    await expect(
      validatePageHierarchy(args({ slug: 'deeper', parent: 5 })),
    ).rejects.toThrow(new RegExp(`at most ${PATH_MAX_DEPTH} levels deep`, 'i'))
  })

  it('rejects a code-owned first segment', async () => {
    await expect(
      validatePageHierarchy(args({ slug: 'api', parent: null })),
    ).rejects.toThrow(/owned by the application/i)
  })

  it('rejects a page nested under a code-owned first segment', async () => {
    rows.push({ id: 5, slug: 'admin', path: 'admin', parent: null })
    await expect(
      validatePageHierarchy(args({ slug: 'anything', parent: 5 })),
    ).rejects.toThrow(/owned by the application/i)
  })

  it('names every code-owned first segment it guards', () => {
    expect([...CODE_OWNED_FIRST_SEGMENTS].sort()).toEqual([
      'admin',
      'api',
      'feed.xml',
      'llms-full.txt',
      'llms.txt',
      'manifest.webmanifest',
      'next',
      'robots.txt',
      'sitemap.xml',
    ])
  })

  it('rejects a path another page already serves', async () => {
    await expect(
      validatePageHierarchy(args({ slug: 'brytecore', parent: 2 })),
    ).rejects.toThrow(/already serves \/work\/brytecore/i)
  })

  it('rejects a path that collides with a Post’s /articles URL', async () => {
    postSlugs = ['hello-world']
    rows.push({ id: 5, slug: 'articles', path: 'articles', parent: null })
    await expect(
      validatePageHierarchy(args({ slug: 'hello-world', parent: 5 })),
    ).rejects.toThrow(/already the article/i)
  })

  it('allows an /articles child that no Post occupies', async () => {
    postSlugs = ['hello-world']
    rows.push({ id: 5, slug: 'articles', path: 'articles', parent: null })
    await expect(
      validatePageHierarchy(args({ slug: 'nothing-here', parent: 5 })),
    ).resolves.toBeTruthy()
  })

  it('rejects rather than accepts when the ancestor walk is exhausted', async () => {
    // A parent chain longer than any legal tree means the stored data is
    // malformed. A guard that ran out of budget has not proved the write safe,
    // so it must refuse — silently accepting on an exhausted search is how a
    // cycle guard comes to certify a cycle.
    rows = [{ id: 1, slug: 'p0', path: 'p0', parent: null }]
    for (let i = 1; i <= 40; i += 1) {
      rows.push({ id: i + 1, slug: `p${i}`, path: `p${i}`, parent: i })
    }
    await expect(
      validatePageHierarchy(
        args({ slug: 'x', parent: 41 }, { id: 999, slug: 'x' }),
      ),
    ).rejects.toThrow(/parent chain is broken/i)
  })

  it('accepts a chain comfortably inside the walk bound', async () => {
    rows = [
      { id: 1, slug: 'a', path: 'a', parent: null },
      { id: 2, slug: 'b', path: 'b', parent: 1 },
    ]
    await expect(
      validatePageHierarchy(
        args({ slug: 'c', parent: 2 }, { id: 3, slug: 'c' }),
      ),
    ).resolves.toBeTruthy()
  })

  it('rejects a parent id that does not resolve', async () => {
    await expect(
      validatePageHierarchy(args({ slug: 'orphan', parent: 999 })),
    ).rejects.toThrow(/parent page not found/i)
  })

  it('returns without a query when there is no slug yet', async () => {
    await expect(
      validatePageHierarchy(args({ title: 'Untitled' })),
    ).resolves.toBeTruthy()
  })
})

describe('validatePageHierarchy · placed articles (#153)', () => {
  it('rejects a page whose path a PLACED article already serves', async () => {
    placedPostPaths = [{ slug: 'launch', path: 'work/launch' }]
    await expect(
      validatePageHierarchy(args({ slug: 'launch', parent: 2 })),
    ).rejects.toThrow(/already the article “launch”/)
  })

  it('still rejects a page colliding with an UNPLACED article’s /articles URL', async () => {
    postSlugs = ['hello-world']
    rows.push({ id: 5, slug: 'articles', path: 'articles', parent: null })
    await expect(
      validatePageHierarchy(args({ slug: 'hello-world', parent: 5 })),
    ).rejects.toThrow(/already the article “hello-world”/)
  })
})

/**
 * The subtree cascade (#150 AC2/AC3/AC5).
 *
 * @remarks Its own harness rather than the tree stub above, because what these
 * cases assert is not a decision about one document — it is the SHAPE of the
 * fan-out: how many writes it makes, in what order, and with which `context`.
 * A depth-3 tree is stated as data and every `payload.update` is recorded.
 */
describe('cascadePagePaths', () => {
  type Doc = { collection: 'pages' | 'posts'; id: number; path: string }

  /** A depth-3 subtree under `work`, plus one decoy that merely contains it. */
  const subtree = (): Doc[] => [
    { collection: 'pages', id: 2, path: 'work/brytecore' },
    { collection: 'pages', id: 3, path: 'work/brytecore/team' },
    { collection: 'posts', id: 20, path: 'work/launch' },
    // `ILIKE '%work/%'` matches this too. The cascade must not renumber it.
    { collection: 'pages', id: 99, path: 'homework/deep' },
  ]

  const harness = (docs: Doc[] = subtree()) => {
    const updates: Array<{
      collection: string
      context: Record<string, unknown>
      data: Record<string, unknown>
      id: unknown
    }> = []
    const req = {
      context: {
        previousPublishedStoredPaths: { 'pages:1': 'work' },
      } as Record<string, unknown>,
      payload: {
        find: vi.fn(async ({ collection }: { collection: string }) => ({
          docs: docs.filter((doc) => doc.collection === collection),
        })),
        logger: { error: vi.fn(), info: vi.fn() },
        update: vi.fn(
          async (args: {
            collection: string
            context: Record<string, unknown>
            data: Record<string, unknown>
            id: unknown
          }) => {
            updates.push({
              collection: args.collection,
              context: args.context,
              data: args.data,
              id: args.id,
            })
            return { id: args.id }
          },
        ),
      },
    }
    return { req, updates }
  }

  const move = async (
    req: unknown,
    context: Record<string, unknown> = {},
    doc: Record<string, unknown> = { id: 1, path: 'experience' },
  ) =>
    cascadePagePaths({
      collection: { slug: 'pages' },
      context,
      doc,
      operation: 'update',
      req,
    } as never)

  beforeEach(() => {
    cacheMocks.revalidatePath.mockClear()
  })

  /**
   * AC3, pinned as an exact count rather than an upper bound. Three
   * descendants means three writes — not nine, which is what a cascade that
   * re-entered itself for each descendant would perform on this tree.
   */
  it('performs exactly one update per descendant — O(subtree), not O(subtree²)', async () => {
    const { req, updates } = harness()
    await move(req)

    expect(updates).toHaveLength(3)
    expect(updates.map((u) => `${u.collection}#${u.id}`)).toEqual([
      'pages#2',
      'posts#20',
      'pages#3',
    ])
  })

  /**
   * The cascade computes NO path. Each descendant's own `beforeChange`
   * (`computePagePath` / `computePostPath`) is the single authority on how a
   * path is composed, and a hand-computed value passed alongside it would be
   * dead in the ordinary case and silently discarded in the one case where the
   * two could disagree. The stored result is asserted where it is real, on
   * Postgres, in `evals/pages-hierarchy-integration.test.ts`.
   */
  it('sends an empty data payload — the collection recomputes the path', async () => {
    const { req, updates } = harness()
    await move(req)

    for (const update of updates) {
      expect(update.data).toEqual({})
      expect('path' in update.data).toBe(false)
    }
  })

  /**
   * Shallowest first, and it is the ONLY thing making the recomputation
   * correct now that no path is supplied: `computePagePath` composes a child's
   * path from its PARENT's stored path, so writing `work/brytecore/team`
   * before `work/brytecore` recomputes the old prefix straight back in.
   */
  it('updates parents before their own children', async () => {
    const { req, updates } = harness()
    await move(req)

    const order = updates.map((u) => `${u.collection}#${u.id}`)
    expect(order.indexOf('pages#2')).toBeLessThan(order.indexOf('pages#3'))
  })

  it('does not touch a document that merely CONTAINS the prefix', async () => {
    const { req, updates } = harness()
    await move(req)

    expect(updates.some((u) => u.id === 99)).toBe(false)
  })

  it('purges each descendant’s vacated URL', async () => {
    const { req } = harness()
    await move(req)

    expect(cacheMocks.revalidatePath.mock.calls.map(([p]) => p)).toEqual([
      '/work/brytecore',
      '/work/launch',
      '/work/brytecore/team',
    ])
  })

  it('stops the recursion and suppresses per-descendant redirect rows', async () => {
    const { req, updates } = harness()
    await move(req)

    for (const update of updates) {
      expect(update.context.disablePathCascade).toBe(true)
      expect(update.context.disableSlugRedirect).toBe(true)
    }
  })

  /**
   * AC5. The cascade flag must not reach the embeddings hook: a placed post
   * under a moved page genuinely changed its `sourceUrl`, so it has to be
   * re-embedded. Asserted by handing the real hook the exact context the
   * cascade builds and checking it does not return early.
   */
  it('leaves refreshCorvusEmbeddings free to run on a moved post', async () => {
    const { req, updates } = harness()
    await move(req)

    const postUpdate = updates.find((u) => u.collection === 'posts')
    expect(postUpdate).toBeDefined()

    // A `db.drizzle` that records the moment the hook reaches for it. The
    // guard the cascade could have tripped (`context.disableRevalidate`) is
    // the FIRST line of the hook, before any database access — so "was the
    // driver read at all" is exactly the question worth asking.
    let reachedTheDatabase = false
    const db = {
      get drizzle() {
        reachedTheDatabase = true
        return { execute: vi.fn(async () => []) }
      },
    }
    const doc = { id: 20, _status: 'published' }
    await refreshCorvusEmbeddings('posts')({
      collection: { slug: 'posts' },
      context: postUpdate!.context,
      doc,
      operation: 'update',
      previousDoc: doc,
      req: {
        context: postUpdate!.context,
        payload: { db, logger: { error: vi.fn(), info: vi.fn() } },
        query: {},
      },
    } as never)

    expect(reachedTheDatabase).toBe(true)
  })

  it('honours context.disablePathCascade — a descendant write cascades nothing', async () => {
    const { req, updates } = harness()
    await move(req, { disablePathCascade: true })

    expect(updates).toHaveLength(0)
  })

  it('does nothing when the path did not move', async () => {
    const { req, updates } = harness()
    await move(req, {}, { id: 1, path: 'work' })

    expect(updates).toHaveLength(0)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('does nothing when no previous published path was captured', async () => {
    const { req, updates } = harness()
    req.context = {}
    await move(req)

    expect(updates).toHaveLength(0)
  })

  it('honours context.disableRevalidate for the purge only', async () => {
    const { req, updates } = harness()
    await move(req, { disableRevalidate: true })

    expect(updates).toHaveLength(3)
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled()
  })
})
