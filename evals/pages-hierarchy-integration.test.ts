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
      // Rows `createPathRedirect` wrote for the moves these cases make (#150).
      await payload.delete({
        collection: 'redirects',
        where: { from: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
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
      // A DRAFT leaf, deliberately: the case below covers the published
      // rename and the path-keyed redirect row it now writes (#150). Keeping
      // this one on a draft isolates the recomputation it is actually about
      // from the redirect machinery entirely.
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

    it('renames a nested, PUBLISHED page and keys the redirect on its real path (#150)', async () => {
      // This case used to assert a 400 from `refuseNestedSlugRename`, the
      // stop-gap that stood in for path-aware redirects. #150 deletes the
      // guard, so the same write must now SUCCEED and leave the URL that
      // actually moved — `/…-root/…-child/…-grand`, never the bare `/…-grand`
      // the slug-keyed writer described — pointing at the document.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-grand` } },
      })
      const grandchild = docs[0]
      expect(grandchild._status).toBe('published')
      const oldPath = `/${MARKER}-root/${MARKER}-child/${MARKER}-grand`

      const renamed = await payload.update({
        collection: 'pages',
        id: grandchild.id,
        overrideAccess: true,
        data: { slug: `${MARKER}-grand-renamed`, slugLock: false },
      })
      expect(renamed.path).toBe(
        `${MARKER}-root/${MARKER}-child/${MARKER}-grand-renamed`,
      )

      const rows = await payload.find({
        collection: 'redirects',
        depth: 0,
        overrideAccess: true,
        pagination: false,
        where: { from: { equals: oldPath } },
      })
      expect(rows.totalDocs).toBe(1)
      expect(rows.docs[0].to?.reference).toMatchObject({
        relationTo: 'pages',
        value: grandchild.id,
      })
      expect(rows.docs[0].type).toBe('301')

      // Rename it back so the cases after this one still find `…-grand`.
      await payload.update({
        collection: 'pages',
        id: grandchild.id,
        overrideAccess: true,
        data: { slug: `${MARKER}-grand`, slugLock: false },
      })
    })

    it('a title-only PATCH with the unlock cannot derive a new slug behind the guard', async () => {
      // The bypass a review proposed: `{ title, slugLock: false }` with NO
      // `slug` key, on the theory that a guard comparing `data.slug` to
      // `originalDoc.slug` sees nothing to refuse while `formatSlugHook`
      // derives a new slug from the title behind its back.
      //
      // It cannot happen, and only the real pipeline proves why — two facts
      // no fixture carries:
      //
      // 1. When `slug` is absent from the payload, Payload seeds the field
      //    hook's `value` from the STORED document
      //    (`fields/hooks/beforeValidate/getFallbackValue.ts`), so
      //    `formatSlugHook` takes its first branch and returns the stored slug.
      //    Its derive-from-title fallback is unreachable on an update whose
      //    stored slug is non-empty.
      // 2. Payload runs FIELD `beforeValidate` before COLLECTION
      //    `beforeValidate` (`collections/operations/utilities/update.ts`),
      //    and the field hooks write back into the same `data` object. So the
      //    guard is handed the slug the field chain already resolved — it is
      //    guarding the EFFECTIVE slug, not a raw payload key.
      //
      // Keep this case: it is the regression pin for both facts. If a Payload
      // upgrade ever reverses the order or drops the fallback, this goes red
      // here rather than silently in production.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-grand` } },
      })
      const grandchild = docs[0]
      expect(grandchild._status).toBe('published')

      const patched = await payload.update({
        collection: 'pages',
        id: grandchild.id,
        overrideAccess: true,
        data: { title: `${MARKER}-grand-bypass`, slugLock: false },
      })

      // The title moved; the URL did not.
      expect(patched.title).toBe(`${MARKER}-grand-bypass`)
      expect(patched.slug).toBe(`${MARKER}-grand`)
      expect(patched.path).toBe(
        `${MARKER}-root/${MARKER}-child/${MARKER}-grand`,
      )

      const reread = await payload.findByID({
        collection: 'pages',
        id: grandchild.id,
        overrideAccess: true,
      })
      expect(reread.slug).toBe(`${MARKER}-grand`)
      expect(reread.path).toBe(`${MARKER}-root/${MARKER}-child/${MARKER}-grand`)
    })

    it('an unlock-LESS API rename is reverted by the freeze, not refused by the guard', async () => {
      // The corrected half of the hook-order story. Because the field chain
      // runs first, `enforceSlugFreeze` has already put the slug back by the
      // time the guard looks — so `{ slug: 'new' }` without `slugLock: false`
      // is a silent no-op on the URL, NOT the 400 an earlier draft of this
      // hook's TSDoc claimed. Pinned here because the difference between
      // "loud" and "silent" is the whole subject of that paragraph.
      const { docs } = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        pagination: false,
        where: { slug: { equals: `${MARKER}-grand` } },
      })
      const grandchild = docs[0]

      const patched = await payload.update({
        collection: 'pages',
        id: grandchild.id,
        overrideAccess: true,
        // `slugLock: true` is sent explicitly because the case above left the
        // stored value at `false`, and `enforceSlugFreeze` falls back to the
        // stored lock when the payload omits it.
        data: { slug: `${MARKER}-grand-renamed-2`, slugLock: true },
      })
      expect(patched.slug).toBe(`${MARKER}-grand`)
      expect(patched.path).toBe(
        `${MARKER}-root/${MARKER}-child/${MARKER}-grand`,
      )
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

    /**
     * The subtree fan-out (#150 AC2), on the real pipeline.
     *
     * @remarks A unit test can pin the write COUNT and the flags; only this
     * tier can prove the recomposed paths actually land, because each
     * descendant write re-enters Payload's whole update operation — including
     * `computePagePath`/`computePostPath`, which recompose a child's path from
     * its PARENT's stored path and would quietly write the old prefix back if
     * the cascade wrote in the wrong order.
     *
     * Its own subtree, deliberately: the cases above assert on `…-root` and
     * would see a moved tree instead.
     */
    it('moves a whole subtree when the section page is renamed (#150)', async () => {
      const section = await mkPage(`${MARKER}-mv`)
      const child = await mkPage(`${MARKER}-mv-child`, section.id)
      expect(child.path).toBe(`${MARKER}-mv/${MARKER}-mv-child`)
      const leaf = await mkPage(`${MARKER}-mv-leaf`, child.id)
      expect(leaf.path).toBe(
        `${MARKER}-mv/${MARKER}-mv-child/${MARKER}-mv-leaf`,
      )
      const placed = await payload.create({
        collection: 'posts',
        overrideAccess: true,
        data: {
          title: `${MARKER}-mv-post`,
          slug: `${MARKER}-mv-post`,
          _status: 'published',
          content: lexical('body'),
          parent: section.id,
        } as never,
      })
      expect(placed.path).toBe(`${MARKER}-mv/${MARKER}-mv-post`)

      await payload.update({
        collection: 'pages',
        id: section.id,
        overrideAccess: true,
        data: { slug: `${MARKER}-xp`, slugLock: false },
      })

      const pathOf = async (
        collection: 'pages' | 'posts',
        id: number | string,
      ) =>
        (await payload.findByID({ collection, id, overrideAccess: true })).path

      // Every descendant moved, at every depth, in both collections. These
      // are the STORED values read back, and the cascade supplies no path at
      // all — `computePagePath`/`computePostPath` recompute each one from its
      // parent's stored path, so this is the assertion that the recomputation
      // (and the shallowest-first ordering it depends on) is what actually
      // lands.
      expect(await pathOf('pages', child.id)).toBe(
        `${MARKER}-xp/${MARKER}-mv-child`,
      )
      expect(await pathOf('pages', leaf.id)).toBe(
        `${MARKER}-xp/${MARKER}-mv-child/${MARKER}-mv-leaf`,
      )
      expect(await pathOf('posts', placed.id)).toBe(
        `${MARKER}-xp/${MARKER}-mv-post`,
      )

      // The moved page's OWN old URL gets a row (`createPathRedirect`).
      const own = await payload.find({
        collection: 'redirects',
        depth: 0,
        overrideAccess: true,
        pagination: false,
        where: { from: { equals: `/${MARKER}-mv` } },
      })
      expect(own.totalDocs).toBe(1)

      // And no per-descendant rows: D4 says one prefix row per move, so the
      // cascade passes `disableSlugRedirect` on every descendant write.
      const perDescendant = await payload.find({
        collection: 'redirects',
        depth: 0,
        overrideAccess: true,
        pagination: false,
        where: { from: { equals: `/${MARKER}-mv/${MARKER}-mv-child` } },
      })
      expect(perDescendant.totalDocs).toBe(0)
    }, 180_000)
  },
)
