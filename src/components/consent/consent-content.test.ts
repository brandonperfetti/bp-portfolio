import { describe, expect, it } from 'vitest'

import {
  CATEGORY_TO_C15T,
  DEFAULT_CONSENT_CONFIG,
  enabledC15tCategories,
  enabledCategories,
} from './consent-content'

/**
 * The defaults are the behavior-preserving contract: an empty/unseeded
 * `cookie-consent` global renders today's copy and today's UX. These pins force
 * a conversation if the pre-CMS strings/toggles ever change.
 */
describe('DEFAULT_CONSENT_CONFIG (today’s copy + UX)', () => {
  it('keeps Essential + Analytics on and Social + Advertising off', () => {
    const byKey = Object.fromEntries(
      DEFAULT_CONSENT_CONFIG.categories.map((c) => [c.key, c]),
    )
    expect(byKey.essential.enabled).toBe(true)
    expect(byKey.essential.alwaysOn).toBe(true)
    expect(byKey.analytics.enabled).toBe(true)
    expect(byKey.social.enabled).toBe(false)
    expect(byKey.advertising.enabled).toBe(false)
  })

  it('carries the pre-CMS banner + dialog copy verbatim', () => {
    expect(DEFAULT_CONSENT_CONFIG.banner.title).toBe('') // title-less banner
    expect(DEFAULT_CONSENT_CONFIG.banner.message).toContain(
      'cookieless analytics baseline',
    )
    expect(DEFAULT_CONSENT_CONFIG.banner.acceptAllLabel).toBe('Accept all')
    expect(DEFAULT_CONSENT_CONFIG.banner.rejectNonEssentialLabel).toBe(
      'Reject non-essential',
    )
    expect(DEFAULT_CONSENT_CONFIG.banner.customizeLabel).toBe('Customize')
    expect(DEFAULT_CONSENT_CONFIG.dialog.title).toBe('Cookie preferences')
    expect(DEFAULT_CONSENT_CONFIG.dialog.saveLabel).toBe('Save choices')
    // The Consent Mode v2 disclosure (review Sp-2) lives in the analytics copy.
    const analytics = DEFAULT_CONSENT_CONFIG.categories.find(
      (c) => c.key === 'analytics',
    )!
    expect(analytics.subtitle).toContain('Consent Mode v2')
  })

  it('defaults the three feature toggles to today’s behavior', () => {
    expect(DEFAULT_CONSENT_CONFIG.features.showManageButton).toBe(true)
    expect(DEFAULT_CONSENT_CONFIG.features.showPersistentCookieButton).toBe(
      true,
    )
    expect(DEFAULT_CONSENT_CONFIG.features.disableAutomaticBlocking).toBe(false)
  })
})

describe('category → c15t mapping', () => {
  it('maps each bp category to a valid c15t consent name', () => {
    expect(CATEGORY_TO_C15T).toEqual({
      essential: 'necessary',
      analytics: 'measurement',
      social: 'functionality',
      advertising: 'marketing',
    })
  })
})

describe('enabledCategories / enabledC15tCategories', () => {
  it('returns only enabled rows and their c15t names by default', () => {
    expect(enabledCategories(DEFAULT_CONSENT_CONFIG).map((c) => c.key)).toEqual(
      ['essential', 'analytics'],
    )
    expect(enabledC15tCategories(DEFAULT_CONSENT_CONFIG)).toEqual([
      'necessary',
      'measurement',
    ])
  })

  it('adds Social/Advertising c15t names only when enabled', () => {
    const withSocialAndAds = {
      ...DEFAULT_CONSENT_CONFIG,
      categories: DEFAULT_CONSENT_CONFIG.categories.map((c) =>
        c.key === 'social' || c.key === 'advertising'
          ? { ...c, enabled: true }
          : c,
      ),
    }
    expect(enabledC15tCategories(withSocialAndAds)).toEqual([
      'necessary',
      'measurement',
      'functionality',
      'marketing',
    ])
  })

  it('always includes necessary even if Essential were somehow dropped', () => {
    const noEssential = {
      ...DEFAULT_CONSENT_CONFIG,
      categories: DEFAULT_CONSENT_CONFIG.categories.filter(
        (c) => c.key !== 'essential',
      ),
    }
    expect(enabledC15tCategories(noEssential)).toContain('necessary')
  })
})
