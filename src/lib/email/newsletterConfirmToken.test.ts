import { hkdfSync } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CONFIRM_TOKEN_TTL_SECONDS,
  createConfirmToken,
  getConfirmTokenKey,
  verifyConfirmToken,
} from '@/lib/email/newsletterConfirmToken'

/**
 * The newsletter double opt-in token (#407): stateless, the address and the
 * expiry sealed with AES-256-GCM. What matters is what it hides and refuses.
 */

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0)

afterEach(() => {
  vi.unstubAllEnvs()
})

function key(secret = 'test-payload-secret') {
  vi.stubEnv('PAYLOAD_SECRET', secret)
  const k = getConfirmTokenKey()
  if (!k) throw new Error('no key')
  return k
}

describe('newsletter confirmation token', () => {
  it('has no key, and so seals nothing, without PAYLOAD_SECRET', () => {
    vi.stubEnv('PAYLOAD_SECRET', '')
    expect(getConfirmTokenKey()).toBeNull()
  })

  it('derives its key from PAYLOAD_SECRET with HKDF, never the secret itself', () => {
    const k = key('s3cret')
    expect(k.equals(Buffer.from('s3cret'))).toBe(false)
    expect(
      k.equals(
        Buffer.from(
          hkdfSync(
            'sha256',
            's3cret',
            '',
            'bp-portfolio:newsletter-confirm:v1',
            32,
          ),
        ),
      ),
    ).toBe(true)
  })

  it('round-trips the address it was made for, inside the window', () => {
    const k = key()
    const token = createConfirmToken('reader@example.test', k, NOW)
    expect(token).toMatch(/^[\w-]+$/)
    expect(
      verifyConfirmToken(
        token,
        k,
        NOW + (CONFIRM_TOKEN_TTL_SECONDS - 1) * 1000,
      ),
    ).toEqual({ ok: true, email: 'reader@example.test' })
  })

  it('does not carry the address readably: the link lands in Sentry, analytics and logs', () => {
    const token = createConfirmToken('reader@example.test', key(), NOW)
    const decoded = Buffer.from(token, 'base64url').toString('latin1')
    for (const view of [token, decoded, decodeURIComponent(token)]) {
      expect(view).not.toContain('reader')
      expect(view).not.toContain('example.test')
    }
    // A fresh nonce each time, so two links for one address do not match.
    expect(createConfirmToken('reader@example.test', key(), NOW)).not.toBe(
      token,
    )
  })

  it('refuses an expired token as expired', () => {
    const k = key()
    const token = createConfirmToken('reader@example.test', k, NOW)
    expect(
      verifyConfirmToken(token, k, NOW + CONFIRM_TOKEN_TTL_SECONDS * 1000),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses an edited token, so it cannot be re-pointed at another address', () => {
    const k = key()
    const raw = Buffer.from(
      createConfirmToken('reader@example.test', k, NOW),
      'base64url',
    )
    for (const at of [0, 14, raw.length - 1]) {
      const edited = Buffer.from(raw)
      edited[at] ^= 0x01
      expect(verifyConfirmToken(edited.toString('base64url'), k, NOW)).toEqual({
        ok: false,
        reason: 'invalid',
      })
    }
  })

  it('refuses a token sealed with another key (forged, or another environment)', () => {
    const forged = createConfirmToken(
      'reader@example.test',
      key('attacker-guess'),
      NOW,
    )
    expect(verifyConfirmToken(forged, key(), NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('refuses an expired-looking forgery as invalid, not expired', () => {
    const forged = createConfirmToken(
      'reader@example.test',
      key('attacker-guess'),
      NOW - CONFIRM_TOKEN_TTL_SECONDS * 2000,
    )
    expect(verifyConfirmToken(forged, key(), NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it.each([
    ['not a string', 42],
    ['missing', undefined],
    ['empty', ''],
    ['too short to hold a tag', 'abc'],
    ['not base64url', 'a.b.c'],
    ['too long', 'a'.repeat(2049)],
  ])('refuses a malformed token (%s)', (_label, token) => {
    expect(verifyConfirmToken(token, key(), NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})
