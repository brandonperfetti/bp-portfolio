import { describe, expect, it } from 'vitest'

import {
  CONSENT_REQUIRED_SUBDIVISIONS,
  EU_EEA_UK_COUNTRIES,
  requiresConsent,
} from './jurisdiction'

describe('requiresConsent', () => {
  it('requires consent for EU / EEA / UK countries', () => {
    for (const country of ['DE', 'FR', 'GB', 'IE', 'NO', 'IS', 'LI']) {
      expect(requiresConsent({ country, region: null })).toBe(true)
    }
  })

  it('requires consent for US privacy-law subdivisions and Québec', () => {
    expect(requiresConsent({ country: 'US', region: 'CA' })).toBe(true) // California
    expect(requiresConsent({ country: 'US', region: 'TX' })).toBe(true)
    expect(requiresConsent({ country: 'US', region: 'VA' })).toBe(true)
    expect(requiresConsent({ country: 'CA', region: 'QC' })).toBe(true) // Québec
  })

  it('does NOT require consent for non-listed US states', () => {
    expect(requiresConsent({ country: 'US', region: 'WA' })).toBe(false)
    expect(requiresConsent({ country: 'US', region: 'NY' })).toBe(false)
  })

  it('handles the Canada/California footgun: country CA (Canada) is not the US CA subdivision', () => {
    // Canada, Ontario — Canada is not in the EU set and ON is not a required
    // subdivision, so consent is NOT required. The country code "CA" must never
    // be read as the California subdivision.
    expect(requiresConsent({ country: 'CA', region: 'ON' })).toBe(false)
    // And a bare country "CA" (Canada) with no region is likewise not required.
    expect(requiresConsent({ country: 'CA', region: null })).toBe(false)
  })

  it('guards the subdivision match on country (cross-country collision)', () => {
    // Brazil, Mato Grosso: region code "MT" collides with Montana but Brazil is
    // not a US/CA subdivision jurisdiction, so consent is NOT required.
    expect(requiresConsent({ country: 'BR', region: 'MT' })).toBe(false)
    // US Montana still matches (a listed US privacy-law state).
    expect(requiresConsent({ country: 'US', region: 'MT' })).toBe(true)
    // Canada Québec still matches.
    expect(requiresConsent({ country: 'CA', region: 'QC' })).toBe(true)
    // Absent country + a US-state code keeps the fail-safe (still required).
    expect(requiresConsent({ country: null, region: 'MT' })).toBe(true)
  })

  it('fails closed (required) when geo is fully unknown/absent', () => {
    expect(requiresConsent({})).toBe(true)
    expect(requiresConsent({ country: null, region: null })).toBe(true)
    expect(requiresConsent({ country: '', region: '' })).toBe(true)
    expect(requiresConsent({ country: '  ', region: undefined })).toBe(true)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(requiresConsent({ country: 'de', region: null })).toBe(true)
    expect(requiresConsent({ country: 'us', region: 'ca' })).toBe(true)
    expect(requiresConsent({ country: ' US ', region: ' WA ' })).toBe(false)
  })

  it('keeps the two sets disjoint in intent (CA lives only in subdivisions)', () => {
    expect(CONSENT_REQUIRED_SUBDIVISIONS.has('CA')).toBe(true)
    expect(EU_EEA_UK_COUNTRIES.has('CA')).toBe(false)
    expect(EU_EEA_UK_COUNTRIES.has('GB')).toBe(true)
  })
})
