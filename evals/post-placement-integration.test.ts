// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Post placement against a REAL Payload instance on REAL Postgres (#153).
 *
 * @remarks **Why this tier and not a unit test.** `docs/TESTING.md`
 * §"Payload pipeline integration" states the rule — mock `payload.find` at your
 * peril — and `postPlacement.ts` sits in exactly the hazard class its sibling
 * `pages-hierarchy-integration.test.ts` was written for. Four properties this
 * file exercises cannot be observed against a mocked `find`:
 *
 * 1. **M2's real schema.** The unique index on `posts.path` and the FK to
 *    `pages.id` are what actually enforce "one document per URL"; the hook's
 *    read only exists to phrase the rejection for an editor. A mock proves
 *    neither, and in particular proves nothing about the claim the whole
 *    no-backfill design rests on — that a NULL path never collides.
 * 2. **`beforeValidate` → `beforeChange` ordering.** The guard must reject
 *    before `computePostPath` stores anything. Only the real operation pipeline
 *    runs them in that order.
 * 3. **Nested Local API reads forwarding `req`.** The parent lookup and both
 *    collision reads join the caller's transaction; a mock neither opens one
 *    nor performs the `createLocalReq` `req.context` swap that
 *    `capturePublishedSlug`'s docblock records as having silently broken the
 *    first cut of that hook.
 * 4. **Un-placing.** Clearing `parent` has to write `path: NULL` through
 *    Payload's own partial-update merge, not merely return it from a hook.
 *
 * What is real here: Postgres, the migrated schema including M2, the whole
 * Payload create/update pipeline, drafts/versions, and both placement hooks.
 *
 * **Why `next/cache` is stubbed.** Identical to its two sibling files:
 * `revalidatePost` runs first in the collection's `afterChange` array and calls
 * `revalidatePath`, which throws outside a Next request scope and would roll
 * the write back long before anything asserted here could be observed.
 *
 * Runs in the `e2e` job, the only one with `pgvector/pgvector:pg16` and a real
 * `pnpm migrate`. Every row is marked and removed in `afterAll`.
 */

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-post-placement-integration'

/** A minimal valid `layout` — the Pages field is `required`, so `[]` is rejected. */
const layout = [{ blockType: 'spacer', size: 'md' }]

