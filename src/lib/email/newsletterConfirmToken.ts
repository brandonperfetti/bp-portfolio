import { createHmac, timingSafeEqual } from 'node:crypto'

/** How long a confirmation link works, in seconds: three days. */
export const CONFIRM_TOKEN_TTL_SECONDS = 3 * 24 * 60 * 60

/** Separates this key from every other use of `PAYLOAD_SECRET`. */
const KEY_CONTEXT = 'bp-portfolio:newsletter-confirm:v1'

/** Why a token was refused. */
export type ConfirmTokenRefusal = 'invalid' | 'expired'

/** The result of reading a confirmation token. */
export type ConfirmTokenResult =
  { ok: true; email: string } | { ok: false; reason: ConfirmTokenRefusal }

/**
 * The key that signs newsletter confirmation links, or `null` when
 * `PAYLOAD_SECRET` is unset.
 *
 * @returns A 32-byte key, or `null`; a caller treats `null` as "cannot
 * confirm anything" and answers 503.
 *
 * @remarks **Why `PAYLOAD_SECRET`, not a new variable.** It is server-only,
 * set per environment with staging and production values kept apart
 * (`docs/SECURITY.md` § Secret handling), and the repo already keys HMACs
 * with it (`anonIpKeyDigest`). The key is derived from it with a fixed
 * context label, so a confirmation signature cannot be confused with any
 * other HMAC made from the same secret, and the secret itself never signs a
 * token. Rotating `PAYLOAD_SECRET` invalidates outstanding links, which costs
 * a reader at most one more sign-up. There is no development fallback: an
 * unset secret refuses, never signs with a known value.
 */
export function getConfirmTokenKey(): Buffer | null {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) return null
  return createHmac('sha256', secret).update(KEY_CONTEXT).digest()
}

function sign(key: Buffer, payload: string): Buffer {
  return createHmac('sha256', key).update(payload).digest()
}

/**
 * Sign a confirmation token for one address.
 *
 * @param email - The address the token confirms, as the visitor typed it.
 * @param key - From {@link getConfirmTokenKey}.
 * @param nowMs - The current time, injectable for tests.
 * @returns `<payload>.<signature>`, both base64url, safe in a URL as is.
 *
 * @remarks Stateless on purpose: the address and the expiry are inside the
 * signed payload, so no store is needed, a token cannot be re-pointed at
 * another address, and a forged or edited one fails the signature check.
 */
export function createConfirmToken(
  email: string,
  key: Buffer,
  nowMs: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      e: email,
      x: Math.floor(nowMs / 1000) + CONFIRM_TOKEN_TTL_SECONDS,
    }),
  ).toString('base64url')
  return `${payload}.${sign(key, payload).toString('base64url')}`
}

/**
 * Check a confirmation token and return the address it confirms.
 *
 * @param token - The token from the link, untrusted.
 * @param key - From {@link getConfirmTokenKey}.
 * @param nowMs - The current time, injectable for tests.
 * @returns The address, or why the token was refused.
 *
 * @remarks The signature is checked, in constant time, before the payload is
 * parsed, so nothing about a forged token is read. Only then is the expiry
 * compared, so `expired` is reported only for a token this site signed.
 */
export function verifyConfirmToken(
  token: unknown,
  key: Buffer,
  nowMs: number = Date.now(),
): ConfirmTokenResult {
  if (typeof token !== 'string' || token.length > 2048) {
    return { ok: false, reason: 'invalid' }
  }
  const [payload, signature, ...rest] = token.split('.')
  if (!payload || !signature || rest.length > 0) {
    return { ok: false, reason: 'invalid' }
  }

  const expected = sign(key, payload)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'invalid' }
  }

  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const { e, x } = (claims ?? {}) as { e?: unknown; x?: unknown }
  if (typeof e !== 'string' || !e || typeof x !== 'number') {
    return { ok: false, reason: 'invalid' }
  }
  if (Math.floor(nowMs / 1000) >= x) return { ok: false, reason: 'expired' }
  return { ok: true, email: e }
}
