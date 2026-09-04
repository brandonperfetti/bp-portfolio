import { beforeEach, describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import {
  CODE_OWNED_FIRST_SEGMENTS,
  PATH_MAX_DEPTH,
  parentIdOf,
} from '@/fields/slug/documentPath'
import { computePagePath, validatePageHierarchy } from './pageHierarchy'

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
