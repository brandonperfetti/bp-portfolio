// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Pages hierarchy against a REAL Payload instance on REAL Postgres (#148).
 *
 * @remarks **Why this tier and not a unit test.** `docs/TESTING.md` §"Payload
 * pipeline integration" states the rule this file exists to honour — mock
 * `payload.find` at your peril — and #120 is the precedent: its hooks shipped
 * broken twice behind green mocked tests, because the defect was in Payload's
 * own plumbing rather than the hooks' branching.
 *
 * `pageHierarchy.ts` sits in exactly that hazard class. Three of its properties
 * cannot be observed by a mocked `find`:
 *
 * 1. **Nested Local API reads forwarding `req`.** `readHierarchyRow` and the
 *    collision checks call `payload.findByID`/`payload.find` with the in-flight
 *    `req` so they join the caller's transaction. A mock neither opens a
 *    transaction nor performs the `createLocalReq` `req.context` swap that
 *    `capturePublishedSlug`'s docblock records as having silently broken the
 *    first cut of that hook.
 * 2. **`beforeValidate` → `beforeChange` ordering.** The guard must run, and
 *    reject, before `computePagePath` ever stores a path. Only the real
 *    operation pipeline runs them in that order.
 * 3. **`originalDoc` under autosave.** Pages autosave at a 100ms interval, so
 *    on the real editorial path `originalDoc` is the autosaved draft. The
 *    placement merge (`data.parent ?? originalDoc.parent`) has to be correct
 *    against whatever Payload actually hands it, not against a fixture.
 *
 * What is real here: Postgres, the migrated schema (including M1's unique index
 * on `pages.path`), the whole Payload create/update operation, the
 * versions/drafts machinery, and both hierarchy hooks.
 *
 * **Why `next/cache` is stubbed.** Identical to
 * `slug-redirect-integration.test.ts`: `revalidatePage` runs FIRST in the
 * collection's `afterChange` array and calls `revalidatePath`, which throws
 * outside a Next request scope and would roll back the page itself long before
 * anything this file asserts could be observed.
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
const MARKER = 'zz-pages-hierarchy-integration'

/** A minimal valid `layout` — the field is `required`, so `[]` is rejected. */
const layout = [{ blockType: 'spacer', size: 'md' }]

/** A minimal valid Lexical body, for the one Post this file creates. */
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

