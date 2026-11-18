import { describe, expect, it } from 'vitest'

import type { CookieConsent } from '@/payload-types'

import {
  DEFAULT_CONSENT_CONFIG,
  SUPERSEDED_ANALYTICS_SUBTITLE,
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

  it('serves the current Analytics subtitle when the stored one is the superseded default (#361)', () => {
    // Production's saved global and the column default both hold the pre-#361
    // sentence, which says Google gets a signal before consent. Neither is a
    // customisation, so the reader must not serve it.
    const resolved = resolveConsentConfig(
      global({
        categories: {
          analytics: { subtitle: `${SUPERSEDED_ANALYTICS_SUBTITLE}\n` },
        } as CookieConsent['categories'],
      }),
    )
    const analytics = resolved.categories.find((c) => c.key === 'analytics')!
    expect(analytics.subtitle).toBe(
      DEFAULT_CONSENT_CONFIG.categories.find((c) => c.key === 'analytics')!
        .subtitle,
    )
    expect(analytics.subtitle).not.toContain('cookieless signal')
  })

  it('recognises exactly the sentence production has stored', () => {
    // Written out here, not imported: the special case only works while the
    // constant equals what is actually in the database. This is the value of
    // `categories.analytics.subtitle` read from the production `cookie-consent`
    // global on 2026-11-18, and the column default in
    // `src/migrations/20260826_145724_cookie_consent_global.ts`. If the
    // constant is ever edited, this fails before production starts serving
    // the old sentence again.
    const stored =
      'Google Analytics 4 via Consent Mode v2. Before you grant it, GA sets no cookies; Google still receives an anonymous, cookieless signal. A cookieless Vercel Analytics baseline runs regardless of this choice.'
    expect(SUPERSEDED_ANALYTICS_SUBTITLE).toBe(stored)

    const resolved = resolveConsentConfig(
      global({
        categories: {
          analytics: { subtitle: stored },
        } as CookieConsent['categories'],
      }),
    )
    expect(
      resolved.categories.find((c) => c.key === 'analytics')!.subtitle,
    ).toBe(
      'Google Analytics 4. It loads only while this is on; while it is off, nothing is requested from or sent to Google. A cookieless Vercel Analytics baseline runs regardless of this choice.',
    )
  })

  it('still serves an Analytics subtitle the editor wrote', () => {
    const resolved = resolveConsentConfig(
      global({
        categories: {
          analytics: { subtitle: 'Our own words about analytics.' },
        } as CookieConsent['categories'],
      }),
    )
    expect(
      resolved.categories.find((c) => c.key === 'analytics')!.subtitle,
    ).toBe('Our own words about analytics.')
  })

  it('resolves the privacy-policy page relation to its public path', () => {
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

  it('resolves a PLACED privacy-policy page to its full nested path (#148)', () => {
    // A `/`+slug guess would 404 for a policy page filed under a parent.
    const resolved = resolveConsentConfig(
      global({
        banner: {
          privacyPolicyText: 'Privacy Policy',
          privacyPolicyPage: {
            slug: 'privacy',
            path: 'legal/privacy',
          },
        } as unknown as CookieConsent['banner'],
      }),
    )
    expect(resolved.dialog.privacyPolicyHref).toBe('/legal/privacy')
  })

  it('leaves the privacy href undefined when no page is set', () => {
    expect(resolveConsentConfig(null).dialog.privacyPolicyHref).toBeUndefined()
  })

  it('leaves the privacy href undefined for an unpopulated relation', () => {
    // A depth-0 read leaves the relation a bare id with no slug to resolve;
    // `publicPathFor` returns null and the link is simply not offered.
    const resolved = resolveConsentConfig(
      global({
        banner: {
          privacyPolicyText: 'Privacy Policy',
          privacyPolicyPage: 42,
        } as unknown as CookieConsent['banner'],
      }),
    )
    expect(resolved.dialog.privacyPolicyHref).toBeUndefined()
  })
})
