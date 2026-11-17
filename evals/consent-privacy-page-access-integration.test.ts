// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createFixturePage } from './fixtures/payload-fixtures'

/**
 * #262: the consent reader runs with access control enforced, so the
 * privacy-policy link never points at a page that was never published.
 *
 * @remarks **What this proves that the unit tier cannot.** The unit pin
 * (`src/lib/cms/globalReaders.access.test.ts`) asserts the reader passes
 * `overrideAccess: false` to a FAKE `findGlobal`. What that option then does
 * is Payload's: whether the flag travels into relationship population, and
 * whether an anonymous read of a draft `pages` row under
 * `authenticatedOrPublished` leaves the relation an id. This file asks a real
 * Payload on a real Postgres, through the real {@link getCmsConsentConfig}.
 *
 * `next/cache` is stubbed, so `'use cache: remote'` is an inert directive here
 * and `cacheTag`/`cacheLife` are no-ops: what runs is the reader's body.
 *
 * **Shared state.** Unlike a fixture row, the `cookie-consent` global is one
 * document every worker shares. No other file in this tier reads or writes it
 * `[measured 2026-11-17: grep of evals/]`. The banner group is snapshotted by
 * value in `beforeAll` and written back in `afterAll`, and each test unwinds
 * its own pages in `try/finally`.
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

/** Marks every page this file writes, for exact cleanup. */
const MARKER = 'zz-consent-privacy-access'

/** A minimal valid `layout` — the field is `required`, so `[]` is rejected. */
const layout = [{ blockType: 'spacer', size: 'md' }]

describe('consent privacy-page access integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'getCmsConsentConfig privacy link under access control (real Payload, real Postgres)',
  () => {
    type Payload = Awaited<ReturnType<typeof import('payload').getPayload>>
    let payload: Payload
    let getCmsConsentConfig: () => Promise<{
      dialog: { privacyPolicyHref?: string }
    }>
    /** The banner group as stored before this file ran; `undefined` until read. */
    let bannerBefore: Record<string, unknown> | undefined

    const deletePages = async () => {
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    /** Points the consent banner's privacy-policy relation at `pageId`. */
    const pointPrivacyPolicyAt = async (pageId: number | string | null) => {
      await payload.updateGlobal({
        slug: 'cookie-consent',
        overrideAccess: true,
        data: {
          banner: { ...bannerBefore, privacyPolicyPage: pageId },
        } as never,
      })
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      ;({ getCmsConsentConfig } = await import('../src/lib/cms/consentRepo'))

      const stored = await payload.findGlobal({
        slug: 'cookie-consent',
        depth: 0,
        overrideAccess: true,
      })
      bannerBefore = { ...(stored.banner ?? {}) }
      await deletePages()
    }, 180_000)

    afterAll(async () => {
      if (!payload) return
      try {
        if (bannerBefore) {
          await payload.updateGlobal({
            slug: 'cookie-consent',
            overrideAccess: true,
            data: { banner: bannerBefore } as never,
          })
        }
      } finally {
        await deletePages()
      }
    }, 60_000)

    it('offers no link when the relation points at a never-published page', async () => {
      const draft = await createFixturePage(payload, {
        data: {
          title: `${MARKER}-draft`,
          slug: `${MARKER}-draft`,
          _status: 'draft',
          layout,
        },
      })
      try {
        await pointPrivacyPolicyAt(draft.id)

        // The control: with access skipped (the Local API default the reader
        // used to inherit) Payload populates the draft page. If this did not
        // hold, the assertion below would pass for the wrong reason.
        const skipped = await payload.findGlobal({
          slug: 'cookie-consent',
          depth: 1,
          overrideAccess: true,
        })
        expect(skipped.banner?.privacyPolicyPage).toMatchObject({
          id: draft.id,
          slug: `${MARKER}-draft`,
        })

        const config = await getCmsConsentConfig()

        expect(config.dialog.privacyPolicyHref).toBeUndefined()
      } finally {
        await pointPrivacyPolicyAt(null)
      }
    }, 60_000)

    it('still links a published privacy-policy page', async () => {
      const published = await createFixturePage(payload, {
        data: {
          title: `${MARKER}-published`,
          slug: `${MARKER}-published`,
          _status: 'published',
          layout,
        },
      })
      try {
        await pointPrivacyPolicyAt(published.id)

        const config = await getCmsConsentConfig()

        expect(config.dialog.privacyPolicyHref).toBe(`/${MARKER}-published`)
      } finally {
        await pointPrivacyPolicyAt(null)
      }
    }, 60_000)
  },
)
