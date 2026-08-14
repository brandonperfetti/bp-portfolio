import { beforeEach, describe, expect, it, vi } from 'vitest'

// The repo reads the `site-settings` global through the Payload Local API
// wrapped in unstable_cache. Both are stubbed so the mapping (and its
// defaults) run against fixtures: getPayload returns a fake `findGlobal`, and
// unstable_cache passes the loader through unchanged.
const findGlobal = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ findGlobal })),
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { SHARE_TARGET_IDS } from '@/lib/share/vocabulary'

beforeEach(() => {
  findGlobal.mockReset()
})

describe('getCmsSiteSettings share targets', () => {
  it('defaults to the full pinned vocabulary when the global omits shareTargets', async () => {
    findGlobal.mockResolvedValue({ siteName: 'Brandon Perfetti' })

    const settings = await getCmsSiteSettings()
    expect(settings.shareTargets).toEqual([...SHARE_TARGET_IDS])
  })

  it('falls back to the full set even when the global is entirely empty', async () => {
    findGlobal.mockResolvedValue(null)

    const settings = await getCmsSiteSettings()
    expect(settings.shareTargets).toEqual([...SHARE_TARGET_IDS])
  })

  it('exposes the editor-chosen share set verbatim', async () => {
    findGlobal.mockResolvedValue({
      siteName: 'Brandon Perfetti',
      shareTargets: ['x', 'linkedin', 'copylink'],
    })

    const settings = await getCmsSiteSettings()
    expect(settings.shareTargets).toEqual(['x', 'linkedin', 'copylink'])
  })

  it('honors an explicitly emptied share set (all destinations off)', async () => {
    findGlobal.mockResolvedValue({
      siteName: 'Brandon Perfetti',
      shareTargets: [],
    })

    const settings = await getCmsSiteSettings()
    expect(settings.shareTargets).toEqual([])
  })
})
