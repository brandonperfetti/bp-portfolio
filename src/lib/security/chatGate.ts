import { createHmac } from 'node:crypto'

import { Redis } from '@upstash/redis'

/**
 * Anonymous free-message gate for Corvus chat (#74, folds #18).
 *
 * @remarks This is a CUMULATIVE per-IP counter — "how many free messages has
 * this visitor ever sent" — distinct from `checkChatLimits` in
 * `@/lib/security/limiter`, which is a per-minute/per-day RATE. Anonymous
 * visitors get a small free taste (default 3 messages, `CORVUS_ANON_FREE_MESSAGES`);
 * the (N+1)th request is rejected server-side with a sign-in-required
 * response instead of ever reaching the model. Signed-in users skip this
 * gate entirely and are keyed by `userId` in `checkChatLimits` instead, at a
 * higher ceiling (`CORVUS_CHAT_RATE_LIMIT_PER_MINUTE_AUTHED` /
 * `CORVUS_CHAT_DAILY_QUOTA_AUTHED`).
 *
 * Distributed via Upstash Redis (same backing store as `checkChatLimits`) so
 * the count holds across serverless instances; falls back to an in-memory,
 * per-instance `Map` in dev when Upstash isn't configured, mirroring the
 * fallback shape in `@/lib/security/guardrails`.
 */

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

// 30 days: long enough that a returning visitor on the same IP stays gated
// (the point of a "free taste," not an hourly reset), short enough that the
// Redis keyspace doesn't grow unboundedly from one-off visitors.
const FREE_MESSAGE_TTL_SECONDS = 30 * 24 * 60 * 60

let redisClient: Redis | null = null

function getRedis(): Redis | null {
  if (!hasUpstash) return null
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

/**
 * Stable digest of an anonymous visitor's IP, used as the storage identity
 * for every anon counter key (this gate's 30-day counter, and the route's
 * per-minute/daily limiter keys).
 *
 * @remarks Raw IPs are personal data and IPv4 space is small enough to
 * enumerate, so an unkeyed hash would be trivially reversible — this is an
 * HMAC-SHA256 keyed by `PAYLOAD_SECRET` (server-only, always set in
 * staging/prod), truncated to 32 hex chars. Redis therefore never stores a
 * raw client IP. The fixed dev pepper keeps the digest deterministic in
 * local dev/tests where `PAYLOAD_SECRET` may be unset; rotating
 * `PAYLOAD_SECRET` rotates the keyspace (counters reset), which is an
 * acceptable property for a free-taste counter and short-TTL rate limits.
 */
export function anonIpKeyDigest(ip: string): string {
  const secret = process.env.PAYLOAD_SECRET || 'bp-anon-ip-dev-pepper'
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32)
}

const anonFreeMessageRedisKey = (key: string) =>
  `chat:anon-free:${anonIpKeyDigest(key)}`

type AnonCountStore = Map<string, number>

const globalForChatGate = globalThis as typeof globalThis & {
  __bpAnonFreeCounts?: AnonCountStore
}

/**
 * Dev-only in-memory fallback store for the anon free-message counter.
 *
 * @remarks Per-instance only, same caveat as the guardrails.ts fallback:
 * multiple warm instances would each track their own count, and a cold
 * start resets to zero. Acceptable for local dev; production must configure
 * Upstash (the module-scope warning below fires once per instance).
 */
function getMemoryStore(): AnonCountStore {
  if (!globalForChatGate.__bpAnonFreeCounts) {
    globalForChatGate.__bpAnonFreeCounts = new Map<string, number>()
  }
  return globalForChatGate.__bpAnonFreeCounts
}

if (!hasUpstash && process.env.NODE_ENV === 'production') {
  console.error(
    '[security/chatGate] UPSTASH_REDIS_REST_URL/TOKEN missing in production — ' +
      'the anon free-message gate is degraded to per-instance memory. Configure Upstash.',
  )
}

function toPositiveIntEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

/** Anonymous free-message ceiling (`CORVUS_ANON_FREE_MESSAGES`, default 3). */
export function getAnonFreeMessageLimit(): number {
  return toPositiveIntEnv(process.env.CORVUS_ANON_FREE_MESSAGES, 3)
}

