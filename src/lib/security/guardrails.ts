type RateBucket = {
  count: number
  resetAt: number
  touchedAt: number
}

type DailyBucket = {
  count: number
  dayKey: string
  touchedAt: number
}

export type GuardrailStores = {
  rateBuckets: Map<string, RateBucket>
  dailyBuckets: Map<string, DailyBucket>
}

const globalForGuardrails = globalThis as typeof globalThis & {
  __bpHermesGuardrails?: GuardrailStores
}

let injectedGuardrailStores: GuardrailStores | null = null

/**
 * Injects or clears custom guardrail stores for rate/daily counters.
 *
 * @param store Custom stores to use globally, or `null` to clear and fall back
 * to lazily created in-memory stores.
 *
 * Side effects:
 * - Mutates module singleton (`injectedGuardrailStores`).
 * - Mutates global fallback holder (`globalForGuardrails.__bpHermesGuardrails`).
 */
export function setGuardrailStores(store: GuardrailStores | null) {
  injectedGuardrailStores = store
  if (store) {
    globalForGuardrails.__bpHermesGuardrails = store
    return
  }
  delete globalForGuardrails.__bpHermesGuardrails
}

/**
 * Returns active guardrail stores for rate/daily counters.
 *
 * Prefers injected stores (for tests/custom backends), otherwise returns a
 * lazily initialized in-memory fallback.
 *
 * @returns Guardrail stores with rate and daily bucket maps.
 */
export function getStores(): GuardrailStores {
  if (injectedGuardrailStores) {
    return injectedGuardrailStores
  }

  if (!globalForGuardrails.__bpHermesGuardrails) {
    // TODO(hermes-guardrails): Replace in-memory buckets with a distributed
    // store (e.g., Redis/Upstash) for stable limits across serverless restarts.
    globalForGuardrails.__bpHermesGuardrails = {
      rateBuckets: new Map<string, RateBucket>(),
      dailyBuckets: new Map<string, DailyBucket>(),
    }
  }

  return globalForGuardrails.__bpHermesGuardrails
}

function getSiteHosts() {
  const hosts = new Set(['localhost', 'localhost:3000', '127.0.0.1'])
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    try {
      hosts.add(new URL(siteUrl).host)
    } catch {
      // Ignore malformed NEXT_PUBLIC_SITE_URL and keep local hosts.
    }
  }
  return hosts
}

function toBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function toPositiveInt(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, maximum)
}

function getDayKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

function getGuardrailMaxEntries() {
  return toPositiveInt(process.env.HERMES_GUARDRAILS_MAX_BUCKETS, 5000, 50000)
}

function getGuardrailBucketTtlMs() {
  return toPositiveInt(
    process.env.HERMES_GUARDRAILS_BUCKET_TTL_MS,
    24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
  )
}

function getGuardrailPruneIntervalMs() {
  return toPositiveInt(
    process.env.HERMES_GUARDRAILS_PRUNE_INTERVAL_MS,
    60_000,
    60 * 60 * 1000,
  )
}

function pruneMapByTtlAndCap<T extends { touchedAt: number }>(
  map: Map<string, T>,
  nowMs: number,
  ttlMs: number,
  maxEntries: number,
) {
  for (const [key, bucket] of map) {
    if (nowMs - bucket.touchedAt > ttlMs) {
      map.delete(key)
    }
  }

  if (map.size <= maxEntries) {
    return
  }

  const overflow = map.size - maxEntries
  const oldest = Array.from(map.entries())
    .sort((a, b) => a[1].touchedAt - b[1].touchedAt)
    .slice(0, overflow)

  for (const [key] of oldest) {
    map.delete(key)
  }
}

let lastGuardrailPruneAt = 0

function pruneGuardrailBuckets(nowMs = Date.now()) {
  const { rateBuckets, dailyBuckets } = getStores()
  const ttlMs = getGuardrailBucketTtlMs()
  const maxEntries = getGuardrailMaxEntries()
  const intervalMs = getGuardrailPruneIntervalMs()
  const shouldPruneByTime = nowMs - lastGuardrailPruneAt >= intervalMs
  const shouldPruneBySize =
    rateBuckets.size > maxEntries || dailyBuckets.size > maxEntries

  if (!shouldPruneByTime && !shouldPruneBySize) {
    return
  }

  pruneMapByTtlAndCap(rateBuckets, nowMs, ttlMs, maxEntries)
  pruneMapByTtlAndCap(dailyBuckets, nowMs, ttlMs, maxEntries)
  lastGuardrailPruneAt = nowMs
}

/**
 * Resolves a best-effort client IP from proxy headers.
 *
 * @param request Incoming HTTP request.
 * @returns First forwarded/real IP, or `'unknown'` when unavailable.
 */
export function getRequestClientIp(request: Request) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const candidate = xff.split(',')[0]?.trim()
    if (candidate) return candidate
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'unknown'
}

/**
 * Validates request source host against trusted site hosts.
 *
 * Requires at least one of `Origin` or `Referer` headers to be present and
 * parseable to an allowed host (localhost + `NEXT_PUBLIC_SITE_URL` host).
 *
 * @param request Incoming HTTP request.
 * @returns `true` when source is allowed; otherwise `false`.
 */
