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

  it('agrees with what staging and production store for Analytics (#372)', () => {
    // `categories.analytics.subtitle` read anonymously from both environments'
    // `cookie-consent` global on 2026-11-19. It is the code default too, so the
    // admin's column default and the dialog's fallback say the same thing.
    const stored =
      'Google Analytics 4. It loads only while Analytics is allowed; while it is not, nothing is requested from or sent to Google. A change takes effect when you save it. A cookieless Vercel Analytics baseline runs regardless of this choice.'
    expect(
      DEFAULT_CONSENT_CONFIG.categories.find((c) => c.key === 'analytics')!
        .subtitle,
    ).toBe(stored)
  })

  it('serves a stored pre-#361 Analytics subtitle as written (#372)', () => {
    // The reader no longer swaps the old shipped sentence for the default: a
    // database still holding it would show it, which is why #372 waited for
    // both environments to be edited first.
    const old =
      'Google Analytics 4 via Consent Mode v2. Before you grant it, GA sets no cookies; Google still receives an anonymous, cookieless signal. A cookieless Vercel Analytics baseline runs regardless of this choice.'
    const resolved = resolveConsentConfig(
      global({
        categories: {
          analytics: { subtitle: old },
        } as CookieConsent['categories'],
      }),
    )
    expect(
      resolved.categories.find((c) => c.key === 'analytics')!.subtitle,
    ).toBe(old)
  })

  it('serves the stored pre-#476 essential subtitle as written', () => {
    // Production's `categories.essential.subtitle`, read anonymously on
    // 2026-11-26 11:38Z. A stored value wins over the code default, so the new
    // copy reaches production only once that field is edited in the admin.
    const stored =
      'Sign-in sessions (Clerk) and bot protection (Cloudflare Turnstile). Required for the site to work — always on.'
    const resolved = resolveConsentConfig(
      global({
        categories: {
          essential: { subtitle: stored },
        } as CookieConsent['categories'],
      }),
    )
    expect(
      resolved.categories.find((c) => c.key === 'essential')!.subtitle,
    ).toBe(stored)
  })

  it('falls back to the #476 essential subtitle when the field is blank', () => {
    const resolved = resolveConsentConfig(
      global({
        categories: {
          essential: { subtitle: '  ' },
        } as CookieConsent['categories'],
      }),
    )
    const subtitle = resolved.categories.find(
      (c) => c.key === 'essential',
    )!.subtitle
    expect(subtitle).toBe(
      DEFAULT_CONSENT_CONFIG.categories.find((c) => c.key === 'essential')!
        .subtitle,
    )
    expect(subtitle).toContain('Sentry')
  })

  it('serves an Analytics subtitle the editor wrote', () => {
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
