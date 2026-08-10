import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import { applyDailyQuota, applyRateLimit } from '@/lib/security/guardrails'

export type LimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
}

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

// The in-memory fallback is dev-only by design: per-instance buckets
// multiply limits by warm-instance count and reset on cold start. A prod
// deploy without Upstash should be LOUD about running degraded (fresh-eyes
// review 2026-08, finding m3) — one warning per instance, not per request.
let warnedDegraded = false
if (!hasUpstash && process.env.NODE_ENV === 'production') {
  if (!warnedDegraded) {
    warnedDegraded = true
    console.error(
      '[security/limiter] UPSTASH_REDIS_REST_URL/TOKEN missing in production — ' +
        'rate limiting is degraded to per-instance memory. Configure Upstash.',
    )
  }
}

let minuteLimiter: Ratelimit | null = null
let dailyLimiter: Ratelimit | null = null

const getLimiters = (perMinute: number, perDay: number) => {
  if (!hasUpstash) return null
  if (!minuteLimiter || !dailyLimiter) {
    const redis = Redis.fromEnv()
    minuteLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(perMinute, '60 s'),
      prefix: 'hermes:rl',
    })
    dailyLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(perDay, '86400 s'),
      prefix: 'hermes:daily',
    })
  }
  return { minuteLimiter, dailyLimiter }
}

/**
 * Global chat rate limiting: Upstash Redis when configured (limits hold
 * across serverless instances — closes the v3 in-memory TODO), otherwise the
 * v3 in-memory buckets as a dev-only fallback.
 *
 * @param key - Client key (IP-derived) to bucket by.
 * @param perMinute - Fixed-window per-minute request limit.
 * @param perDay - Daily quota (0 or negative disables the daily check).
 */
export async function checkChatLimits(
  key: string,
  perMinute: number,
  perDay: number,
): Promise<LimitResult> {
  const limiters = getLimiters(perMinute, perDay)

  if (limiters) {
    const minute = await limiters.minuteLimiter!.limit(key)
    if (!minute.success) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: minute.reset,
        limit: perMinute,
      }
    }
    if (perDay > 0) {
      const daily = await limiters.dailyLimiter!.limit(key)
      if (!daily.success) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: daily.reset,
          limit: perDay,
        }
      }
      return {
        allowed: true,
        remaining: Math.min(minute.remaining, daily.remaining),
        resetAt: minute.reset,
        limit: perMinute,
      }
    }
    return {
      allowed: true,
      remaining: minute.remaining,
      resetAt: minute.reset,
      limit: perMinute,
    }
  }

  // Dev fallback: v3 in-memory buckets (per-instance only).
  const minute = applyRateLimit({
    key: `chat:${key}`,
    limit: perMinute,
    windowMs: 60_000,
  })
  if (!minute.allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: minute.resetAt,
      limit: perMinute,
    }
  }
  const daily = applyDailyQuota({ key: `chat:${key}`, limit: perDay })
  if (!daily.allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: minute.resetAt,
      limit: perDay,
    }
  }
  return {
    allowed: true,
    remaining: minute.remaining,
    resetAt: minute.resetAt,
    limit: perMinute,
  }
}
