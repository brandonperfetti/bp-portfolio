import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

/** How long a confirmation link works, in seconds: three days. */
export const CONFIRM_TOKEN_TTL_SECONDS = 3 * 24 * 60 * 60

/** Separates this key from every other use of `PAYLOAD_SECRET` (HKDF info). */
const KEY_CONTEXT = 'bp-portfolio:newsletter-confirm:v1'

/** AES-256-GCM nonce and tag lengths, in bytes. */
const IV_BYTES = 12
const TAG_BYTES = 16

/** Why a token was refused. */
export type ConfirmTokenRefusal = 'invalid' | 'expired'

/** The result of reading a confirmation token. */
export type ConfirmTokenResult =
  { ok: true; email: string } | { ok: false; reason: ConfirmTokenRefusal }

/**
 * The key that seals newsletter confirmation links, or `null` when
 * `PAYLOAD_SECRET` is unset.
 *
 * @returns A 32-byte key, or `null`; a caller treats `null` as "cannot
 * confirm anything" and answers 503.
 *
 * @remarks **Why `PAYLOAD_SECRET`, not a new variable.** It is server-only,
 * set per environment with staging and production values kept apart
 * (`docs/SECURITY.md` § Secret handling), and the repo already keys HMACs
 * with it (`anonIpKeyDigest`). The key is derived from it with HKDF and a
 * fixed context label, so it is unrelated to any other value made from the
 * same secret, and the secret itself never touches a token. Rotating
 * `PAYLOAD_SECRET` invalidates outstanding links, which costs a reader at
 * most one more sign-up. There is no development fallback: an unset secret
 * refuses, never seals with a known value.
 */
export function getConfirmTokenKey(): Buffer | null {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) return null
  return Buffer.from(hkdfSync('sha256', secret, '', KEY_CONTEXT, 32))
}

/**
 * Seal a confirmation token for one address.
 *
 * @param email - The address the token confirms, as the visitor typed it.
 * @param key - From {@link getConfirmTokenKey}.
 * @param nowMs - The current time, injectable for tests.
 * @returns One base64url string, safe in a URL as is.
 *
 * @remarks **Encrypted, not only signed.** The address and the expiry are
 * sealed with AES-256-GCM, so the token is opaque: the link lands in URLs
 * that Sentry, analytics and request logs keep, and a signed-only token
 * would hand them the address in base64, past the email redaction. GCM's tag
 * also authenticates it, so a forged or edited token fails, and a token
 * cannot be re-pointed at another address. Stateless on purpose: no store.
 */
export function createConfirmToken(
  email: string,
  key: Buffer,
  nowMs: number = Date.now(),
): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify({
    e: email,
    x: Math.floor(nowMs / 1000) + CONFIRM_TOKEN_TTL_SECONDS,
  })
  const sealed = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, sealed, cipher.getAuthTag()]).toString('base64url')
}

/**
 * Check a confirmation token and return the address it confirms.
 *
 * @param token - The token from the link, untrusted.
 * @param key - From {@link getConfirmTokenKey}.
 * @param nowMs - The current time, injectable for tests.
 * @returns The address, or why the token was refused.
 *
 * @remarks GCM checks the tag before any plaintext is returned, so nothing
 * from a forged token is read. Only then is the expiry compared, so
 * `expired` is reported only for a token this site sealed.
 */
export function verifyConfirmToken(
  token: unknown,
  key: Buffer,
  nowMs: number = Date.now(),
): ConfirmTokenResult {
  if (
    typeof token !== 'string' ||
    token.length > 2048 ||
    !/^[\w-]+$/.test(token)
  ) {
    return { ok: false, reason: 'invalid' }
  }
  const raw = Buffer.from(token, 'base64url')
  // Base64url decoding is lenient (spare low bits, a dangling character),
  // so one token has other spellings that decrypt the same. Only the
  // canonical one is accepted, so a respelled token cannot dodge the
  // single-use claim, which is keyed on the string (`newsletterTokenUse.ts`).
  if (raw.toString('base64url') !== token) {
    return { ok: false, reason: 'invalid' }
  }
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    return { ok: false, reason: 'invalid' }
  }

  let claims: unknown
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      raw.subarray(0, IV_BYTES),
    )
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
    const plaintext = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
    claims = JSON.parse(plaintext)
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