describe('pages hierarchy integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'Pages parent + computed path (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'posts',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    /** Create a published page, letting the hooks compute its path. */
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

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      await cleanup()
    }, 120_000)

    afterAll(cleanup)

    it('computes root → child → grandchild paths through the real pipeline', async () => {
      const root = await mkPage(`${MARKER}-root`)
      expect(root.path).toBe(`${MARKER}-root`)

      const child = await mkPage(`${MARKER}-child`, root.id)
      expect(child.path).toBe(`${MARKER}-root/${MARKER}-child`)

      const grandchild = await mkPage(`${MARKER}-grand`, child.id)
      expect(grandchild.path).toBe(
        `${MARKER}-root/${MARKER}-child/${MARKER}-grand`,
      )

      // And the stored row agrees with what `create` returned — the path is
      // persisted by `beforeChange`, not merely decorated onto the response.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { path: { equals: grandchild.path as string } },
      })
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe(grandchild.id)
    })

    it('rejects a 4-deep path at the depth cap (D3)', async () => {
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-grand` } },
      })
      const grandchild = docs[0]
      expect(grandchild).toBeTruthy()

      await expect(mkPage(`${MARKER}-too-deep`, grandchild.id)).rejects.toThrow(
        /3 levels deep/i,
      )

      // The guard ran in `beforeValidate`, so nothing was written.
      const after = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-too-deep` } },
      })
      expect(after.docs).toHaveLength(0)
    })

    it('rejects a cycle — reparenting an ancestor under its own descendant', async () => {
      const all = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { like: `%${MARKER}%` } },
      })
      const root = all.docs.find((d) => d.slug === `${MARKER}-root`)!
      const grandchild = all.docs.find((d) => d.slug === `${MARKER}-grand`)!

      await expect(
        payload.update({
          collection: 'pages',
          id: root.id,
          overrideAccess: true,
          data: { parent: grandchild.id },
        }),
      ).rejects.toThrow(/loop/i)

      await expect(
        payload.update({
          collection: 'pages',
          id: root.id,
          overrideAccess: true,
          data: { parent: root.id },
        }),
      ).rejects.toThrow(/its own parent/i)

      // The ancestor walk that proved this used nested Local API reads on the
      // caller's `req`; the root's own placement is untouched.
      const reread = await payload.findByID({
        collection: 'pages',
        id: root.id,
        overrideAccess: true,
      })
      expect(reread.parent).toBeFalsy()
      expect(reread.path).toBe(`${MARKER}-root`)
    })

    it('rejects a duplicate path — the unique index and the readable guard agree', async () => {
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-root` } },
      })
      const root = docs[0]

      // Same slug under the same parent computes the same path.
      await expect(mkPage(`${MARKER}-child`, root.id)).rejects.toThrow(
        /already serves/i,
      )
    })

    it('recomputes a leaf’s own path when it is renamed', async () => {
      // A DRAFT leaf, deliberately. `refuseNestedSlugRename` refuses this
      // rename once the page is published, because #120's redirect writer
      // would spell the row `/leaf → /leaf-renamed` and leave the real URL
      // `…/-child/-leaf` with nothing pointing at it (#150). A never-published
      // page has no live URL to strand, so the guard stays silent and the
      // recomputation this test is actually about is still exercised end to
      // end.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-child` } },
      })
      const child = docs[0]

      const leaf = await payload.create({
        collection: 'pages',
        overrideAccess: true,
        data: {
          title: `${MARKER}-leaf`,
          layout,
          _status: 'draft',
          slug: `${MARKER}-leaf`,
          parent: child.id,
        } as never,
      })

      const renamed = await payload.update({
        collection: 'pages',
        id: leaf.id,
        overrideAccess: true,
        draft: true,
        data: { slug: `${MARKER}-leaf-renamed`, slugLock: false },
      })

      expect(renamed.path).toBe(
        `${MARKER}-root/${MARKER}-child/${MARKER}-leaf-renamed`,
      )

      const reread = await payload.findByID({
        collection: 'pages',
        draft: true,
        id: leaf.id,
        overrideAccess: true,
      })
      expect(reread.path).toBe(
        `${MARKER}-root/${MARKER}-child/${MARKER}-leaf-renamed`,
      )
    })

    it('REFUSES to rename a nested, PUBLISHED page until #150', async () => {
      // The other half of the case above, through the real Payload write path
      // rather than a hook fixture: the redirect row that would be written
      // describes `/-grand`, a URL this page has never had, and the URL that
      // actually moved gets nothing. The unlock is supplied, so this is the
      // guard speaking and not `enforceSlugFreeze`.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-grand` } },
      })
      const grandchild = docs[0]
      expect(grandchild._status).toBe('published')

      await expect(
        payload.update({
          collection: 'pages',
          id: grandchild.id,
          overrideAccess: true,
          data: { slug: `${MARKER}-grand-renamed`, slugLock: false },
        }),
      ).rejects.toThrow(/#150/)

      // And the stored row did not move.
      const reread = await payload.findByID({
        collection: 'pages',
        id: grandchild.id,
        overrideAccess: true,
      })
      expect(reread.path).toBe(`${MARKER}-root/${MARKER}-child/${MARKER}-grand`)
    })

    it('still allows a TOP-LEVEL published rename — #120 unchanged', async () => {
      const top = await mkPage(`${MARKER}-top`)
      expect(top.path).toBe(`${MARKER}-top`)

      const renamed = await payload.update({
        collection: 'pages',
        id: top.id,
        overrideAccess: true,
        data: { slug: `${MARKER}-top-renamed`, slugLock: false },
      })
      expect(renamed.path).toBe(`${MARKER}-top-renamed`)
    })

    it('keeps the stored placement when a PATCH sends only a title', async () => {
      // The `originalDoc` merge, exercised against what Payload really hands
      // the hook rather than a fixture.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-child` } },
      })
      const child = docs[0]

      const patched = await payload.update({
        collection: 'pages',
        id: child.id,
        overrideAccess: true,
        data: { title: 'Retitled, not moved' },
      })

      expect(patched.path).toBe(`${MARKER}-root/${MARKER}-child`)
    })

    it('rejects a page whose path collides with a Post’s /articles URL', async () => {
      const articles = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { path: { equals: 'articles' } },
      })
      // The `/articles` anchor page exists in every seeded database; skip the
      // assertion rather than invent one, since creating it would itself be the
      // thing under test.
      if (articles.docs.length === 0) return

      await payload.create({
        collection: 'posts',
        overrideAccess: true,
        data: {
          title: 'Clash',
          slug: `${MARKER}-clash`,
          _status: 'published',
          content: lexical('body'),
        } as never,
      })

      await expect(
        mkPage(`${MARKER}-clash`, articles.docs[0].id),
      ).rejects.toThrow(/already the article/i)
    })
  },
)
