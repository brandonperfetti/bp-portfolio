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
  __bpGuardrails?: GuardrailStores
}

let injectedGuardrailStores: GuardrailStores | null = null

/**
 * Injects or clears custom guardrail stores for rate/daily counters.
 *
 * @param store - Custom stores to use globally, or `null` to clear and fall back
 * to lazily created in-memory stores.
 *
 * Side effects:
 * - Mutates module singleton (`injectedGuardrailStores`).
 * - Mutates global fallback holder (`globalForGuardrails.__bpGuardrails`).
 */
export function setGuardrailStores(store: GuardrailStores | null) {
  injectedGuardrailStores = store
  if (store) {
    globalForGuardrails.__bpGuardrails = store
    return
  }
  delete globalForGuardrails.__bpGuardrails
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

  if (!globalForGuardrails.__bpGuardrails) {
    // Stale-TODO refresh (#74): this used to read "replace with a
    // distributed store" — that's already done. `checkChatLimits`
    // (@/lib/security/limiter) is Upstash-backed whenever
    // UPSTASH_REDIS_REST_URL/TOKEN are set; `applyRateLimit`/
    // `applyDailyQuota` below are its INTENTIONAL dev-only, per-instance
    // fallback, used only when Upstash isn't configured. The #74 anon
    // free-message gate (@/lib/security/chatGate) follows the same
    // Upstash-with-in-memory-dev-fallback shape.
    globalForGuardrails.__bpGuardrails = {
      rateBuckets: new Map<string, RateBucket>(),
      dailyBuckets: new Map<string, DailyBucket>(),
    }
  }

  return globalForGuardrails.__bpGuardrails
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

/**
 * The reasoning-effort ladder the installed provider accepts.
 *
 * @remarks Copied from the provider, deliberately, and verified against it by
 * test rather than by memory: `@ai-sdk/openai@3.0.87`
 * `dist/index.d.ts:12` types the chat path's option as
 * `"none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`, and
 * `dist/index.mjs:693` is the same list as a `z.enum`. The Responses path
 * (the one Corvus runs on) types it loosely as `string`
 * (`dist/index.d.ts:1087`) and forwards whatever it is given as
 * `reasoning.effort` (`dist/index.mjs:5477-5482`), so nothing in the SDK
 * would reject a typo — OpenAI would, on every turn. This list is the guard
 * that stops a typo in an env var from being a production outage.
 * `src/lib/ai/corvus.test.ts` pins it against the installed provider.
 */
export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

/** One rung of {@link REASONING_EFFORTS}. */
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/**
 * The reasoning effort Corvus runs at when `AI_REASONING_EFFORT` is unset.
 *
 * @remarks `minimal`, decided by Brandon on 2026-09-11 (#138 option 2) from
 * three keyed probes. On the Responses API a reasoning model's hidden
 * reasoning is billed against the same `maxOutputTokens` allowance as the
 * visible answer, so at `maxCompletionTokens` = 1024 a turn that thinks hard
 * can finish `length` with half an answer or none.
 *
 * `[measured, keyed, 2026-09-11]` the numbers this value comes from:
 *
 * - effort unset (provider default), 1024 — **8 truncated attempts**, two
 *   `failOnTruncation` cases dead on both attempts, 2 `EvalOutputBudgetError`
 *   (CI on PR #234).
 * - `low` / 1024, full `eval:ci` — **2 truncated attempts**, both of them the
 *   safety-essay refusal, 1 `EvalOutputBudgetError`. Better, not clean.
 * - `minimal` / 1024, safety file — **4/4 no truncation**, 75%, **9.4s**.
 * - `low` / 2048, safety file — 4/4 no truncation, 75%, **29.7s**.
 *
 * `minimal` over a budget raise because the last two rows score the same and
 * `minimal` is ~3x faster on that file at a lower per-turn cost — the budget
 * (#138 option 1) stays where it is, unspent and available.
 *
 * Read by `scripts/eval-harness.test.ts` FROM THIS SOURCE, exactly as the
 * completion budget is, so the eval mirror and `.env.example` cannot drift
 * from it.
 */
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'minimal'

/**
 * Resolves an env string onto the reasoning-effort ladder.
 *
 * @param value - Raw env value, or `undefined` when unset.
 * @param fallback - Effort to use when unset or unrecognized.
 * @returns A value the provider accepts; never throws.
 *
 * Side effects:
 * - Logs one `console.warn` for an unrecognized value.
 *
 * @remarks Never throws, and that is the point: this runs on the chat
 * request path, and a fat-fingered env var must degrade to the default rather
 * than 500 every Corvus turn. The warn is how the mistake still gets noticed.
 */
function toReasoningEffort(
  value: string | undefined,
  fallback: ReasoningEffort,
): ReasoningEffort {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  if ((REASONING_EFFORTS as readonly string[]).includes(normalized)) {
    return normalized as ReasoningEffort
  }
  console.warn(
    `[corvus] ignoring AI_REASONING_EFFORT=${JSON.stringify(value)} — expected one of ${REASONING_EFFORTS.join(', ')}; using ${fallback}`,
  )
  return fallback
}

function getDayKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

function getGuardrailMaxEntries() {
  return toPositiveInt(process.env.CORVUS_GUARDRAILS_MAX_BUCKETS, 5000, 50000)
}

function getGuardrailBucketTtlMs() {
  return toPositiveInt(
    process.env.CORVUS_GUARDRAILS_BUCKET_TTL_MS,
    24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
  )
}

function getGuardrailPruneIntervalMs() {
  return toPositiveInt(
    process.env.CORVUS_GUARDRAILS_PRUNE_INTERVAL_MS,
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
 * Resolves the platform-trusted client IP from proxy headers.
 *
 * @remarks Trust order matters (fresh-eyes review 2026-08, finding M2): the
 * LEFTMOST `x-forwarded-for` entry is client-prependable, so keying rate
 * limits on it let an attacker mint a fresh per-IP bucket per request. On
 * Vercel the trustworthy values are `x-real-ip` (platform-set) and the
 * RIGHTMOST `x-forwarded-for` hop (platform-appended). We prefer
 * `x-real-ip`, fall back to the rightmost XFF entry, and never read the
 * leftmost.
 *
 * @param request - Incoming HTTP request.
 * @returns Platform-trusted client IP, or `'unknown'` when unavailable.
 */
export function getRequestClientIp(request: Request) {
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    // Scan right-to-left for the first NON-EMPTY hop: a trailing comma
    // (`"1.2.3.4,"`) previously yielded an empty rightmost entry and fell
    // through to the shared 'unknown' bucket (second-pass review
    // 2026-08-10 nit). Still never the leftmost unless it is the only hop.
    const hops = xff.split(',')
    for (let i = hops.length - 1; i >= 0; i--) {
      const candidate = hops[i]?.trim()
      if (candidate) return candidate
    }
  }
  return 'unknown'
}

/**
 * Validates request source host against trusted site hosts.
 *
 * Requires at least one of `Origin` or `Referer` headers to be present and
 * parseable to an allowed host: localhost, the `NEXT_PUBLIC_SITE_URL` host,
 * or the host serving THIS request (`x-forwarded-host`/`host`).
 *
 * @remarks The serving host must be allowed explicitly: staging/preview
 * deploys intentionally keep `NEXT_PUBLIC_SITE_URL` pointed at production
 * (SEO canonicals), so an env-only allowlist 403'd every same-origin chat
 * request on staging. Browsers set `Origin` themselves, so a cross-site
 * page still can't forge a match — this stays a CSRF guard, not less.
 *
 * @param request - Incoming HTTP request.
 * @returns `true` when source is allowed; otherwise `false`.
 */
export function isAllowedRequestSource(request: Request) {
  const hosts = getSiteHosts()

  // Same-origin requests are always acceptable, whatever domain this
  // deployment is being served from (staging, preview, production).
  const servingHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (servingHost) {
    hosts.add(servingHost.trim().toLowerCase())
  }

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
 * @param options - Rate-limit inputs (`key`, `limit`, `windowMs`, optional `now` override).
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
 * @param options - Daily quota inputs (`key`, `limit`, optional `now` override).
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
    process.env.CORVUS_CHAT_RATE_LIMIT_PER_MINUTE,
    10,
    200,
  )
  const mailingListRatePerMinute = toPositiveInt(
    process.env.CORVUS_MAILINGLIST_RATE_LIMIT_PER_MINUTE,
    chatRatePerMinute,
    200,
  )

  return {
    chatRatePerMinute,
    mailingListRatePerMinute,
    imageRatePerMinute: toPositiveInt(
      process.env.CORVUS_IMAGE_RATE_LIMIT_PER_MINUTE,
      2,
      100,
    ),
    maxMessageChars: toPositiveInt(
      process.env.CORVUS_MAX_MESSAGE_CHARS,
      1500,
      10000,
    ),
    maxMessages: toPositiveInt(process.env.CORVUS_MAX_MESSAGES, 12, 100),
    // CORVUS_MAX_COMPLETION_TOKENS is
    // honored as a one-release fallback (#77 rename), and
    // AI_MAX_COMPLETION_TOKENS is the env knob deploys actually set today
    // (.env.example) — honor it as the last fallback so enforcing this
    // limit doesn't silently shrink replies.
    maxCompletionTokens: toPositiveInt(
      process.env.CORVUS_MAX_COMPLETION_TOKENS ||
        process.env.AI_MAX_COMPLETION_TOKENS,
      1024,
      8000,
    ),
    // #138 option 2 (Brandon, 2026-09-11). Sits beside the completion budget
    // because it spends the same allowance: hidden reasoning tokens come out
    // of `maxCompletionTokens`. Applied only to a reasoning model, by
    // `corvusProviderOptions` (`src/lib/ai/corvus.ts`).
    reasoningEffort: toReasoningEffort(
      process.env.AI_REASONING_EFFORT,
      DEFAULT_REASONING_EFFORT,
    ),
    imageDailyLimit: toPositiveInt(
      process.env.CORVUS_IMAGE_DAILY_LIMIT,
      0,
      10000,
    ),
    publicChatEnabled: !toBoolean(process.env.CORVUS_DISABLE_CHAT, false),
    publicImageEnabled: !toBoolean(process.env.CORVUS_DISABLE_IMAGE, false),
  }
}

/**
 * Verifies a Cloudflare Turnstile token when configured.
 *
 * @param options - Verification inputs (`token`, optional `ip`).
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
