import { createHmac } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CONFIRM_TOKEN_TTL_SECONDS,
  createConfirmToken,
  getConfirmTokenKey,
  verifyConfirmToken,
} from '@/lib/email/newsletterConfirmToken'

/**
 * The newsletter double opt-in token (#407): stateless, signed over the
 * address and the expiry. What matters is what it refuses.
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
  it('has no key, and so signs nothing, without PAYLOAD_SECRET', () => {
    vi.stubEnv('PAYLOAD_SECRET', '')
    expect(getConfirmTokenKey()).toBeNull()
  })

  it('derives its key from PAYLOAD_SECRET, never the secret itself', () => {
    const k = key('s3cret')
    expect(k.equals(Buffer.from('s3cret'))).toBe(false)
    expect(
      k.equals(
        createHmac('sha256', 's3cret')
          .update('bp-portfolio:newsletter-confirm:v1')
          .digest(),
      ),
    ).toBe(true)
  })

  it('round-trips the address it was made for, inside the window', () => {
    const k = key()
    const token = createConfirmToken('reader@example.test', k, NOW)
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/)
    expect(
      verifyConfirmToken(
        token,
        k,
        NOW + (CONFIRM_TOKEN_TTL_SECONDS - 1) * 1000,
      ),
    ).toEqual({ ok: true, email: 'reader@example.test' })
  })

  it('refuses an expired token as expired', () => {
    const k = key()
    const token = createConfirmToken('reader@example.test', k, NOW)
    expect(
      verifyConfirmToken(token, k, NOW + CONFIRM_TOKEN_TTL_SECONDS * 1000),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses a token re-pointed at another address', () => {
    const k = key()
    const [, signature] = createConfirmToken(
      'reader@example.test',
      k,
      NOW,
    ).split('.')
    const otherPayload = Buffer.from(
      JSON.stringify({ e: 'victim@example.test', x: NOW / 1000 + 3600 }),
    ).toString('base64url')
    expect(verifyConfirmToken(`${otherPayload}.${signature}`, k, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('refuses a token signed with another key (forged, or another environment)', () => {
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
    ['one part', 'abc'],
    ['three parts', 'a.b.c'],
    ['too long', `${'a'.repeat(2048)}.b`],
  ])('refuses a malformed token (%s)', (_label, token) => {
    expect(verifyConfirmToken(token, key(), NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})
