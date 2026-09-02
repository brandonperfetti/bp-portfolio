import { describe, expect, it, vi } from 'vitest'

/**
 * Argument-shape pin for #118: `revalidateTag` must be called with the
 * immediate-expiration profile `{ expire: 0 }`, not `'max'`. Under
 * cacheComponents `'max'` is stale-while-revalidate with a one-year stale
 * window, so a regression back to `'max'` (or to no second arg) silently
 * reintroduces the ~10-20 minute stale-admin-edit bug — this test fails
 * loudly instead.
 *
 * The tag itself is expressed as `CMS_TAGS.redirects` (#133) so a rename of
 * the vocabulary moves this expectation with the hook instead of freezing
 * yesterday's literal. WHICH tag is the right one to purge — that it is the
 * same one `getCmsRedirects` subscribes to — is pinned in
 * `src/lib/cms/cacheTags.test.ts`, which can see both sides.
 */
const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}))

import { CMS_TAGS } from '@/lib/cms/cache'

import { revalidateRedirects } from './revalidateRedirects'

describe('revalidateRedirects', () => {
  it('purges the redirects tag with the immediate-expiration expire:0 profile', () => {
    revalidateRedirects({
      doc: { id: '1' },
      req: { payload: { logger: { info: vi.fn() } } },
    } as never)

    expect(mocks.revalidateTag).toHaveBeenCalledWith(CMS_TAGS.redirects, {
      expire: 0,
    })
  })
})
