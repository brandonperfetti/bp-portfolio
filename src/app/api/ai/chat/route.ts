import { convertToModelMessages, streamText, validateUIMessages } from 'ai'
import * as z from 'zod'

import { getHermesModel, HERMES_SYSTEM_PROMPT } from '@/lib/ai/hermes'
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
 * Hermes chat endpoint on the Vercel AI SDK (replaces v3's hand-rolled
 * OpenAI NDJSON streaming).
 *
 * @remarks Security invariants (§9): the system prompt is server-enforced and
 * client-supplied system messages are stripped; input is Zod-validated;
 * limits come from a shared Redis store in staging/prod. Provider keys never
 * reach the client.
 */
export async function POST(req: Request) {
  if (process.env.HERMES_DISABLE_CHAT === 'true') {
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
  const limit = await checkChatLimits(
    ip,
    limits.chatRatePerMinute,
    Number(process.env.HERMES_CHAT_DAILY_QUOTA) || 0,
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

  const result = streamText({
    model: getHermesModel(),
    system: HERMES_SYSTEM_PROMPT,
    messages: await convertToModelMessages(windowed),
    maxOutputTokens: limits.maxCompletionTokens,
  })

  return result.toUIMessageStreamResponse()
}
