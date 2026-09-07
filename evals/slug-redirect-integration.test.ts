// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createFixturePage,
  createFixturePost,
} from './fixtures/payload-fixtures'

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
 * `capturePublishedSlug`, `createPathRedirect`, the `schedulePublish` job, and
 * the `redirects` collection.
 *
 * **Why `next/cache` is still stubbed after #135.** #135 asked whether this
 * stub could go once `revalidateRedirects` stopped throwing out of a Next
 * request scope. It cannot, for two reasons that have nothing to do with that
 * hook:
 *
 * 1. `revalidatePost` and `revalidatePage` call `revalidatePath` behind the
 *    `context.disableRevalidate` flag and nothing else, and they run BEFORE
 *    `createPathRedirect` in each collection's `afterChange` array. So a
 *    publish issued without that flag and without a Next scope throws in the
 *    FIRST hook and rolls back the post itself — long before any redirect hook
 *    is reached. That is a wider condition than #135 (which names only
 *    `revalidateRedirects`) and is deliberately left alone here.
 * 2. Stubbing also lets the test ASSERT the old path is purged, which is
 *    load-bearing: `revalidatePost` never purges it on a published-to-published
 *    rename (#132), `createPathRedirect` does.
 *
 * What #135 did buy is proved directly below by
 * "keeps the redirect row when the redirects revalidation throws": the stub is
 * driven to throw exactly the invariant a missing Next scope raises, and the
 * row survives Payload's real transaction instead of being rolled back with
 * it. A caller that writes a `redirects` row directly therefore needs no stub
 * at all.
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

/**
 * The one place this tier reads the redirect table through the REAL reader
 * (#178).
 *
 * @remarks `evals/vitest.config.ts` aliases `@payload-config` to
 * `src/test/payloadConfigStub.ts` — an empty object that exists only so unit
 * tests can import route handlers without dragging the CMS into jsdom. Every
 * other case in this file talks to Payload through the instance `beforeAll`
 * builds, so the stub never mattered. The #178 case is different: the defect is
 * in `getCmsRedirects`/`resolveRedirect`, which reach Payload through that
 * alias at module scope, and a stub config would give them no database at all.
 * Pointing the alias at the real config for this file is what lets the assertion
 * be about the reader the site actually runs rather than a hand-built row list —
 * which is the same reason this whole tier exists (see the docblock above).
 */
vi.mock('@payload-config', async () => ({
  default: (await import('../src/payload.config')).default,
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
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    /** Create a post already published at `slug`. */
    const createPublished = async (slug: string) => {
      const doc = await createFixturePost(payload, {
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
      const draft = await createFixturePost(payload, {
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

    it('keeps the redirect row when the redirects revalidation throws (#135)', async () => {
      // The exact failure #135 names, reproduced on the real pipeline: outside
      // a Next request scope `revalidateTag` raises this invariant. Because
      // `revalidateRedirects` is an `afterChange` INSIDE the operation's
      // transaction, an escaping throw reaches Payload's `killTransaction` and
      // the row written moments earlier disappears. The unit test pins that
      // the hook swallows it; only this tier can show that the row actually
      // survives the transaction.
      //
      // Scoped to the redirects hook alone: `revalidatePath` (the post's own
      // hooks) stays a plain spy, so the post update itself is unaffected.
      const id = await createPublished(`${MARKER}-throw-old`)
      revalidateTag.mockImplementation(() => {
        throw new Error('Invariant: static generation store missing')
      })

      try {
        await payload.update({
          collection: 'posts',
          id,
          draft: true,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: {
            slug: `${MARKER}-throw-new`,
            slugLock: false,
            _status: 'draft',
          },
        })
        await payload.update({
          collection: 'posts',
          id,
          draft: false,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: {
            slug: `${MARKER}-throw-new`,
            slugLock: false,
            _status: 'published',
          },
        })
      } finally {
        revalidateTag.mockReset()
      }

      const rows = await redirectsFor(`/articles/${MARKER}-throw-old`)
      expect(rows.totalDocs).toBe(1)
      expect(rows.docs[0].to).toMatchObject({
        type: 'reference',
        reference: { relationTo: 'posts', value: id },
      })
    }, 120_000)

    it('creates the redirect for a SCHEDULED publish of a renamed post (#135)', async () => {
      // AC 3. The scheduled path is not a variation on the admin one: the
      // `schedulePublish` task handler
      // (`payload/dist/versions/schedule/job.js`) issues
      // `payload.update({ data: { _status: 'published' }, depth: 0 })` — the
      // data payload carries NO slug, and the request carries no
      // `disableRevalidate`. So the new slug can only come from the pending
      // draft version and the old one can only come from `capturePublishedSlug`
      // reaching the main table. Anything that reads `previousDoc` instead
      // fails here.
      const id = await createPublished(`${MARKER}-sched-old`)

      await payload.update({
        collection: 'posts',
        id,
        draft: true,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          slug: `${MARKER}-sched-new`,
          slugLock: false,
          _status: 'draft',
        },
      })

      // Queue the real task, due in the past, then drain the queue — the same
      // entry point the cron endpoint uses.
      await payload.jobs.queue({
        task: 'schedulePublish',
        input: {
          type: 'publish',
          // The admin schedule UI stores this as a string and the handler
          // coerces it back (`job.js`, #10481); the queue's own input type
          // wants the real id type, so pass it as-is.
          doc: { relationTo: 'posts' as const, value: id },
        },
        waitUntil: new Date(Date.now() - 60_000),
      })
      await payload.jobs.run()

      const live = await payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
      })
      expect(live._status).toBe('published')
      expect(live.slug).toBe(`${MARKER}-sched-new`)

      const rows = await redirectsFor(`/articles/${MARKER}-sched-old`)
      expect(rows.totalDocs).toBe(1)
      expect(rows.docs[0].to).toMatchObject({
        type: 'reference',
        reference: { relationTo: 'posts', value: id },
      })
    }, 180_000)

    /**
     * #155, at the tier that can actually prove it.
     *
     * The discriminator that closes #155 is REST plumbing, not hook branching:
     * `capturePublishedSlug` decides whether a write is a draft save by
     * mirroring Payload's own `isSavingDraft` predicate
     * (`operations/utilities/update.js:29`) from `req.query` plus the incoming
     * `_status`. A unit test that mocks `payload.find` cannot see any of that —
     * it is the same class of gap that let #120 ship broken twice — so the
     * proof belongs here, driving the real update/versions/drafts pipeline.
     *
     * The Local API is a faithful stand-in for the admin's REST call because
     * `createLocalReq` does `req.query = req?.query || {}`
     * (`payload/dist/utilities/createLocalReq.js:102`): a supplied `req.query`
     * is kept verbatim, so passing the admin's own autosave query string
     * (`?draft=true&autosave=true`,
     * `@payloadcms/ui/dist/elements/Autosave/index.js:88-91`) reproduces exactly
     * what the hook reads in production.
     *
     * The sequence is the reported one: publish, autosave a RENAME into a
     * draft, then unpublish. Before #155 this purged nothing at all, because
     * `previousDoc` is the autosaved draft and already carries the new slug.
     */
    it('purges the SERVED path when an autosaved rename is unpublished (#155)', async () => {
      const served = `${MARKER}-served`
      const renamed = `${MARKER}-renamed`
      const id = await createPublished(served)

      // (1) AUTOSAVE a rename — the admin's own query string.
      revalidatePath.mockClear()
      await payload.update({
        collection: 'posts',
        id,
        draft: true,
        autosave: true,
        overrideAccess: true,
        req: { query: { autosave: 'true', draft: 'true' } } as never,
        data: { slug: renamed, slugLock: false, _status: 'draft' },
      })

      // A draft save never touches the main table (`update.js:253`), so the
      // site is still serving the ORIGINAL path at this point.
      const stillServing = await payload.db.findOne({
        collection: 'posts',
        where: { id: { equals: id } },
      } as never)
      expect((stillServing as { slug?: string } | null)?.slug).toBe(served)

      // (2) UNPUBLISH — the admin sends no `draft` param and a draft body.
      revalidatePath.mockClear()
      await payload.update({
        collection: 'posts',
        id,
        overrideAccess: true,
        req: { query: { depth: '0', 'fallback-locale': 'null' } } as never,
        data: { _status: 'draft' },
      })

      const purged = revalidatePath.mock.calls.map(([p]) => p as string)

      // THE assertion: the URL the site was actually serving is purged...
      expect(purged).toContain(`/articles/${served}`)
      // ...and the draft's slug, which nothing was ever served at, is not.
      expect(purged).not.toContain(`/articles/${renamed}`)

      // An unpublish is not a rename: no redirect row is written for either
      // path, so #155's capture cannot leak into #120's redirect behaviour.
      expect((await redirectsFor(`/articles/${served}`)).totalDocs).toBe(0)
      expect((await redirectsFor(`/articles/${renamed}`)).totalDocs).toBe(0)
    }, 180_000)

    /**
     * The other half of #155's acceptance criteria: the 100ms autosave must not
     * gain a database read. Counted against the real adapter, so it prices the
     * whole pipeline rather than one hook's own `find`.
     */
    it('adds no database read to an autosave draft save (#155)', async () => {
      const id = await createPublished(`${MARKER}-cost`)

      let reads = 0
      const wrapped: Array<[string, unknown]> = []
      for (const method of ['find', 'findOne', 'findVersions'] as const) {
        const db = payload.db as unknown as Record<
          string,
          (...a: never[]) => unknown
        >
        const original = db[method].bind(payload.db)
        wrapped.push([method, original])
        db[method] = (...args: never[]) => {
          reads += 1
          return original(...args)
        }
      }

      try {
        await payload.update({
          collection: 'posts',
          id,
          draft: true,
          autosave: true,
          overrideAccess: true,
          context: { disableRevalidate: true },
          req: { query: { autosave: 'true', draft: 'true' } } as never,
          data: { slug: `${MARKER}-cost-2`, slugLock: false, _status: 'draft' },
        })
      } finally {
        const db = payload.db as unknown as Record<string, unknown>
        for (const [method, original] of wrapped) db[method] = original
      }

      // Pinned exactly, not as an upper bound: the point is that
      // `capturePublishedSlug` returns on the `req.query` check BEFORE issuing
      // its `findPublishedRow` lookup, so this number must not move when the
      // guard changes. It was the same 5 before #155 landed.
      expect(reads).toBe(5)
    }, 180_000)

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

    /**
     * The second residue #150's comment records: un-placing a post clears its
     * `path`, the article returns to `/articles/<slug>`, and the vacated
     * section URL used to 404 — no page carries it, no post carries it, and
     * the redirect table had nothing spelled that way.
     *
     * It is not a new branch in the hook. Un-placing changes the served path
     * without changing the slug, so a slug-keyed writer computed
     * `from === to` and returned; a path-keyed one sees a genuine move. This
     * case exists because that is easy to break again by "optimising" the
     * writer back onto the slug.
     */
    it('writes a path-keyed row when a placed post is UN-PLACED', async () => {
      const section = await createFixturePage(payload, {
        context: { disableRevalidate: true },
        data: {
          title: `${MARKER}-section`,
          layout: [{ blockType: 'spacer', size: 'md' }],
          _status: 'published',
          slug: `${MARKER}-section`,
        },
      })

      const id = await createPublished(`${MARKER}-placed`)
      await payload.update({
        collection: 'posts',
        id,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: { parent: section.id } as never,
      })
      const placed = await payload.findByID({
        collection: 'posts',
        id,
        overrideAccess: true,
      })
      expect(placed.path).toBe(`${MARKER}-section/${MARKER}-placed`)

      revalidatePath.mockClear()

      // Un-place: `parent: null` is the editor clearing the field, which
      // `placementOf` distinguishes from "not sent".
      const unplaced = await payload.update({
        collection: 'posts',
        id,
        overrideAccess: true,
        data: { parent: null } as never,
      })
      expect(unplaced.path ?? null).toBeNull()

      const vacated = `/${MARKER}-section/${MARKER}-placed`
      const rows = await redirectsFor(vacated)
      expect(rows.totalDocs).toBe(1)
      expect(
        (rows.docs[0].to as { reference?: { value?: unknown } } | undefined)
          ?.reference?.value,
      ).toBe(id)
      // And the vacated URL is purged, so it falls through to the not-found
      // branch that reads the row rather than serving its prerendered shell.
      expect(revalidatePath).toHaveBeenCalledWith(vacated)

      await payload.delete({
        collection: 'pages',
        id: section.id,
        overrideAccess: true,
      })
    }, 180_000)

    /**
     * #178, the whole ticket, on the pipeline that produced it.
     *
     * A URL captured under an ancestor that has since moved AGAIN used to 404
     * although every hop of its history had a row. The rows are fine; the
     * lookup skipped one. `resolveRedirect` chose the most specific prefix row,
     * rewrote the remainder onto that row's target's CURRENT path, and produced
     * a spelling no row is keyed at — so the grandchild's own row, sitting in
     * the same list, was never consulted.
     *
     * Everything here is real: the three published pages, `cascadePagePaths`
     * recomputing the subtree on each move, `createPathRedirect` writing each
     * row (and its `toPathAtCapture` snapshot), and the site's own reader —
     * `getCmsRedirects` + `resolveRedirect` — answering the request. The rows
     * are NOT hand-built, which is the point: the unit tests can only assert
     * that the resolver handles a list shaped like this, and the defect was
     * that the list the hooks actually write is shaped like this.
     *
     * "200" at this tier means "a published document is served at the
     * destination, and none is served at the answer the pre-fix code gave" —
     * there is no HTTP server here, and the route's not-found branch does
     * nothing with the destination but hand it to `permanentRedirect`.
     */
    it('resolves a URL whose ancestor moved TWICE, and 404s at neither hop (#178)', async () => {
      const { getCmsRedirects, resolveRedirect } =
        await import('../src/lib/cms/redirectsRepo')
      const parentSlug = `${MARKER}-lab-parent`
      const baseSlug = `${MARKER}-lab-base`
      const childSlug = `${MARKER}-lab-child`
      const kidSlug = `${MARKER}-lab-kid`
      const grandchildSlug = `${MARKER}-lab-grandchild`

      const mkPage = async (slug: string, parent?: number | string) =>
        createFixturePage(payload, {
          context: { disableRevalidate: true },
          data: {
            title: slug,
            layout: [{ blockType: 'spacer', size: 'md' }],
            _status: 'published',
            slug,
            ...(parent === undefined ? {} : { parent }),
          },
        })
      const movePage = async (
        id: number | string,
        data: Record<string, unknown>,
      ) =>
        payload.update({
          collection: 'pages',
          id,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: data as never,
        })
      const pathOf = async (id: number | string) =>
        (
          await payload.findByID({
            collection: 'pages',
            id,
            overrideAccess: true,
          })
        ).path
      const servedAt = async (path: string) =>
        (
          await payload.find({
            collection: 'pages',
            depth: 0,
            overrideAccess: true,
            pagination: false,
            where: { path: { equals: path.replace(/^\//, '') } },
          })
        ).totalDocs

      // The tree, published: /parent → /parent/child → /parent/child/grandchild.
      const parent = await mkPage(parentSlug)
      const child = await mkPage(childSlug, parent.id)
      const grandchild = await mkPage(grandchildSlug, child.id)
      // The URL an inbound link captured, before any of the three moves.
      const inbound = `/${parentSlug}/${childSlug}/${grandchildSlug}`
      expect(await pathOf(grandchild.id)).toBe(
        `${parentSlug}/${childSlug}/${grandchildSlug}`,
      )

      // (1) Rename the child ⇒ row A, keyed at the child's old path.
      await movePage(child.id, { slug: kidSlug, slugLock: false })
      // (2) Move the grandchild up one level ⇒ row B, keyed at the path the
      //     grandchild had AFTER step 1 — which spells the child as `lab-kid`.
      await movePage(grandchild.id, { parent: parent.id })
      // (3) Rename the parent ⇒ row C, and the cascade moves both descendants.
      await movePage(parent.id, { slug: baseSlug, slugLock: false })

      expect(await pathOf(grandchild.id)).toBe(`${baseSlug}/${grandchildSlug}`)

      const rowFor = async (from: string) =>
        (
          await payload.find({
            collection: 'redirects',
            depth: 0,
            overrideAccess: true,
            pagination: false,
            where: { from: { equals: from } },
          })
        ).docs[0]

      // The three rows the moves wrote, each with the snapshot that names the
      // era the NEXT row is filed under.
      expect(await rowFor(`/${parentSlug}/${childSlug}`)).toMatchObject({
        matchDescendants: true,
        toPathAtCapture: `/${parentSlug}/${kidSlug}`,
      })
      expect(
        await rowFor(`/${parentSlug}/${kidSlug}/${grandchildSlug}`),
      ).toMatchObject({ toPathAtCapture: `/${parentSlug}/${grandchildSlug}` })
      expect(await rowFor(`/${parentSlug}`)).toMatchObject({
        matchDescendants: true,
        toPathAtCapture: `/${baseSlug}`,
      })

      // THE assertion, through the site's own reader.
      const resolved = resolveRedirect(await getCmsRedirects(), inbound)
      expect(resolved).toEqual({
        destination: `/${baseSlug}/${grandchildSlug}`,
        permanent: true,
      })

      // ...and the destination is a URL that actually serves, while the answer
      // the pre-#178 resolver gave is not.
      expect(await servedAt(resolved!.destination)).toBe(1)
      expect(await servedAt(`/${baseSlug}/${kidSlug}/${grandchildSlug}`)).toBe(
        0,
      )
    }, 240_000)
  },
)
