// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createFixturePage } from './fixtures/payload-fixtures'

/**
 * #201 — a re-used path, against a REAL Payload instance on REAL Postgres.
 *
 * @remarks **Why this tier and not only a unit test.** The unit tests in
 * `src/lib/cms/redirectsRepo.test.ts` hand-build the row list, and that is
 * exactly the gap #178 was caught in: they can prove the resolver handles a
 * list shaped like this, and the defect is that the list THE HOOKS ACTUALLY
 * WRITE is shaped like this. The claim here has two halves and only this tier
 * can join them — that `createPathRedirect` repoints an existing row at a new
 * document while preserving the previous document's capture (the snapshot and
 * now its identity), and that the site's own reader answers the old subtree
 * with the captured document rather than the new occupant.
 *
 * The sequence is the ticket's, run through the admin editorial path:
 *
 * ```text
 * A published at /acme, with a child at /acme/leaf
 * A renamed  /acme → /acme-corp   ⇒ row keyed /acme, captured for A
 * B created  at the vacated /acme
 * B renamed  /acme → /beta        ⇒ `from` is unique, so that SAME row is
 *                                   repointed at B — snapshot and identity
 *                                   still A's
 * ```
 *
 * `GET /acme/leaf` is a link from A's tenure. Before this change it answered
 * `/beta/leaf`: a live page, a 301, and a different document's subtree.
 *
 * `next/cache` is stubbed for the reasons `slug-redirect-integration.test.ts`
 * sets out at length: `revalidatePost`/`revalidatePage` run before
 * `createPathRedirect` and would throw out of a Next request scope, rolling the
 * document back before any redirect hook is reached.
 *
 * `@payload-config` is pointed at the real config for the same reason that file
 * does it: `getCmsRedirects` reaches Payload through that alias at module
 * scope, and the eval tier aliases it to a stub with no database.
 *
 * Runs in the `e2e` job, the only one with Postgres and a real `pnpm migrate`.
 * Rows are cleaned up in `afterAll`.
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

vi.mock('@payload-config', async () => ({
  default: (await import('../src/payload.config')).default,
}))

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-redirect-identity'

describe('redirect capture identity integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'a path vacated by one page and taken by another (#201, real Payload)',
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
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

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

    it('answers the CAPTURED page’s subtree after its path is re-used', async () => {
      const { getCmsRedirects, resolveRedirect } =
        await import('../src/lib/cms/redirectsRepo')
      const acmeSlug = `${MARKER}-acme`
      const corpSlug = `${MARKER}-acme-corp`
      const betaSlug = `${MARKER}-beta`
      const leafSlug = `${MARKER}-leaf`

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
      const rename = async (id: number | string, slug: string) =>
        payload.update({
          collection: 'pages',
          id,
          overrideAccess: true,
          context: { disableRevalidate: true },
          data: { slug, slugLock: false } as never,
        })
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

      // A, published at /acme with a child beneath it. `/acme/leaf` is the URL
      // an inbound link captured, and no row is ever keyed at it — the child
      // travels with its parent (D4), so the parent's snapshot is its only key.
      const pageA = await mkPage(acmeSlug)
      const leaf = await mkPage(leafSlug, pageA.id)
      const inbound = `/${acmeSlug}/${leafSlug}`

      // A moves off /acme, and the cascade takes the child with it.
      await rename(pageA.id, corpSlug)
      expect(
        (
          await payload.findByID({
            collection: 'pages',
            id: leaf.id,
            overrideAccess: true,
          })
        ).path,
      ).toBe(`${corpSlug}/${leafSlug}`)

      // B takes the vacated path, then vacates it in turn. `from` is unique, so
      // this second move REPOINTS A's row rather than writing its own.
      const pageB = await mkPage(acmeSlug)
      await rename(pageB.id, betaSlug)

      const { docs } = await payload.find({
        collection: 'redirects',
        depth: 0,
        overrideAccess: true,
        pagination: false,
        where: { from: { equals: `/${acmeSlug}` } },
      })
      expect(docs).toHaveLength(1)
      // The row the hooks wrote: pointing at B, captured for A. This shape is
      // the whole premise of the ticket, and it is asserted rather than assumed.
      expect(docs[0]).toMatchObject({
        matchDescendants: true,
        to: { type: 'reference', reference: { value: pageB.id } },
        toCollectionAtCapture: 'pages',
        toIdAtCapture: String(pageA.id),
        toPathAtCapture: `/${corpSlug}`,
      })

      // THE assertion, through the site's own reader.
      const resolved = resolveRedirect(await getCmsRedirects(), inbound)
      expect(resolved).toEqual({
        destination: `/${corpSlug}/${leafSlug}`,
        permanent: true,
      })

      // ...and the destination serves, while the answer the pre-#201 resolver
      // gave — B's subtree — does not exist at all. That is the failure this
      // ticket is about being cheaper than it looks: had B owned a page there,
      // the visitor would have been sent to a real page in the wrong subtree
      // with nothing anywhere reporting it.
      expect(await servedAt(resolved!.destination)).toBe(1)
      expect(await servedAt(`/${betaSlug}/${leafSlug}`)).toBe(0)
    }, 240_000)
  },
)
