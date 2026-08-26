import { describe, expect, it } from 'vitest'

import type { CookieConsent } from '@/payload-types'

import {
  DEFAULT_CONSENT_CONFIG,
  enabledC15tCategories,
} from './consent-content'
import { resolveConsentConfig } from './resolve-consent-config'

/** Build a partial `cookie-consent` global for the merge under test. */
const global = (partial: Partial<CookieConsent>): CookieConsent =>
  partial as unknown as CookieConsent

describe('resolveConsentConfig (CMS merge over defaults)', () => {
  it('returns today’s defaults verbatim for an unseeded global (null)', () => {
    expect(resolveConsentConfig(null)).toEqual(DEFAULT_CONSENT_CONFIG)
  })

  it('returns the defaults when every field is blank/absent', () => {
    expect(
      resolveConsentConfig(
        global({ banner: { message: '   ' } as CookieConsent['banner'] }),
      ),
    ).toEqual(DEFAULT_CONSENT_CONFIG)
  })

  it('threads set copy and leaves the rest defaulted', () => {
    const resolved = resolveConsentConfig(
      global({
        banner: {
          title: 'We value your privacy',
          message: 'Custom message.',
        } as CookieConsent['banner'],
        dialog: { saveLabel: 'Save' } as CookieConsent['dialog'],
      }),
    )
    expect(resolved.banner.title).toBe('We value your privacy')
    expect(resolved.banner.message).toBe('Custom message.')
    // Untouched labels keep the defaults.
    expect(resolved.banner.acceptAllLabel).toBe('Accept all')
    expect(resolved.dialog.saveLabel).toBe('Save')
    expect(resolved.dialog.title).toBe('Cookie preferences')
  })

  it('honors an explicit false toggle (nullish, not truthy, merge)', () => {
    const resolved = resolveConsentConfig(
      global({
        features: {
          showManageButton: false,
          showPersistentCookieButton: false,
        } as CookieConsent['features'],
      }),
    )
    expect(resolved.features.showManageButton).toBe(false)
    expect(resolved.features.showPersistentCookieButton).toBe(false)
    // Unset toggle falls back to the default (on).
    expect(resolved.features.disableAutomaticBlocking).toBe(false)
  })

  it('enables Social/Advertising only when their CMS toggle is on', () => {
    const resolved = resolveConsentConfig(
      global({
        categories: {
          social: { enabled: true },
          advertising: { enabled: true },
        } as CookieConsent['categories'],
      }),
    )
    expect(enabledC15tCategories(resolved)).toEqual([
      'necessary',
      'measurement',
      'functionality',
      'marketing',
    ])
  })

  it('drops Analytics from c15t when its toggle is off', () => {
    const resolved = resolveConsentConfig(
      global({
        categories: {
          analytics: { enabled: false },
        } as CookieConsent['categories'],
      }),
    )
    expect(
      resolved.categories.find((c) => c.key === 'analytics')!.enabled,
    ).toBe(false)
    expect(enabledC15tCategories(resolved)).toEqual(['necessary'])
  })

  it('resolves the privacy-policy page relation to /{slug}', () => {
    const resolved = resolveConsentConfig(
      global({
        banner: {
          privacyPolicyText: 'Privacy Policy',
          privacyPolicyPage: { slug: 'privacy' },
        } as unknown as CookieConsent['banner'],
      }),
    )
    expect(resolved.dialog.privacyPolicyText).toBe('Privacy Policy')
    expect(resolved.dialog.privacyPolicyHref).toBe('/privacy')
  })

  it('leaves the privacy href undefined when no page is set', () => {
    expect(resolveConsentConfig(null).dialog.privacyPolicyHref).toBeUndefined()
  })
})
