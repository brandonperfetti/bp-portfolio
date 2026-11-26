import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildConsentManagerOptions,
  buildConsentScripts,
  CONSENT_CATEGORIES,
  CONSENT_STORAGE_KEY,
  gaDisableKey,
  readGaEnv,
  shouldAutoGrantMeasurement,
  shouldClearAutomaticGrant,
  shouldShowBanner,
  stopGoogleAnalytics,
} from './consent-config'
import { isAutomaticShape } from './automatic-grant'

describe('buildConsentScripts (GA4 gating)', () => {
  it('registers zero Google code when the measurement id is unset', () => {
    expect(
      buildConsentScripts({ measurementId: undefined, isProduction: true }),
    ).toEqual([])
    expect(
      buildConsentScripts({ measurementId: '', isProduction: true }),
    ).toEqual([])
  })

  it('registers zero Google code outside production even with an id', () => {
    expect(
      buildConsentScripts({
        measurementId: 'G-TEST12345',
        isProduction: false,
      }),
    ).toEqual([])
  })

  it('registers the gtag Consent Mode v2 script in production with an id', () => {
    const scripts = buildConsentScripts({
      measurementId: 'G-TEST12345',
      isProduction: true,
    })
    expect(scripts).toHaveLength(1)
    const [script] = scripts
    expect(script.category).toBe('measurement')
    expect(script.src).toContain('G-TEST12345')
    expect(script.src).toContain('googletagmanager.com/gtag/js')
  })

  it('gates the tag on the measurement category instead of always loading it (#361)', () => {
    // c15t's prebuilt Google tag is `alwaysLoad: true`: installed for every
    // visitor, it sends Google a cookieless page_view while consent is denied.
    // With the flag off, c15t skips the script (setup steps included) until
    // `measurement` is granted.
    const [script] = buildConsentScripts({
      measurementId: 'G-TEST12345',
      isProduction: true,
    })
    expect(script.alwaysLoad).toBe(false)
    // Kept: a re-grant must reuse the element, not run gtag.js a second time.
    expect(script.persistAfterConsentRevoked).toBe(true)
  })
})

describe('the gtag opt-out switch (#361)', () => {
  const ID = 'G-TEST12345'
  const win = window as unknown as Record<string, unknown>
  const info = (hasConsent: boolean) => ({
    id: 'gtag',
    elementId: 'x',
    hasConsent,
    consents: { measurement: hasConsent } as never,
  })

  afterEach(() => {
    delete win[gaDisableKey(ID)]
    delete win.gtag
    delete win.dataLayer
  })

  it('names the property gtag.js documents for opting out', () => {
    expect(gaDisableKey(ID)).toBe('ga-disable-G-TEST12345')
  })

  it('lifts the switch before the tag is installed with consent', () => {
    win[gaDisableKey(ID)] = true
    const [script] = buildConsentScripts({
      measurementId: ID,
      isProduction: true,
    })
    script.onBeforeLoad?.(info(true))
    expect(win[gaDisableKey(ID)]).toBe(false)
    // The prebuilt tag's own setup still ran: consent default, then config.
    const calls = (win.dataLayer as ArrayLike<unknown>[]).map((args) =>
      Array.from(args),
    )
    expect(calls[0]).toEqual([
      'consent',
      'default',
      expect.objectContaining({ analytics_storage: 'granted' }),
    ])
    expect(calls).toContainEqual(['config', ID])
  })

  it('lifts the switch when c15t re-syncs a re-granted tag, and sets it when consent is gone', () => {
    const [script] = buildConsentScripts({
      measurementId: ID,
      isProduction: true,
    })
    win[gaDisableKey(ID)] = true
    script.onConsentChange?.(info(true))
    expect(win[gaDisableKey(ID)]).toBe(false)
    script.onConsentChange?.(info(false))
    expect(win[gaDisableKey(ID)]).toBe(true)
  })

  it('stopGoogleAnalytics sets the switch and tells an installed tag storage is denied', () => {
    const gtagSpy = vi.fn()
    win.gtag = gtagSpy
    stopGoogleAnalytics({ measurementId: ID, isProduction: true })
    expect(win[gaDisableKey(ID)]).toBe(true)
    expect(gtagSpy).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
    })
  })

  it('stopGoogleAnalytics sets the switch without creating a tag that never loaded', () => {
    stopGoogleAnalytics({ measurementId: ID, isProduction: true })
    expect(win[gaDisableKey(ID)]).toBe(true)
    expect(win.gtag).toBeUndefined()
    expect(win.dataLayer).toBeUndefined()
  })

  it('stopGoogleAnalytics does nothing where no Google code is registered', () => {
    stopGoogleAnalytics({ measurementId: undefined, isProduction: true })
    stopGoogleAnalytics({ measurementId: ID, isProduction: false })
    expect(gaDisableKey(ID) in win).toBe(false)
  })
})

