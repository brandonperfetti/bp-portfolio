import { convertToModelMessages, streamText, validateUIMessages } from 'ai'
import * as z from 'zod'

import { getCorvusModel, CORVUS_SYSTEM_PROMPT } from '@/lib/ai/corvus'
import { getViewer } from '@/lib/auth/getViewer'
import {
  getAnonFreeMessageLimit,
  getAuthedChatDailyQuota,
  getAuthedChatRatePerMinute,
  anonIpKeyDigest,
  incrementAnonFreeMessageCount,
  peekAnonFreeMessageCount,
} from '@/lib/security/chatGate'
import {
  getRequestClientIp,
  getSecurityLimits,
  isAllowedRequestSource,
  verifyRequestTurnstileToken,
} from '@/lib/security/guardrails'
import { checkChatLimits } from '@/lib/security/limiter'

export const maxDuration = 60

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(60),
})

/**
 * Machine-readable code the client matches on to render the sign-in prompt
 * instead of a generic error (see `CorvusChat.tsx`'s `isSignInRequiredError`).
 */
const SIGN_IN_REQUIRED_CODE = 'sign_in_required'

/**
 * Corvus chat endpoint on the Vercel AI SDK (replaces v3's hand-rolled
 * OpenAI NDJSON streaming).
 *
 * @remarks Security invariants (§9): the system prompt is server-enforced and
 * client-supplied system messages are stripped; input is Zod-validated;
 * limits come from a shared Redis store in staging/prod. Provider keys never
 * reach the client.
 *
 * @remarks Auth soft-gate (#74, folds #18): anonymous visitors get a small
 * cumulative free taste (`getAnonFreeMessageLimit()`, default 3 messages,
 * distributed via Upstash — see `@/lib/security/chatGate`); the (N+1)th
 * anonymous request is rejected here with a `sign_in_required` JSON body
 * BEFORE `streamText` ever runs, never as a stream chunk. Signed-in users
 * skip the free-message gate entirely and are instead keyed by `userId` (not
 * IP) in the existing `checkChatLimits` abuse limiter, at a higher ceiling —
 * every decision is made from server-resolved state (Clerk session, trusted
 * client IP), never from anything in the request body, so a crafted payload
 * cannot claim a lower message count or a fake identity to bypass either
 * gate.
 */
export async function POST(req: Request) {
  if (process.env.CORVUS_DISABLE_CHAT === 'true') {
    return Response.json(
      { error: 'Chat is temporarily disabled.' },
      { status: 503 },
    )
  }

  if (!isAllowedRequestSource(req)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limits = getSecurityLimits()
  const ip = getRequestClientIp(req)
  const viewer = await getViewer()

  // Abuse limiter (unchanged mechanism, `checkChatLimits`): signed-in
  // requests are keyed by userId at a higher ceiling instead of sharing an
  // IP-keyed bucket with every other visitor behind the same NAT/proxy.
  const authedViewer =
    viewer.isAuthenticated && viewer.userId ? viewer.userId : null
  // Anonymous limiter keys carry an HMAC digest of the IP, never the raw
  // address — Redis retains no personal identifier (chatGate hashes its own
  // keys the same way).
  const limiterKey = authedViewer
    ? `user:${authedViewer}`
    : `ip:${anonIpKeyDigest(ip)}`
  const limiterPerMinute = authedViewer
    ? getAuthedChatRatePerMinute()
    : limits.chatRatePerMinute
  const limiterPerDay = authedViewer
    ? getAuthedChatDailyQuota()
    : Number(process.env.CORVUS_CHAT_DAILY_QUOTA) || 0

  const limit = await checkChatLimits(
    limiterKey,
    limiterPerMinute,
    limiterPerDay,
  )
  if (!limit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((limit.resetAt - Date.now()) / 1000),
    )
    return Response.json(
      { error: 'Rate limit exceeded. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit.limit),
          'X-RateLimit-Remaining': String(limit.remaining),
          'X-RateLimit-Reset': String(Math.ceil(limit.resetAt / 1000)),
        },
      },
    )
  }

  // Anon free-message gate (#74, folds #18): a CUMULATIVE per-IP count,
  // distinct from the per-minute/per-day abuse limiter above. Checked early
  // (peek only, no increment) so an already-gated visitor doesn't pay for
  // body parsing or a Turnstile round-trip. Signed-in visitors never touch
  // this — they skip straight past.
  const isAnon = !authedViewer
  const anonFreeLimit = getAnonFreeMessageLimit()
  if (isAnon) {
    const freeCount = await peekAnonFreeMessageCount(ip)
    if (freeCount >= anonFreeLimit) {
      return Response.json(
        {
          error:
            "You've used your free Corvus messages — sign in to keep chatting.",
          code: SIGN_IN_REQUIRED_CODE,
        },
        { status: 401 },
      )
    }
  }

  let raw: unknown
  let parsedBody: z.infer<typeof bodySchema>
  try {
    raw = await req.json()
    parsedBody = bodySchema.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // Bot gate behind its own arm switch (Turnstile rollout decision,
  // 2026-08-10): the client flow ships wired but chat only ENFORCES when
  // TURNSTILE_PROTECT_CHAT === 'true' alongside the secret. Rationale:
  // chat's worst case is already bounded by per-IP + daily limits and
  // token ceilings, while Turnstile's failure mode (privacy blockers
  // eating the script) would break the site's signature feature for real
  // visitors — so enforcement waits for observed abuse, one env flip away.
  // Keep TURNSTILE_PROTECT_CHAT and NEXT_PUBLIC_TURNSTILE_PROTECT_CHAT in
  // lockstep: server-on/client-off 403s every message.
  if (process.env.TURNSTILE_PROTECT_CHAT === 'true') {
    const token = (raw as { turnstileToken?: unknown })?.turnstileToken
    const turnstile = await verifyRequestTurnstileToken({
      token: typeof token === 'string' ? token : '',
      ip,
    })
    if (!turnstile.ok) {
      return Response.json(
        { error: 'Verification failed. Please refresh and try again.' },
        { status: 403 },
      )
    }
  }

  let messages
  try {
    messages = await validateUIMessages({ messages: parsedBody.messages })
  } catch {
    return Response.json({ error: 'Invalid message format.' }, { status: 400 })
  }

  // Never trust client roles: drop any system messages before the model call.
  const userFacing = messages.filter((m) => m.role !== 'system')

  // Enforce the configured conversation-size limits (fresh-eyes review
  // 2026-08, finding m2 — these env knobs existed but were never read):
  // cap the window to the most recent maxMessages, reject oversized
  // individual messages, and use the tunable completion-token ceiling.
  const windowed = userFacing.slice(-limits.maxMessages)
  const oversized = windowed.some((m) =>
    m.parts.some(
      (part) =>
        part.type === 'text' && part.text.length > limits.maxMessageChars,
    ),
  )
  if (oversized) {
    return Response.json(
      {
        error: `Messages are limited to ${limits.maxMessageChars} characters.`,
      },
      { status: 413 },
    )
  }

  // Every other guard has passed and we're committed to streaming — this is
  // the point at which an anon request actually spends one of its free
  // messages (never on a request that was going to be rejected anyway).
  if (isAnon) {
    await incrementAnonFreeMessageCount(ip)
  }

  const result = streamText({
    model: getCorvusModel(),
    system: CORVUS_SYSTEM_PROMPT,
    messages: await convertToModelMessages(windowed),
    maxOutputTokens: limits.maxCompletionTokens,
  })

  return result.toUIMessageStreamResponse()
}