export function isAllowedRequestSource(request: Request) {
  const hosts = getSiteHosts()

  const origin = request.headers.get('origin')
  let originValid = false
  if (origin) {
    try {
      originValid = hosts.has(new URL(origin).host)
    } catch {
      originValid = false
    }
  }

  const referer = request.headers.get('referer')
  let refererValid = false
  if (referer) {
    try {
      refererValid = hosts.has(new URL(referer).host)
    } catch {
      refererValid = false
    }
  }

  // Require at least one source header to be present and valid.
  if (!origin && !referer) {
    return false
  }

  return originValid || refererValid
}

/**
 * Applies fixed-window per-key rate limiting.
 *
 * @param options Rate-limit inputs (`key`, `limit`, `windowMs`, optional `now` override).
 * @returns Allow/remaining/reset metadata for caller response handling.
 *
 * Side effects:
 * - Updates guardrail bucket maps in active store.
 * - Prunes stale/overflow entries before applying counters.
 */
export function applyRateLimit(options: {
  key: string
  limit: number
  windowMs: number
  now?: number
}) {
  const { key, limit, windowMs } = options
  const now = options.now ?? Date.now()
  pruneGuardrailBuckets(now)
  const { rateBuckets } = getStores()
  const current = rateBuckets.get(key)

  if (!current || now >= current.resetAt) {
    const next: RateBucket = {
      count: 1,
      resetAt: now + windowMs,
      touchedAt: now,
    }
    rateBuckets.set(key, next)
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt: next.resetAt,
    }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    }
  }

  current.count += 1
  current.touchedAt = now
  rateBuckets.set(key, current)
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  }
}

/**
 * Applies per-day quota counting for a given key.
 *
 * @param options Daily quota inputs (`key`, `limit`, optional `now` override).
 * @returns Allow/remaining metadata; `limit <= 0` is treated as unlimited.
 *
 * Side effects:
 * - Updates daily bucket counters in active store.
 * - Prunes stale/overflow entries before applying counters.
 */
export function applyDailyQuota(options: {
  key: string
  limit: number
  now?: Date
}) {
  const { key, limit } = options
  if (limit <= 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY }
  }

  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  pruneGuardrailBuckets(nowMs)
  const dayKey = getDayKey(now)
  const { dailyBuckets } = getStores()
  const current = dailyBuckets.get(key)

  if (!current || current.dayKey !== dayKey) {
    dailyBuckets.set(key, { count: 1, dayKey, touchedAt: nowMs })
    return { allowed: true, remaining: Math.max(0, limit - 1) }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  current.count += 1
  current.touchedAt = nowMs
  dailyBuckets.set(key, current)
  return { allowed: true, remaining: Math.max(0, limit - current.count) }
}

/**
 * Resolves normalized public-endpoint security limits from environment.
 *
 * @returns Effective rate/quota and payload limits plus endpoint enabled flags.
 */
export function getSecurityLimits() {
  const chatRatePerMinute = toPositiveInt(
    process.env.HERMES_CHAT_RATE_LIMIT_PER_MINUTE,
    10,
    200,
  )
  const mailingListRatePerMinute = toPositiveInt(
    process.env.HERMES_MAILINGLIST_RATE_LIMIT_PER_MINUTE,
    chatRatePerMinute,
    200,
  )

  return {
    chatRatePerMinute,
    mailingListRatePerMinute,
    imageRatePerMinute: toPositiveInt(
      process.env.HERMES_IMAGE_RATE_LIMIT_PER_MINUTE,
      2,
      100,
    ),
    maxMessageChars: toPositiveInt(
      process.env.HERMES_MAX_MESSAGE_CHARS,
      1500,
      10000,
    ),
    maxMessages: toPositiveInt(process.env.HERMES_MAX_MESSAGES, 12, 100),
    maxCompletionTokens: toPositiveInt(
      process.env.HERMES_MAX_COMPLETION_TOKENS,
      700,
      8000,
    ),
    imageDailyLimit: toPositiveInt(
      process.env.HERMES_IMAGE_DAILY_LIMIT,
      0,
      10000,
    ),
    publicChatEnabled: !toBoolean(process.env.HERMES_DISABLE_CHAT, false),
    publicImageEnabled: !toBoolean(process.env.HERMES_DISABLE_IMAGE, false),
  }
}

/**
 * Verifies a Cloudflare Turnstile token when configured.
 *
 * @param options Verification inputs (`token`, optional `ip`).
 * @returns `{ required: false, ok: true }` when Turnstile is disabled,
 * otherwise `{ required: true, ok }` based on verification result.
 *
 * Side effects:
 * - Performs network I/O to Cloudflare Turnstile verification API.
 * - Treats transport/timeouts/non-200 responses as verification failure.
 */
export async function verifyRequestTurnstileToken(options: {
  token: string
  ip?: string
}) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    return { required: false, ok: true as const }
  }

  const token = options.token?.trim()
  if (!token) {
    return { required: true, ok: false as const }
  }

  const payload = new URLSearchParams()
  payload.set('secret', secret)
  payload.set('response', token)
  if (options.ip) {
    payload.set('remoteip', options.ip)
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
        signal: controller.signal,
      },
    ).finally(() => {
      clearTimeout(timeoutId)
    })

    if (!response.ok) {
      return { required: true, ok: false as const }
    }

    const json = (await response.json()) as { success?: boolean }
    return { required: true, ok: Boolean(json.success) as boolean }
  } catch {
    return { required: true, ok: false as const }
  }
}