/**
 * Signed-in per-minute chat rate ceiling
 * (`CORVUS_CHAT_RATE_LIMIT_PER_MINUTE_AUTHED`, default 30 — well above the
 * anonymous default of 10 since authed traffic is keyed by `userId`, not a
 * possibly-shared IP).
 */
export function getAuthedChatRatePerMinute(): number {
  return toPositiveIntEnv(
    process.env.CORVUS_CHAT_RATE_LIMIT_PER_MINUTE_AUTHED,
    30,
  )
}

/**
 * Signed-in daily chat quota (`CORVUS_CHAT_DAILY_QUOTA_AUTHED`, default
 * 1000; 0 or negative disables the daily check, same convention as
 * `CORVUS_CHAT_DAILY_QUOTA`).
 *
 * @remarks `Number(x) || 1000` would silently turn an explicit `'0'`
 * (disable) into `1000` (default), since `0` is falsy — that was the
 * orchestrator's finding-1 bug. Parse explicitly and only fall back to the
 * default when the env var is unset/blank/non-numeric, so `0` and negative
 * values pass through as-is for `checkChatLimits` (which treats
 * `perDay <= 0` as "no daily check") to actually disable the quota.
 */
export function getAuthedChatDailyQuota(): number {
  const raw = process.env.CORVUS_CHAT_DAILY_QUOTA_AUTHED
  if (!raw) return 1000
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 1000
}

/**
 * Reads the current free-message count for an anonymous key WITHOUT
 * incrementing it.
 *
 * @param key - Server-trusted identity for the anon visitor (the platform
 * client IP from {@link getRequestClientIp} — never a client-supplied
 * value).
 * @returns The current count, 0 if the key has never been seen.
 *
 * @remarks Callers use this to decide whether a request should be gated
 * BEFORE doing any other work (body parsing, Turnstile) — a request that's
 * already over the limit shouldn't cost anything beyond this one read.
 */
export async function peekAnonFreeMessageCount(key: string): Promise<number> {
  const redis = getRedis()
  if (redis) {
    const value = await redis.get<number>(anonFreeMessageRedisKey(key))
    return typeof value === 'number' ? value : 0
  }
  return getMemoryStore().get(anonIpKeyDigest(key)) ?? 0
}

/**
 * Increments the free-message count for an anonymous key and returns the
 * new count, refreshing a 30-day TTL on first write.
 *
 * @param key - Same server-trusted IP identity as {@link peekAnonFreeMessageCount}.
 * @returns The count AFTER incrementing.
 *
 * @remarks Callers should only call this once a request has cleared every
 * other guard and is actually about to stream a response — never on a
 * request that's going to be rejected anyway (a rejected request must not
 * consume part of the visitor's free taste). Upstash `INCR` is atomic, but
 * the peek-then-increment pair across the two calls is not: under a very
 * tight concurrent burst from the same IP, one or two extra messages could
 * slip past the boundary before the count catches up. That's an acceptable
 * trade for a "free taste" counter (no security property depends on the
 * exact boundary), unlike the abuse limiter in `checkChatLimits`, which
 * uses Upstash's atomic sliding/fixed-window primitives directly.
 */
export async function incrementAnonFreeMessageCount(
  key: string,
): Promise<number> {
  const redis = getRedis()
  if (redis) {
    const redisKey = anonFreeMessageRedisKey(key)
    const next = await redis.incr(redisKey)
    if (next === 1) {
      await redis.expire(redisKey, FREE_MESSAGE_TTL_SECONDS)
    }
    return next
  }
  const store = getMemoryStore()
  const digest = anonIpKeyDigest(key)
  const next = (store.get(digest) ?? 0) + 1
  store.set(digest, next)
  return next
}

/**
 * Test-only escape hatch to reset the in-memory fallback store between
 * tests (the Upstash-backed path is exercised via a mocked `@upstash/redis`
 * client instead, which each test constructs fresh).
 */
export function __resetAnonFreeMessageMemoryStoreForTests() {
  globalForChatGate.__bpAnonFreeCounts = new Map<string, number>()
}