describe('readGaEnv (Sp-1: NEXT_PUBLIC_VERCEL_ENV, not NODE_ENV)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is production only when NEXT_PUBLIC_VERCEL_ENV is exactly "production"', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST12345')
    const env = readGaEnv()
    expect(env.isProduction).toBe(true)
    expect(env.measurementId).toBe('G-TEST12345')
    expect(buildConsentScripts(env)).toHaveLength(1)
  })

  it('is NOT production on Vercel Preview (the NODE_ENV footgun)', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST12345')
    const env = readGaEnv()
    expect(env.isProduction).toBe(false)
    expect(buildConsentScripts(env)).toEqual([])
  })

  it('is NOT production when the env is unset (local/dev)', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST12345')
    expect(readGaEnv().isProduction).toBe(false)
  })

  it('loads zero Google code when the id is empty even in production', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '')
    expect(buildConsentScripts(readGaEnv())).toEqual([])
  })
})

describe('buildConsentManagerOptions (headless)', () => {
  const options = buildConsentManagerOptions({ scripts: [] })

  it('is offline + noStyle with the storage key and no built-in theme/policy', () => {
    expect(options.mode).toBe('offline')
    expect(options.noStyle).toBe(true)
    expect(options.storageConfig).toEqual({ storageKey: CONSENT_STORAGE_KEY })
    // Headless: no c15t theme object, no offlinePolicy/policyPacks.
    expect('theme' in options).toBe(false)
    expect('offlinePolicy' in options).toBe(false)
  })

  it('offers only the necessary + measurement categories', () => {
    expect(options.consentCategories).toEqual([...CONSENT_CATEGORIES])
    expect(options.consentCategories).not.toContain('marketing')
  })

  it('passes the scripts through', () => {
    const scripts = buildConsentScripts({
      measurementId: 'G-X',
      isProduction: true,
    })
    expect(buildConsentManagerOptions({ scripts }).scripts).toBe(scripts)
  })

  it('offers the CMS-derived categories when given (enabled-categories logic)', () => {
    // Only the enabled categories reach c15t (Essential always; Analytics on;
    // Social/Advertising added only when their CMS toggle is on).
    expect(
      buildConsentManagerOptions({
        scripts: [],
        categories: ['necessary', 'measurement', 'marketing'],
      }).consentCategories,
    ).toEqual(['necessary', 'measurement', 'marketing'])

    // Social/Advertising OFF → just the default pair, no marketing/functionality.
    const off = buildConsentManagerOptions({
      scripts: [],
      categories: ['necessary', 'measurement'],
    }).consentCategories
    expect(off).toEqual(['necessary', 'measurement'])
    expect(off).not.toContain('marketing')
    expect(off).not.toContain('functionality')
  })

  it('treats disableAutomaticBlocking as a no-op (headless offline c15t)', () => {
    // Parity field only: there is no c15t auto-blocking to switch off here
    // (GA4 is gated via `scripts`). Toggling it must not change the options.
    const base = buildConsentManagerOptions({ scripts: [] })
    const on = buildConsentManagerOptions({
      scripts: [],
      disableAutomaticBlocking: true,
    })
    const offExplicit = buildConsentManagerOptions({
      scripts: [],
      disableAutomaticBlocking: false,
    })
    expect(on).toEqual(base)
    expect(offExplicit).toEqual(base)
    // And no stray blocking-related key leaked onto the options object.
    expect('disableAutomaticBlocking' in on).toBe(false)
  })
})

