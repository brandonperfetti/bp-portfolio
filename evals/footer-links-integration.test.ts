// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * #363: the footer's CMS links, through a real Payload on a real Postgres.
 *
 * @remarks **What this proves that the unit tier cannot.** The unit pins hand
 * `getCmsFooterLinks` a FAKE `findGlobal` and run the `afterChange` hook by
 * hand. Here the global is saved through Payload's own update pipeline and
 * read back through the real reader, so three things are asked of the system
 * and not of a mock: a save reaches the `links` rows, an anonymous read with
 * access control enforced (`overrideAccess: false`, no user) returns them, and
 * the save itself fires the purge of the tag the reader caches under.
 *
 * `next/cache` is stubbed, so `'use cache: remote'` is an inert directive here
 * and `cacheTag`/`cacheLife` are no-ops: what runs is the reader's body, and
 * `revalidateTag` is recorded, not executed.
 *
 * **Shared state.** The `footer` global is one document every worker shares.
 * No other file in this tier reads or writes it (measured 2026-11-18 by a
 * grep of `evals/`). Its `links` rows are snapshotted, ids included, in `beforeAll` and
 * written back in `afterAll`, and the test restores them in its own
 * `try/finally`.
 * Every link this file writes carries the `zz-` marker in its `href`.
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

/** Marks every link this file writes. */
const MARKER = 'zz-footer-links'

describe('footer links integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'getCmsFooterLinks (real Payload, real Postgres)',
  () => {
    type Payload = Awaited<ReturnType<typeof import('payload').getPayload>>
    type Link = { label: string; href: string }
    /** A stored row as Payload returns it: the link plus its row id. */
    type StoredLink = Link & { id?: string | null }
    let payload: Payload
    let getCmsFooterLinks: () => Promise<Link[]>
    /**
     * The rows as stored before this file ran, ids included, so the restore
     * writes back the same rows and not new ones with the same text.
     * `undefined` until read.
     */
    let rowsBefore: StoredLink[] | undefined
    /**
     * What the reader returned before this file wrote anything. The baseline
     * for every assertion: the reader trims and filters, so its output need
     * not equal the stored rows.
     */
    let readBefore: Link[] | undefined

    const saveLinks = async (links: StoredLink[]) => {
      await payload.updateGlobal({
        slug: 'footer',
        overrideAccess: true,
        data: { links },
      })
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      ;({ getCmsFooterLinks } = await import('../src/lib/cms/footerRepo'))

      const stored = await payload.findGlobal({
        slug: 'footer',
        depth: 0,
        overrideAccess: true,
      })
      rowsBefore = (stored.links ?? []).map((row) => ({ ...row }))
      readBefore = await getCmsFooterLinks()
    }, 180_000)

    afterAll(async () => {
      if (!payload || !rowsBefore) return
      await saveLinks(rowsBefore)
    }, 60_000)

    it('a saved link reaches an anonymous, access-enforced read; the save purges the reader’s tag; a removed link is gone', async () => {
      const added = { label: 'Privacy', href: `/${MARKER}-privacy` }
      try {
        mocks.revalidateTag.mockClear()

        await saveLinks([...rowsBefore!, added])

        // The save purged the tag the reader caches under, with expire: 0.
        const { CMS_TAGS } = await import('../src/lib/cms/cache')
        expect(mocks.revalidateTag).toHaveBeenCalledWith(CMS_TAGS.footer, {
          expire: 0,
        })

        // The control: the row is really stored.
        const stored = await payload.findGlobal({
          slug: 'footer',
          depth: 0,
          overrideAccess: true,
        })
        expect(stored.links?.map((link) => link.href)).toContain(added.href)

        // And the reader, which runs with no user and access enforced, sees
        // it, after whatever it returned before, in order.
        expect(await getCmsFooterLinks()).toEqual([...readBefore!, added])

        // Remove it through Payload again and read once more: the reader
        // returns what it did at the start. (`next/cache` is stubbed, so this
        // is the stored state, not a cache eviction.)
        await saveLinks(rowsBefore!)
        const after = await getCmsFooterLinks()
        expect(after.some((link) => link.href.includes(MARKER))).toBe(false)
        expect(after).toEqual(readBefore)
      } finally {
        await saveLinks(rowsBefore!)
      }
    }, 60_000)
  },
)
