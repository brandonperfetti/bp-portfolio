// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { Pages } from '@/collections/Pages'
import { publicPathFor } from '@/fields/slug/slugPaths'

/**
 * The Pages read projection, tested through the real collection config.
 *
 * `publicPathFor` has always been able to name a placed page — `slugPaths.test`
 * proves that — but it can only answer with the fields it is handed, and for a
 * *populated relationship* Payload decides that set, not the caller.
 * `defaultPopulate` is that decision. What this file pins is the half a helper
 * test cannot see: whether the projection Payload actually applies still
 * carries `path` by the time `CMSLink` asks. Drop `path` and the helper stays
 * correct while every CMS-authored link to a placed page is still wrong (#189).
 *
 * The sibling for Posts is `src/collections/Posts/index.test.ts`.
 */

const defaultPopulate = Pages.defaultPopulate as
  Record<string, unknown> | undefined

/**
 * A stored page reduced to the fields `defaultPopulate` admits — the shape a
 * populated `reference.value` actually arrives in. Reading the projection off
 * the config rather than restating it is the point: a field removed from
 * `defaultPopulate` disappears from these fixtures too, and the path
 * assertions below go red.
 */
const asPopulated = (doc: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(doc).filter(([field]) => defaultPopulate?.[field] === true),
  )

describe('Pages defaultPopulate', () => {
  it('carries `path` alongside title and slug (#189, #148)', () => {
    expect(defaultPopulate).toMatchObject({
      title: true,
      slug: true,
      path: true,
    })
  })

  it('lets a populated reference to a PLACED page resolve at its nested URL', () => {
    const placed = {
      id: 7,
      title: 'Brytecore',
      slug: 'brytecore',
      path: 'work/brytecore',
      layout: [],
    }
    expect(publicPathFor('pages', asPopulated(placed))).toBe('/work/brytecore')
  })

  it('still resolves the ROOT page at / once `path` travels with it (#189 AC 4)', () => {
    // The root's stored path IS its slug — `computePagePath` gives a top-level
    // page `path = slug` — so the `ROOT_PAGE_SLUG` branch reads `home` off
    // either field and the answer does not move when `path` joins the
    // projection. Confirmed here rather than assumed.
    const root = { id: 1, title: 'Home', slug: 'home', path: 'home' }
    expect(publicPathFor('pages', asPopulated(root))).toBe('/')
  })
})
