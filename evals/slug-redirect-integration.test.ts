// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Slug freeze + auto-redirect against a REAL Payload instance on REAL Postgres
 * (#120, addendum 2).
 *
 * @remarks **Why this tier and not a unit test.** The unit tests for these
 * hooks mock `payload.find`, and that is precisely what let a broken
 * implementation go green twice. The defect was never in the hooks' branching
 * — it was in Payload's own plumbing: `createLocalReq` reassigns
 * `req.context = getRequestContext(req, context)`
 * (`payload/dist/utilities/createLocalReq.js:86`) and `getRequestContext`
 * returns a NEW shallow-spread object, so any nested Local API call made from
 * inside a hook (`payload.find({ req })`) swaps `req.context` and detaches the
 * `context` argument that hook is holding. A mocked `find` never performs that
 * swap, so the mocked test could not see it. Only the real pipeline can.
 *
 * The sequence below is the exact admin editorial path — publish, unlock and
 * rename into an autosaved DRAFT, then publish that draft — which is the one
 * that shipped broken to preview. It is red against the pre-fix hook for the
 * right reason (zero redirect rows) and green after.
 *
 * What is real here: Postgres, the migrated schema, the whole Payload update
 * operation, the versions/drafts machinery, `enforceSlugFreeze`,
 * `capturePublishedSlug`, `createSlugRedirect`, and the `redirects` collection.
 * What is stubbed: `next/cache` only. `revalidatePath`/`revalidateTag` throw
 * `Invariant: static generation store missing` outside a Next request scope,
 * which is a harness fact, not a product one — in production these hooks run
 * inside a route handler. Stubbing them also lets the test ASSERT the old
 * path is purged, which is load-bearing (`revalidatePost` never purges it on a
 * published-to-published rename).
 *
 * Runs in the `e2e` job, the only one with `pgvector/pgvector:pg16` and a real
 * `pnpm migrate`. Rows are cleaned up in `afterAll` so the job's later
 * Playwright steps see the database they would have seen anyway.
 */

const { revalidatePath, revalidateTag } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
  revalidateTag,
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-slug-redirect-integration'
const OLD_SLUG = `${MARKER}-old`
const NEW_SLUG = `${MARKER}-new`
const FROZEN_SLUG = `${MARKER}-frozen`

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

describe('slug redirect integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'published slug freeze + auto-redirect (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'redirects',
        where: { from: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'posts',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    /** Create a post already published at `slug`. */
    const createPublished = async (slug: string) => {
      const doc = await payload.create({
        collection: 'posts',
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          title: `Integration ${slug}`,
          content: lexical('Body.'),
          access: { visibility: 'public' as const },
          slug,
          slugLock: true,
          _status: 'published',
        },
      })
      return doc.id as number
    }

    const redirectsFor = async (from: string) =>
      payload.find({
        collection: 'redirects',
        depth: 0,
        overrideAccess: true,
        pagination: false,
        where: { from: { equals: from } },
      })

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      await cleanup()
    }, 120_000)

    afterAll(async () => {
      await cleanup()
      await payload?.db?.destroy?.()
    }, 60_000)

    it('creates exactly one redirect for a rename made through an autosaved draft', async () => {
      // THE regression. Publish, then unlock + rename into a draft (what
      // autosave writes), then publish that draft.
      const id = await createPublished(OLD_SLUG)
      revalidatePath.mockClear()

      await payload.update({
        collection: 'posts',
        id,
        draft: true,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: { slug: NEW_SLUG, slugLock: false, _status: 'draft' },
      })

      await payload.update({
        collection: 'posts',
        id,
        draft: false,
        overrideAccess: true,
        data: { slug: NEW_SLUG, slugLock: false, _status: 'published' },
      })

      const live = await payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
      })
      expect(live.slug).toBe(NEW_SLUG)

      const rows = await redirectsFor(`/articles/${OLD_SLUG}`)
      expect(rows.totalDocs).toBe(1)
      expect(rows.docs[0].to).toMatchObject({
        type: 'reference',
        reference: { relationTo: 'posts', value: id },
      })

      // revalidatePost only purges the old path on UNPUBLISH, so without this
      // the old URL would keep serving its shell and never reach the redirect.
      expect(revalidatePath).toHaveBeenCalledWith(`/articles/${OLD_SLUG}`)
    }, 120_000)

    it('freezes a locked published slug against a title edit', async () => {
      const id = await createPublished(FROZEN_SLUG)

      await payload.update({
        collection: 'posts',
        id,
        draft: false,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          title: 'A completely different title',
          // MARKER-prefixed like every other slug this file writes: the
          // attempt is supposed to be REFUSED, but a freeze regression is
          // exactly what this test exists to catch, and on that day the row
          // lands. Cleanup deletes by `slug like %MARKER%`, so an unprefixed
          // attempt slug would leak the post into the shared e2e database and
          // outlive the run.
          slug: `${MARKER}-a-completely-different-title`,
          slugLock: true,
          _status: 'published',
        },
      })

      const live = await payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
      })
      expect(live.slug).toBe(FROZEN_SLUG)

      const rows = await redirectsFor(`/articles/${FROZEN_SLUG}`)
      expect(rows.totalDocs).toBe(0)
    }, 120_000)

    it('freezes through a draft, exercising the DB-read branch of the freeze', async () => {
      // The other freeze test only reaches `enforceSlugFreeze`'s fast path
      // (`originalDoc` IS the published row). Two draft saves in a row make
      // `originalDoc` a draft version, which is the branch that has to ask the
      // database — the one addendum 2 asked to be verified on real infra.
      const id = await createPublished(`${MARKER}-dfreeze`)

      // MARKER-prefixed for the same reason as the freeze test above: these
      // slugs only survive the run if the freeze has regressed, and that is
      // the day cleanup has to be able to find them.
      for (const attempt of [`${MARKER}-hijack-one`, `${MARKER}-hijack-two`]) {
        await payload.update({
          collection: 'posts',
          id,
          draft: true,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: { slug: attempt, slugLock: true, _status: 'draft' },
        })
      }

      await payload.update({
        collection: 'posts',
        id,
        draft: false,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          slug: `${MARKER}-hijack-two`,
          slugLock: true,
          _status: 'published',
        },
      })

      const live = await payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
      })
      expect(live.slug).toBe(`${MARKER}-dfreeze`)
      expect(
        (await redirectsFor(`/articles/${MARKER}-dfreeze`)).totalDocs,
      ).toBe(0)
    }, 180_000)

    it('writes no redirect for a first publish', async () => {
      const draft = await payload.create({
        collection: 'posts',
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          title: 'First publish',
          content: lexical('Body.'),
          access: { visibility: 'public' as const },
          slug: `${MARKER}-first`,
          slugLock: true,
          _status: 'draft',
        },
      })

      await payload.update({
        collection: 'posts',
        id: draft.id,
        draft: false,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: { _status: 'published' },
      })

      const rows = await payload.find({
        collection: 'redirects',
        depth: 0,
        overrideAccess: true,
        pagination: false,
        where: { from: { like: `%${MARKER}-first%` } },
      })
      expect(rows.totalDocs).toBe(0)
    }, 120_000)

    it('does not stack a second row when the same path is renamed again', async () => {
      const id = await createPublished(`${MARKER}-a`)

      for (const [from, to] of [
        [`${MARKER}-a`, `${MARKER}-b`],
        [`${MARKER}-b`, `${MARKER}-c`],
      ]) {
        await payload.update({
          collection: 'posts',
          id,
          draft: true,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: { slug: to, slugLock: false, _status: 'draft' },
        })
        await payload.update({
          collection: 'posts',
          id,
          draft: false,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: { slug: to, slugLock: false, _status: 'published' },
        })
        expect((await redirectsFor(`/articles/${from}`)).totalDocs).toBe(1)
      }

      // Both old paths exist, and each targets the document — so both resolve
      // to the newest slug in one hop. No chains.
      const referenceValue = (row: { to?: unknown } | undefined) =>
        (row?.to as { reference?: { value?: unknown } } | undefined)?.reference
          ?.value

      const first = await redirectsFor(`/articles/${MARKER}-a`)
      const second = await redirectsFor(`/articles/${MARKER}-b`)
      expect(referenceValue(first.docs[0])).toBe(id)
      expect(referenceValue(second.docs[0])).toBe(id)
    }, 180_000)
  },
)