/** A minimal valid Lexical body — Posts' `content` is required. */
const lexical = (text: string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [
          {
            type: 'text',
            text,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
})

describe('post placement integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'Posts parent + computed path (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let publicPathFor: typeof import('../src/fields/slug/slugPaths').publicPathFor
    let section: { id: number | string; path?: string | null }

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'posts',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    const mkPage = async (slug: string, parent?: number | string) =>
      payload.create({
        collection: 'pages',
        overrideAccess: true,
        data: {
          title: slug,
          layout,
          _status: 'published',
          slug,
          ...(parent === undefined ? {} : { parent }),
        } as never,
      })

    const mkPost = async (slug: string, parent?: number | string) =>
      payload.create({
        collection: 'posts',
        overrideAccess: true,
        data: {
          title: slug,
          slug,
          content: lexical('body'),
          _status: 'published',
          ...(parent === undefined ? {} : { parent }),
        } as never,
      })

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      ;({ publicPathFor } = await import('../src/fields/slug/slugPaths'))
      payload = await getPayload({ config })
      await cleanup()
      section = await mkPage(`${MARKER}-work`)
    }, 120_000)

    afterAll(cleanup)

    it('AC1 — an unplaced post stores NO path and keeps its /articles URL', async () => {
      const post = await mkPost(`${MARKER}-plain`)
      expect(post.path ?? null).toBeNull()
      expect(publicPathFor('posts', post)).toBe(`/articles/${MARKER}-plain`)
    })

    it('AC1 — many unplaced posts coexist: NULL never trips the unique index', async () => {
      // The whole no-backfill design rests on this. Postgres unique indexes
      // admit unlimited NULLs, which is why "unplaced" can be the state of the
      // entire corpus.
      await mkPost(`${MARKER}-plain-2`)
      await mkPost(`${MARKER}-plain-3`)
      const { totalDocs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        limit: 0,
        where: { slug: { like: `%${MARKER}-plain%` } },
      })
      expect(totalDocs).toBe(3)
    })

    it('AC2 — placing a post computes its path and moves its public URL', async () => {
      const post = await mkPost(`${MARKER}-placed`, section.id)
      expect(post.path).toBe(`${MARKER}-work/${MARKER}-placed`)
      expect(publicPathFor('posts', post)).toBe(
        `/${MARKER}-work/${MARKER}-placed`,
      )

      // Persisted by `beforeChange`, not merely decorated onto the response —
      // and resolvable by the one indexed equality read the catch-all makes.
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        pagination: false,
        where: { path: { equals: post.path as string } },
      })
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe(post.id)
    })

    it('AC2 — the /articles/<slug> early check fires for a placed post and not for an unplaced one', async () => {
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        pagination: false,
        where: { slug: { in: [`${MARKER}-placed`, `${MARKER}-plain`] } },
      })
      for (const doc of docs) {
        const routePath = `/articles/${doc.slug}`
        const placedPath = publicPathFor('posts', doc)
        // This is exactly the comparison `/articles/[slug]` makes before it
        // calls `permanentRedirect`.
        expect(placedPath !== routePath).toBe(doc.slug === `${MARKER}-placed`)
      }
    })

    it('un-placing a post clears its path and returns it to /articles', async () => {
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-placed` } },
      })
      const placed = docs[0]
      expect(placed.path).toBeTruthy()

      const unplaced = await payload.update({
        collection: 'posts',
        id: placed.id,
        overrideAccess: true,
        data: { parent: null } as never,
      })
      expect(unplaced.path ?? null).toBeNull()
      expect(publicPathFor('posts', unplaced)).toBe(
        `/articles/${MARKER}-placed`,
      )

      // The vacated path resolves to nothing at all — no page, no post. That is
      // the residue this ticket records: the URL 404s rather than redirecting,
      // and closing it needs #150's published-path capture.
      const vacated = `${MARKER}-work/${MARKER}-placed`
      const [pages, posts] = await Promise.all([
        payload.find({
          collection: 'pages',
          overrideAccess: true,
          limit: 0,
          where: { path: { equals: vacated } },
        }),
        payload.find({
          collection: 'posts',
          overrideAccess: true,
          limit: 0,
          where: { path: { equals: vacated } },
        }),
      ])
      expect(pages.totalDocs).toBe(0)
      expect(posts.totalDocs).toBe(0)

      // Restore the placement for the collision cases below.
      await payload.update({
        collection: 'posts',
        id: placed.id,
        overrideAccess: true,
        data: { parent: section.id } as never,
      })
    })

    it('rejects a placement colliding with an existing PAGE path', async () => {
      const child = await mkPage(`${MARKER}-child`, section.id)
      expect(child.path).toBe(`${MARKER}-work/${MARKER}-child`)

      await expect(mkPost(`${MARKER}-child`, section.id)).rejects.toThrow(
        /already the page/,
      )
    })

    it('rejects a PAGE colliding with an existing placed-post path', async () => {
      // The guard is symmetric, which is what stops the winner being "whichever
      // document happened to be saved second".
      await expect(mkPage(`${MARKER}-placed`, section.id)).rejects.toThrow(
        /already the article/,
      )
    })

    it('rejects two posts placed at the same path', async () => {
      const other = await mkPage(`${MARKER}-work2`)
      const a = await mkPost(`${MARKER}-dup`, other.id)
      expect(a.path).toBe(`${MARKER}-work2/${MARKER}-dup`)
      // A second post cannot take the same slug under the same parent.
      await expect(mkPost(`${MARKER}-dup`, other.id)).rejects.toThrow(
        /Another article already serves/,
      )
    })

    it('rejects a placement inside the /articles archive', async () => {
      const archive = await mkPage('articles')
        .then((p) => p)
        .catch(async () => {
          const { docs } = await payload.find({
            collection: 'pages',
            overrideAccess: true,
            pagination: false,
            where: { path: { equals: 'articles' } },
          })
          return docs[0]
        })
      if (!archive) return
      await expect(mkPost(`${MARKER}-inarchive`, archive.id)).rejects.toThrow(
        /inside the article archive/,
      )
    })

    it('rejects a placement deeper than the shared cap', async () => {
      const child = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-child` } },
      })
      const grand = await mkPage(`${MARKER}-grand`, child.docs[0].id)
      expect(grand.path).toBe(`${MARKER}-work/${MARKER}-child/${MARKER}-grand`)
      await expect(mkPost(`${MARKER}-deep`, grand.id)).rejects.toThrow(
        /at most 3 levels deep/,
      )
    })

    it('refuses to re-slug a placed, PUBLISHED post until #150 (the stop-gap)', async () => {
      // The row `createSlugRedirect` would write here has an `/articles` `from`,
      // so `/work2/<old>` would become a hard 404. `refusePlacedSlugRename`
      // turns that silent break into a refusal the editor can act on. Drop that
      // commit and this case becomes "recomputes its path under the same
      // parent", which is what the hooks alone do.
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-dup` } },
      })
      await expect(
        payload.update({
          collection: 'posts',
          id: docs[0].id,
          overrideAccess: true,
          data: { slug: `${MARKER}-dup2`, slugLock: false } as never,
        }),
      ).rejects.toThrow(/#150/)
    })

    it('re-slugging an UNPLACED post is untouched — the #120 path still works', async () => {
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-plain-3` } },
      })
      const updated = await payload.update({
        collection: 'posts',
        id: docs[0].id,
        overrideAccess: true,
        data: { slug: `${MARKER}-plain-3b`, slugLock: false } as never,
      })
      expect(updated.slug).toBe(`${MARKER}-plain-3b`)
      expect(updated.path ?? null).toBeNull()
    })

    it('un-placing then re-slugging is the documented two-step, and it works', async () => {
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-dup` } },
      })
      const unplaced = await payload.update({
        collection: 'posts',
        id: docs[0].id,
        overrideAccess: true,
        data: { parent: null } as never,
      })
      expect(unplaced.path ?? null).toBeNull()

      const renamed = await payload.update({
        collection: 'posts',
        id: docs[0].id,
        overrideAccess: true,
        data: { slug: `${MARKER}-dup2`, slugLock: false } as never,
      })
      expect(renamed.slug).toBe(`${MARKER}-dup2`)

      const { docs: sections } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-work2` } },
      })
      const replaced = await payload.update({
        collection: 'posts',
        id: docs[0].id,
        overrideAccess: true,
        data: { parent: sections[0].id } as never,
      })
      // The two-step lands the article at its new section URL, which is what
      // makes the refusal a redirection of effort rather than a dead end.
      expect(replaced.path).toBe(`${MARKER}-work2/${MARKER}-dup2`)
    })

    it('AC — every pre-existing post URL is byte-identical after M2', async () => {
      // Nothing outside this file's own marker was placed, so every other post
      // in the database must still answer `/articles/<slug>`.
      const { docs } = await payload.find({
        collection: 'posts',
        overrideAccess: true,
        limit: 1000,
        pagination: false,
        where: { slug: { not_like: `%${MARKER}%` } },
      })
      for (const doc of docs) {
        expect(doc.path ?? null).toBeNull()
        expect(publicPathFor('posts', doc)).toBe(`/articles/${doc.slug}`)
      }
    })
  },
)