describe('shouldClearAutomaticGrant (#375: the region now asks)', () => {
  it('clears a live automatic grant where consent is required', () => {
    expect(
      shouldClearAutomaticGrant({
        automaticGrantLive: true,
        consentRequired: true,
        hasConsented: false,
      }),
    ).toBe(true)
  })

  it('clears it when the region cannot be read (fail closed)', () => {
    expect(
      shouldClearAutomaticGrant({
        automaticGrantLive: true,
        consentRequired: null,
        hasConsented: false,
      }),
    ).toBe(true)
  })

  it('keeps it where consent is confidently not required', () => {
    expect(
      shouldClearAutomaticGrant({
        automaticGrantLive: true,
        consentRequired: false,
        hasConsented: false,
      }),
    ).toBe(false)
  })

  it('never touches an explicit choice', () => {
    expect(
      shouldClearAutomaticGrant({
        automaticGrantLive: true,
        consentRequired: true,
        hasConsented: true,
      }),
    ).toBe(false)
  })

  it('does nothing when no automatic grant is live', () => {
    expect(
      shouldClearAutomaticGrant({
        automaticGrantLive: false,
        consentRequired: true,
        hasConsented: false,
      }),
    ).toBe(false)
  })
})

describe('isAutomaticShape (#375: what the one-time clean-up deletes)', () => {
  const automatic = {
    necessary: true,
    functionality: false,
    measurement: true,
    experience: false,
    marketing: false,
  }

  it('matches exactly the record the automatic grant stored', () => {
    expect(isAutomaticShape(automatic)).toBe(true)
    expect(isAutomaticShape({ necessary: true, measurement: true })).toBe(true)
  })

  it('does not match a Reject', () => {
    expect(isAutomaticShape({ ...automatic, measurement: false })).toBe(false)
  })

  it('does not match a wider Accept', () => {
    expect(isAutomaticShape({ ...automatic, marketing: true })).toBe(false)
    expect(isAutomaticShape({ ...automatic, functionality: true })).toBe(false)
  })

  it('does not match a missing or malformed record', () => {
    expect(isAutomaticShape(null)).toBe(false)
    expect(isAutomaticShape(undefined)).toBe(false)
    expect(isAutomaticShape({ measurement: true })).toBe(false)
  })
})

describe('shouldShowBanner (fail-closed, choice-aware)', () => {
  it('shows where consent is required and no choice made', () => {
    expect(
      shouldShowBanner({ consentRequired: true, hasConsented: false }),
    ).toBe(true)
  })

  it('shows where geo is unknown (fail closed)', () => {
    expect(
      shouldShowBanner({ consentRequired: null, hasConsented: false }),
    ).toBe(true)
  })

  it('suppresses where consent is confidently not required', () => {
    expect(
      shouldShowBanner({ consentRequired: false, hasConsented: false }),
    ).toBe(false)
  })

  it('suppresses once the visitor has made a choice', () => {
    expect(
      shouldShowBanner({ consentRequired: true, hasConsented: true }),
    ).toBe(false)
  })
})

describe('shouldAutoGrantMeasurement (opt-out-aware analytics)', () => {
  it('auto-grants measurement only where not required and no prior choice', () => {
    expect(
      shouldAutoGrantMeasurement({
        consentRequired: false,
        hasConsented: false,
      }),
    ).toBe(true)
  })

  it('does not auto-grant where consent is required or unknown', () => {
    expect(
      shouldAutoGrantMeasurement({
        consentRequired: true,
        hasConsented: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoGrantMeasurement({
        consentRequired: null,
        hasConsented: false,
      }),
    ).toBe(false)
  })

  it('does not override an explicit prior choice', () => {
    expect(
      shouldAutoGrantMeasurement({
        consentRequired: false,
        hasConsented: true,
      }),
    ).toBe(false)
  })
})

describe('buildConsentManagerOptions — the pre-reload revocation hook (#361)', () => {
  it('wires c15t’s synchronous before-reload callback to the given handler', () => {
    const handler = vi.fn()
    const options = buildConsentManagerOptions({
      scripts: [],
      onBeforeRevocationReload: handler,
    })

    options.callbacks?.onBeforeConsentRevocationReload?.({
      preferences: { necessary: true, measurement: false },
    } as never)

    expect(handler).toHaveBeenCalledWith({
      necessary: true,
      measurement: false,
    })
  })

  it('adds no callbacks when no handler is given', () => {
    expect(
      buildConsentManagerOptions({ scripts: [] }).callbacks,
    ).toBeUndefined()
  })
})
