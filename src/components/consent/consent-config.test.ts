import { describe, expect, it } from 'vitest'

import {
  buildConsentManagerOptions,
  buildConsentScripts,
  CONSENT_CATEGORIES,
  consentTheme,
  offlinePolicyPacks,
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
    // Consent Mode v2 shape: measurement category, always-load (gtag manages
    // its own consent internally), and the id carried into the gtag.js src.
    expect(script.category).toBe('measurement')
    expect(script.alwaysLoad).toBe(true)
    expect(script.src).toContain('G-TEST12345')
    expect(script.src).toContain('googletagmanager.com/gtag/js')
  })
})

describe('offlinePolicyPacks (geo preset triad)', () => {
  it('is the europe-opt-in / california-opt-out / world-no-banner triad', () => {
    const packs = offlinePolicyPacks()
    expect(packs).toHaveLength(3)
    const ids = packs.map((p) => p.id)
    expect(ids).toContain('europe_opt_in')
    expect(ids).toContain('california_opt_out')
    expect(ids).toContain('world_no_banner')
  })

  it('uses europe-opt-in as the fallback so no-geo visitors see the banner', () => {
    // Offline mode cannot geo-detect; the fallback pack governs every visitor.
    // europeOptIn carries match.fallback and shows the banner (opt-in), which
    // is the conservative-compliant default. See docs/ANALYTICS.md.
    const europe = offlinePolicyPacks().find((p) => p.id === 'europe_opt_in')
    expect(europe?.match.fallback).toBe(true)
    expect(europe?.ui?.mode).toBe('banner')
  })
})

describe('buildConsentManagerOptions', () => {
  const options = buildConsentManagerOptions({
    scripts: [],
    disableAnimation: false,
  })

  it('runs in offline mode with the triad policy packs', () => {
    expect(options.mode).toBe('offline')
    expect(options.offlinePolicy?.policyPacks).toHaveLength(3)
  })

  it('offers only the necessary + measurement categories (no ads/marketing)', () => {
    expect(options.consentCategories).toEqual([...CONSENT_CATEGORIES])
    expect(options.consentCategories).not.toContain('marketing')
  })

  it('passes the scripts and reduced-motion flag through, and themes from site tokens', () => {
    expect(options.scripts).toEqual([])
    expect(options.disableAnimation).toBe(false)
    expect(options.trapFocus).toBe(true)
    expect(options.theme).toBe(consentTheme)
  })

  it('reflects the reduced-motion preference', () => {
    const reduced = buildConsentManagerOptions({
      scripts: [],
      disableAnimation: true,
    })
    expect(reduced.disableAnimation).toBe(true)
  })

  it('only sets overrides when provided (app relies on the fallback)', () => {
    expect(options.overrides).toBeUndefined()
    const forced = buildConsentManagerOptions({
      scripts: [],
      disableAnimation: false,
      overrides: { country: 'DE' },
    })
    expect(forced.overrides).toEqual({ country: 'DE' })
  })
})
