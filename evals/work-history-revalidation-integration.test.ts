// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createFixturePage } from './fixtures/payload-fixtures'

/**
 * The #207 purge list, against a REAL Payload on REAL Postgres.
 *
 * @remarks **Why this tier.** Everything #207 turns on is Payload plumbing that
 * a mocked `payload.find` cannot answer (`docs/TESTING.md`, "Mock
 * `payload.find` at your peril"):
 *
 * 1. **`layout.entry` has to resolve through the block table at all.** The
 *    block-scoped spelling `layout.workHistoryCard.entry` is rejected by
 *    Payload with `The following path cannot be queried`; only a real query
 *    says which spelling works, and the unit tier would happily assert the
 *    broken one.
 * 2. **`ON DELETE SET NULL` timing.** `pages_blocks_work_history_card.entry_id`
 *    is nulled by the constraint *inside* the deleting transaction, so a
 *    derivation in `afterDelete` finds nothing. That is why the delete path
 *    captures in `beforeDelete`, and only the real delete operation running
 *    both hooks in order can prove the capture survives to the purge.
 * 3. **Draft rows are in the main table.** A drafted page carrying the block
 *    matches `layout.entry` unless `_status` filters it, which no fixture
 *    reproduces.
 *
 * **What is asserted, and where.** The observable is the PURGE CALL LIST at the
 * hook boundary — `revalidatePath`, stubbed here as it is in every file of this
 * tier, because the real one throws outside a Next request scope and (#156)
 * would roll the write back before anything could be observed. Proving that the
 * purge reaches the CDN is not something any test in this repo can do; the live
 * re-run of #207's own reproduction is Brandon's, on staging after apply.
 */

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-work-history-revalidation'

/** A minimal valid `layout` — the field is `required`, so `[]` is rejected. */
const spacer = [{ blockType: 'spacer', size: 'md' }]

describe('work-history revalidation integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'work-history purge surfaces (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let entryId: number | string

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'work-history',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    /** Paths handed to `revalidatePath` since the last reset. */
    const purged = () => mocks.revalidatePath.mock.calls.flat()

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      await cleanup()

      const row = await payload.create({
        collection: 'work-history',
        overrideAccess: true,
        data: {
          company: `${MARKER}-co`,
          title: 'Engineer',
          startDate: new Date('2020-01-01').toISOString(),
          slug: `${MARKER}-co`,
        } as never,
      })
      entryId = row.id

      // The #137 shape: a `/work`-style section page, and a role page under it
      // whose layout renders exactly this row.
      const section = await createFixturePage(payload, {
        data: {
          title: `${MARKER}-section`,
          slug: `${MARKER}-section`,
          _status: 'published',
          layout: spacer,
        },
      })
      await createFixturePage(payload, {
        data: {
          title: `${MARKER}-role`,
          slug: `${MARKER}-role`,
          parent: section.id,
          _status: 'published',
          layout: [{ blockType: 'workHistoryCard', entry: row.id }],
        },
      })
      // A drafted page carrying the same block. Its row is in the main `pages`
      // table, so it matches `layout.entry`; nothing serves its path.
      await createFixturePage(payload, {
        data: {
          title: `${MARKER}-draft`,
          slug: `${MARKER}-draft`,
          _status: 'draft',
          layout: [{ blockType: 'workHistoryCard', entry: row.id }],
        },
      })
    }, 120_000)

    afterAll(cleanup)

    beforeEach(() => {
      mocks.revalidatePath.mockReset()
      mocks.revalidateTag.mockReset()
    })

    it('purges the /work page that renders the row, not only / (#207)', async () => {
      await payload.update({
        collection: 'work-history',
        id: entryId,
        overrideAccess: true,
        data: { description: 'a new paragraph' } as never,
      })

      // The ticket's reproduction, at the boundary this tier can observe: the
      // save purged the role page's own path. Before #207 this list was `['/']`.
      expect(purged()).toContain(`/${MARKER}-section/${MARKER}-role`)
      // The homepage keeps revalidating — the Resume card reads the collection
      // directly and no derivation can find it.
      expect(purged()).toContain('/')
      // And the drafted page is not in the list: `_status` filters it.
      expect(purged()).not.toContain(`/${MARKER}-draft`)
      expect(mocks.revalidateTag).toHaveBeenCalledWith('work-history', {
        expire: 0,
      })
    }, 60_000)

    it('purges the same page on the DELETE path, where the relationship is already gone', async () => {
      // `entry_id` is `ON DELETE SET NULL` and the constraint fires inside the
      // deleting transaction. If the derivation lived in `afterDelete` this
      // assertion would fail with a list of exactly `['/']` — which is the
      // whole reason the capture is a `beforeDelete` hook.
      await payload.delete({
        collection: 'work-history',
        id: entryId,
        overrideAccess: true,
      })

      expect(purged()).toContain(`/${MARKER}-section/${MARKER}-role`)
      expect(purged()).toContain('/')
    }, 60_000)
  },
)
