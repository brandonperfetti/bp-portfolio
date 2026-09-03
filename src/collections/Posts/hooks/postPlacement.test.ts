import { beforeEach, describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import { computePostPath, validatePostPlacement } from './postPlacement'

/**
 * Post placement (#153): the `beforeValidate` guard and the `beforeChange`
 * computation, exercised against a stubbed Payload request so a test can state
 * a page tree as data and assert on the hooks' decisions without booting
 * Payload. The pg-tier counterpart —
 * `evals/post-placement-integration.test.ts` — proves the same rules against
 * real Payload and real Postgres.
 */

type PageRow = { id: number; slug: string; path: string | null }
type PostRow = { id: number; slug: string; path: string | null }

let pages: PageRow[] = []
let posts: PostRow[] = []

/**
 * A `PayloadRequest` stub implementing exactly the reads the hooks make:
 * `findByID` on pages (the parent lookup) and `find` on pages/posts by `path`
 * (the two collision reads).
 */
const req = () =>
  ({
    payload: {
      find: async ({
        collection,
        where,
      }: {
        collection: string
        where: Record<string, { equals?: unknown }>
      }) => {
        const path = where.path?.equals
        if (collection === 'pages') {
          return { docs: pages.filter((p) => p.path === path) }
        }
        if (where.slug?.equals !== undefined) {
          const slug = where.slug.equals
          return { docs: posts.filter((p) => p.slug === slug) }
        }
        return { docs: posts.filter((p) => p.path === path) }
      },
      findByID: async ({ id }: { id: number | string }) =>
        pages.find((p) => String(p.id) === String(id)) ?? null,
    },
  }) as unknown as PayloadRequest

/** Hook args shaped like Payload's, with only the fields the hooks read. */
const args = (
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
) =>
  ({
    collection: { slug: 'posts' },
    context: {},
    data,
    operation: originalDoc ? 'update' : 'create',
    originalDoc,
    req: req(),
  }) as never

beforeEach(() => {
  pages = [
    { id: 1, slug: 'home', path: 'home' },
    { id: 2, slug: 'work', path: 'work' },
    { id: 3, slug: 'brytecore', path: 'work/brytecore' },
    { id: 4, slug: 'articles', path: 'articles' },
    { id: 5, slug: 'api', path: 'api' },
  ]
  posts = []
})

describe('computePostPath', () => {
  it('leaves an unplaced post with a NULL path — the v3 default', async () => {
    const out = await computePostPath(args({ slug: 'hello' }))
    expect(out).toMatchObject({ path: null })
  })

  it('clears the path when an editor un-places a post', async () => {
    const out = await computePostPath(
      args({ parent: null }, { slug: 'hello', parent: 2, path: 'work/hello' }),
    )
    expect(out).toMatchObject({ path: null })
  })

  it('composes the parent page’s path with the post’s slug', async () => {
    const out = await computePostPath(args({ slug: 'hello', parent: 2 }))
    expect(out).toMatchObject({ path: 'work/hello' })
  })

  it('composes against a nested parent page', async () => {
    const out = await computePostPath(args({ slug: 'hello', parent: 3 }))
    expect(out).toMatchObject({ path: 'work/brytecore/hello' })
  })

  it('gives the root page no segment, so a post under it serves /<slug>', async () => {
    const out = await computePostPath(args({ slug: 'hello', parent: 1 }))
    expect(out).toMatchObject({ path: 'hello' })
  })

  it('keeps the stored placement on a PATCH that sends only a title', async () => {
    const out = await computePostPath(
      args({ title: 'New' }, { slug: 'hello', parent: 2, path: 'work/hello' }),
    )
    expect(out).toMatchObject({ path: 'work/hello' })
  })

  it('recomputes the path when a placed post is re-slugged', async () => {
    const out = await computePostPath(
      args(
        { slug: 'goodbye' },
        { slug: 'hello', parent: 2, path: 'work/hello' },
      ),
    )
    expect(out).toMatchObject({ path: 'work/goodbye' })
  })
})

describe('validatePostPlacement', () => {
  it('accepts an unplaced post without reading anything', async () => {
    await expect(
      validatePostPlacement(args({ slug: 'hello' })),
    ).resolves.toBeDefined()
  })

  it('accepts a placement under a published section page', async () => {
    await expect(
      validatePostPlacement(args({ slug: 'hello', parent: 2 })),
    ).resolves.toBeDefined()
  })

  it('rejects a parent page that does not resolve', async () => {
    await expect(
      validatePostPlacement(args({ slug: 'hello', parent: 99 })),
    ).rejects.toThrow(/Parent page not found/)
  })

  it('rejects a placement deeper than the shared cap', async () => {
    pages.push({ id: 6, slug: 'deep', path: 'work/brytecore/deep' })
    await expect(
      validatePostPlacement(args({ slug: 'hello', parent: 6 })),
    ).rejects.toThrow(/at most 3 levels deep/)
  })

  it('rejects a first segment owned by the application', async () => {
    await expect(
      validatePostPlacement(args({ slug: 'hello', parent: 5 })),
    ).rejects.toThrow(/owned by the application/)
  })

  it('rejects a placement back inside the /articles archive', async () => {
    await expect(
      validatePostPlacement(args({ slug: 'hello', parent: 4 })),
    ).rejects.toThrow(/inside the article archive/)
  })

  it('rejects a path another placed article already serves', async () => {
    posts = [{ id: 10, slug: 'hello', path: 'work/hello' }]
    await expect(
      validatePostPlacement(args({ slug: 'hello', parent: 2 })),
    ).rejects.toThrow(/Another article already serves \/work\/hello/)
  })

  it('lets a placed article keep its own path on a re-save', async () => {
    posts = [{ id: 10, slug: 'hello', path: 'work/hello' }]
    await expect(
      validatePostPlacement(
        args(
          { slug: 'hello', parent: 2 },
          { id: 10, slug: 'hello', parent: 2, path: 'work/hello' },
        ),
      ),
    ).resolves.toBeDefined()
  })

  it('rejects a path a Page already serves — the cross-collection guard', async () => {
    await expect(
      validatePostPlacement(args({ slug: 'brytecore', parent: 2 })),
    ).rejects.toThrow(/already the page “brytecore”/)
  })

  it('does not check anything when the create has no slug yet', async () => {
    await expect(
      validatePostPlacement(args({ parent: 2 })),
    ).resolves.toBeDefined()
  })
})
