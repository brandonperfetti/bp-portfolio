import type { Payload } from 'payload'

import { createReservedFixturePage } from './payload-fixtures'

/**
 * The `/articles` archive anchor page, owned by the tier rather than a file (#191).
 *
 * @remarks **Why this cannot be "each file owns its own anchor".** The two
 * integration files that need it —
 * `post-placement-integration.test.ts`'s "rejects a placement inside the
 * /articles archive" and `pages-hierarchy-integration.test.ts`'s "rejects a
 * page whose path collides with a Post's /articles URL" — both depend on a
 * page whose stored `path` is the literal string `articles`. Both guards key
 * off `postSlugCollidingWith` (`src/fields/slug/documentPath.ts`), which
 * matches on the FIRST SEGMENT being the slug-routed prefix, so no other slug
 * will do. And `pages.path` carries a unique index (M1), so at most one such
 * row can exist in the whole database. A per-file anchor is not merely
 * awkward here; the schema forbids it.
 *
 * **What the shared state actually was, and what it did.** Before this module,
 * `post-placement` created the anchor inside one test and deleted it in
 * `afterAll` (only when it had created it), while `pages-hierarchy` READ it and
 * silently `return`ed when it found nothing. So whether that second file
 * asserted anything at all was decided by a sibling file's in-flight fixture,
 * in a parallel worker. Measured on a freshly migrated database at
 * `76d7115`: run the two files together and the anchor was present on 5/5
 * runs; run `pages-hierarchy-integration.test.ts` alone and it was absent on
 * 3/3, i.e. its `/articles` collision case asserted NOTHING and still reported
 * green. The narrower hazard is worse: `post-placement`'s `afterAll` can delete
 * the anchor while `pages-hierarchy` is mid-case holding its id, which turns a
 * collision assertion into a dangling-parent error. Neither showed up as a red
 * run in 12 scheduled orders, which is exactly why it needed removing
 * structurally rather than waiting for a flake.
 *
 * **The fix: create at most once, mutate never, delete never.** The anchor is
 * an immutable singleton for the life of the database, so no file can pull it
 * out from under another and the read is order-independent. Not deleting it is
 * strictly safer than what it replaces — the old code could destroy a REAL
 * `/articles` page on a seeded database if its ownership bookkeeping ever
 * slipped, and it demonstrably leaked the row anyway whenever a run was
 * interrupted before `afterAll`. What is left behind is one row that
 * {@link ensureArticlesAnchor} then adopts on the next run: `/articles` is a
 * page every seeded database already has, `RESERVED_PAGE_SLUGS`
 * (`src/lib/cms/pagesRepo.ts`) excludes it from serve and emit, and on CI the
 * database dies with the job.
 */

/** A minimal valid `layout` — the Pages field is `required`, so `[]` is rejected. */
const ANCHOR_LAYOUT = [{ blockType: 'spacer', size: 'md' }]

/** The stored path the two guards match on. */
const ANCHOR_PATH = 'articles'

/**
 * Find the `/articles` anchor page, creating it if this database has none.
 *
 * @param payload - An initialised Payload instance.
 * @returns The anchor page's id — never null, so a caller has no reason to
 *   branch and no way to assert vacuously.
 *
 * @throws Error when the page can neither be found nor created, which is a
 *   real failure rather than a reason to skip.
 *
 * @remarks Idempotent and safe to call from several workers at once. The
 * create is guarded by `pages.path`'s unique index, so a worker that loses the
 * race gets a rejected promise and re-reads — the winner's row is the one both
 * end up with. It never deletes; see this module's header for why the anchor's
 * immortality is the property that removes the cross-file race.
 */
export const ensureArticlesAnchor = async (
  payload: Payload,
): Promise<number | string> => {
  const find = async () => {
    const { docs } = await payload.find({
      collection: 'pages',
      overrideAccess: true,
      pagination: false,
      limit: 1,
      where: { path: { equals: ANCHOR_PATH } },
    })
    return docs[0]?.id ?? null
  }

  const existing = await find()
  if (existing !== null) return existing

  try {
    const page = await createReservedFixturePage(payload, {
      data: {
        title: ANCHOR_PATH,
        layout: ANCHOR_LAYOUT,
        _status: 'published',
        slug: ANCHOR_PATH,
      },
    })
    return page.id
  } catch (error) {
    // Lost the create race against a parallel worker, or the row appeared
    // between the read and the write. Either way the unique index on
    // `pages.path` serialised us and the winner's row is now readable.
    const raced = await find()
    if (raced !== null) return raced
    throw new Error(
      `eval fixture: could not find or create the /articles anchor page: ${String(error)}`,
    )
  }
}
