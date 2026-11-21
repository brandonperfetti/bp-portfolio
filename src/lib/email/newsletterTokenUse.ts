import { createHash } from 'node:crypto'

import { Redis } from '@upstash/redis'

import { CONFIRM_TOKEN_TTL_SECONDS } from '@/lib/email/newsletterConfirmToken'

/** Whether a confirmation token was free to use, or already used. */
export type TokenClaim = 'claimed' | 'used'

/** Fallback store outside production, per instance: token key → expiry (ms). */
const memoryUsed = new Map<string, number>()

function keyFor(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex').slice(0, 32)
  return `newsletter:confirm-used:${digest}`
}

function store(): Redis | null {
  return process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null
}

/**
 * Mark a confirmation token used, once.
 *
 * @param token - A token that already verified.
 * @returns `claimed` the first time, `used` after.
 * @throws When the store fails; the caller answers 503 and joins no one.
 *
 * @remarks **Why single use.** A token stays valid for three days. Without
 * this, a reader who confirmed and then unsubscribed could be put back on
 * the list by pressing the old link again (CodeRabbit stand-in, #411), and
 * an address joins only when its owner asks to, which an old link is not.
 * The key is a digest of the token, so the store holds no address, and it
 * expires with the token. Upstash Redis when configured, the store the rate
 * limiter uses; otherwise, outside production only, a per-instance map. In
 * production without Upstash it throws, so no link confirms on a store that
 * cannot hold single use.
 */
export async function claimConfirmToken(token: string): Promise<TokenClaim> {
  const key = keyFor(token)
  const redis = store()
  if (redis) {
    const set = await redis.set(key, 1, {
      nx: true,
      ex: CONFIRM_TOKEN_TTL_SECONDS,
    })
    return set === 'OK' ? 'claimed' : 'used'
  }
  if (process.env.NODE_ENV === 'production') {
    // A per-instance map forgets a claim on every other instance and on
    // restart, so in production it would let an old link re-subscribe a
    // reader who unsubscribed. Fail closed instead: the route answers 503.
    throw new Error('Upstash is not configured; cannot claim a link once')
  }
  const now = Date.now()
  const expires = memoryUsed.get(key)
  if (expires !== undefined && expires > now) return 'used'
  memoryUsed.set(key, now + CONFIRM_TOKEN_TTL_SECONDS * 1000)
  return 'claimed'
}

/**
 * Free a claimed token again, after the join it was claimed for failed, so
 * the reader can retry the same link.
 *
 * @param token - The token {@link claimConfirmToken} claimed.
 *
 * @remarks Best effort: if this fails too, the link stays used and the
 * reader signs up again for a new one, which is safe.
 */
export async function releaseConfirmToken(token: string): Promise<void> {
  const key = keyFor(token)
  const redis = store()
  try {
    if (redis) await redis.del(key)
    else memoryUsed.delete(key)
  } catch {
    // Left used; see remarks.
  }
}
