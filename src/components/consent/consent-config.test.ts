import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildConsentManagerOptions,
  buildConsentScripts,
  CONSENT_CATEGORIES,
  CONSENT_STORAGE_KEY,
  readGaEnv,
  shouldAutoGrantMeasurement,
  shouldRepromptOnRegionChange,
  shouldShowBanner,
} from './consent-config'

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
    expect(script.alwaysLoad).toBe(true)
    expect(script.src).toContain('G-TEST12345')
    expect(script.src).toContain('googletagmanager.com/gtag/js')
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

describe('shouldRepromptOnRegionChange (#103: auto-grant vs explicit choice)', () => {
  it('re-prompts an auto-granted visitor who enters a required region', () => {
    expect(
      shouldRepromptOnRegionChange({
        wasAutoGranted: true,
        consentRequired: true,
        hasExplicitChoice: false,
      }),
    ).toBe(true)
  })

  it('never re-prompts an explicit choice (the bug being fixed)', () => {
    expect(
      shouldRepromptOnRegionChange({
        wasAutoGranted: false,
        consentRequired: true,
        hasExplicitChoice: true,
      }),
    ).toBe(false)
  })

  it('does not re-prompt while the region stays opt-out or unknown', () => {
    expect(
      shouldRepromptOnRegionChange({
        wasAutoGranted: true,
        consentRequired: false,
        hasExplicitChoice: false,
      }),
    ).toBe(false)
    expect(
      shouldRepromptOnRegionChange({
        wasAutoGranted: true,
        consentRequired: null,
        hasExplicitChoice: false,
      }),
    ).toBe(false)
  })

  it('does not re-prompt when there was no auto-grant to revoke', () => {
    expect(
      shouldRepromptOnRegionChange({
        wasAutoGranted: false,
        consentRequired: true,
        hasExplicitChoice: false,
      }),
    ).toBe(false)
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
