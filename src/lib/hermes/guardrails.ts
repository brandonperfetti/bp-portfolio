type RateBucket = {
  count: number
  resetAt: number
}

type DailyBucket = {
  count: number
  dayKey: string
}

export type GuardrailStores = {
  rateBuckets: Map<string, RateBucket>
  dailyBuckets: Map<string, DailyBucket>
}

const globalForGuardrails = globalThis as typeof globalThis & {
  __bpHermesGuardrails?: GuardrailStores
}

let injectedGuardrailStores: GuardrailStores | null = null

export function setGuardrailStores(store: GuardrailStores | null) {
  injectedGuardrailStores = store
  if (store) {
    globalForGuardrails.__bpHermesGuardrails = store
  }
}

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

export function getHermesClientIp(request: Request) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const candidate = xff.split(',')[0]?.trim()
    if (candidate) return candidate
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'unknown'
}

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

export function applyHermesRateLimit(options: {
  key: string
  limit: number
  windowMs: number
  now?: number
}) {
  const { key, limit, windowMs } = options
  const now = options.now ?? Date.now()
  const { rateBuckets } = getStores()
  const current = rateBuckets.get(key)

  if (!current || now >= current.resetAt) {
    const next: RateBucket = { count: 1, resetAt: now + windowMs }
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
  rateBuckets.set(key, current)
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  }
}

export function applyHermesDailyQuota(options: {
  key: string
  limit: number
  now?: Date
}) {
  const { key, limit } = options
  if (limit <= 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY }
  }

  const now = options.now ?? new Date()
  const dayKey = getDayKey(now)
  const { dailyBuckets } = getStores()
  const current = dailyBuckets.get(key)

  if (!current || current.dayKey !== dayKey) {
    dailyBuckets.set(key, { count: 1, dayKey })
    return { allowed: true, remaining: Math.max(0, limit - 1) }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  current.count += 1
  dailyBuckets.set(key, current)
  return { allowed: true, remaining: Math.max(0, limit - current.count) }
}

export function getHermesLimits() {
  return {
    chatRatePerMinute: toPositiveInt(
      process.env.HERMES_CHAT_RATE_LIMIT_PER_MINUTE,
      10,
      200,
    ),
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

export async function verifyTurnstileToken(options: {
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
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
      },
    )

    if (!response.ok) {
      return { required: true, ok: false as const }
    }

    const json = (await response.json()) as { success?: boolean }
    return { required: true, ok: Boolean(json.success) as boolean }
  } catch {
    return { required: true, ok: false as const }
  }
}
