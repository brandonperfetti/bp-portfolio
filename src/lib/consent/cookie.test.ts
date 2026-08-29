import { describe, expect, it } from 'vitest'

import {
  CONSENT_REQUIRED_COOKIE,
  parseConsentRequired,
  readConsentRequiredCookie,
} from './cookie'

describe('parseConsentRequired', () => {
  it('maps the tristate', () => {
    expect(parseConsentRequired('true')).toBe(true)
    expect(parseConsentRequired('false')).toBe(false)
    expect(parseConsentRequired(undefined)).toBeNull()
    expect(parseConsentRequired(null)).toBeNull()
    expect(parseConsentRequired('')).toBeNull()
    expect(parseConsentRequired('yes')).toBeNull()
  })
})

describe('readConsentRequiredCookie', () => {
  it('returns null when there is no cookie string (SSR) — fail closed', () => {
    expect(readConsentRequiredCookie(undefined)).toBeNull()
    expect(readConsentRequiredCookie('')).toBeNull()
  })

  it('reads the cookie value among others', () => {
    expect(
      readConsentRequiredCookie(
        `foo=1; ${CONSENT_REQUIRED_COOKIE}=false; bar=2`,
      ),
    ).toBe(false)
    expect(readConsentRequiredCookie(`${CONSENT_REQUIRED_COOKIE}=true`)).toBe(
      true,
    )
  })

  it('returns null when the cookie is absent', () => {
    expect(readConsentRequiredCookie('foo=1; bar=2')).toBeNull()
  })
})
