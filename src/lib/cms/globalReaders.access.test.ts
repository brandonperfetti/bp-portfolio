import { beforeEach, describe, expect, it, vi } from 'vitest'

// #262: the global readers (four since the footer's, #363) must read with access control enforced. The
// Payload Local API defaults `overrideAccess` to `true`, so an omitted option
// silently skips the global's `read` rule and, at `depth: 1`, the rule of
// every relation it populates. `getPayload` returns a fake `findGlobal` and
// the `'use cache'` primitives are no-op stubbed, as in
// `siteSettingsRepo.test.ts`; the subject here is the options each reader
// passes, not its mapping.
const findGlobal = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ findGlobal })),
}))
vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

import { getCmsConsentConfig } from '@/lib/cms/consentRepo'
import { getCmsFooterLinks } from '@/lib/cms/footerRepo'
import { getCmsNavigation } from '@/lib/cms/navigationRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'

beforeEach(() => {
  findGlobal.mockReset()
  findGlobal.mockResolvedValue(null)
})

/** The options of the one `findGlobal` call a reader made. */
const findGlobalOptions = () => {
  expect(findGlobal).toHaveBeenCalledTimes(1)
  return findGlobal.mock.calls[0]![0] as Record<string, unknown>
}

describe('global readers enforce access control (#262, #363)', () => {
  it('getCmsNavigation reads `navigation` with overrideAccess: false', async () => {
    await getCmsNavigation()

    expect(findGlobalOptions()).toMatchObject({
      slug: 'navigation',
      overrideAccess: false,
    })
  })

  it('getCmsFooterLinks reads `footer` with overrideAccess: false (#363)', async () => {
    await getCmsFooterLinks()

    expect(findGlobalOptions()).toMatchObject({
      slug: 'footer',
      overrideAccess: false,
    })
  })

  it('getCmsSiteSettings reads `site-settings` with overrideAccess: false', async () => {
    await getCmsSiteSettings()

    expect(findGlobalOptions()).toMatchObject({
      slug: 'site-settings',
      overrideAccess: false,
    })
  })

  it('getCmsConsentConfig reads `cookie-consent` with overrideAccess: false', async () => {
    await getCmsConsentConfig()

    expect(findGlobalOptions()).toMatchObject({
      slug: 'cookie-consent',
      overrideAccess: false,
    })
  })

  it('getCmsConsentConfig offers no privacy link when the relation comes back unpopulated', async () => {
    // What Payload returns to this reader for a never-published page once
    // access is enforced: the relation stays a bare id. (That Payload does so
    // is proven on the pg tier, in
    // `evals/consent-privacy-page-access-integration.test.ts`.)
    findGlobal.mockResolvedValue({
      banner: { privacyPolicyText: 'Privacy Policy', privacyPolicyPage: 42 },
    })

    const config = await getCmsConsentConfig()

    expect(config.dialog.privacyPolicyHref).toBeUndefined()
  })
})
