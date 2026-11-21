import { NextResponse } from 'next/server'

import { anonIpKeyDigest } from '@/lib/security/chatGate'
import {
  getRequestClientIp,
  getSecurityLimits,
  isAllowedRequestSource,
  verifyRequestTurnstileToken,
} from '@/lib/security/guardrails'
import { checkChatLimits, type LimitResult } from '@/lib/security/limiter'
import { reportLimiterOutage } from '@/lib/security/limiterOutage'

/**
 * The public forms that write through Resend from an anonymous visitor.
 * `newsletter-confirm` is the double opt-in confirmation (#407), with its
 * own limiter bucket.
 */
export type PublicFormSurface = 'contact' | 'newsletter' | 'newsletter-confirm'

/** Per-route switches for {@link guardPublicForm}. */
export type PublicFormGuardOptions = {
  /**
   * Run the Turnstile check (default `true`). The newsletter confirmation
   * turns it off: its request carries a signed token only the address's
   * owner received, so a bot check adds nothing the token does not.
   */
  turnstile?: boolean
}

/** What a guarded form says when one of the guards refuses a request. */
export type PublicFormMessages = {
  /** The 503 body when the rate-limit store is failing. */
  unavailable: string
  /** The 403 body when the Turnstile check fails. */
  verificationFailed: string
}

/** The guard either refused the request, with its response, or passed it. */
export type PublicFormGuardResult =
  | { ok: false; response: NextResponse }
  | { ok: true; ip: string; body: unknown }

/**
 * Run the guardrails every anonymous form that writes through Resend shares:
 * same-origin source, per-IP rate limit, Turnstile, in that order.
 *
 * @param req - The incoming request. Its JSON body is read here; callers use
 *   the returned `body` and must not read the request again.
 * @param surface - The form, which prefixes the limiter key and names the
 *   Sentry outage.
 * @param messages - The visitor-facing text for the 503 and the Turnstile 403.
 * @param options - Per-route switches; see {@link PublicFormGuardOptions}.
 * @returns A refusal carrying the response to send, or the client IP and the
 *   parsed body (`null` when it was not JSON) for the route to validate.
 *
 * @remarks Extracted from `/api/contact` when `/api/newsletter` became the
 * second form on this stack (#367), so the two cannot drift.
 *
 * - The limiter key carries `anonIpKeyDigest(ip)`, never the raw IP, so Redis
 *   keeps no personal identifier (#364). Each surface has its own bucket at
 *   the shared `mailingListRatePerMinute`.
 * - The limiter fails closed (#390): a store outage answers 503 and reports
 *   once to Sentry with the IP, digest and key redacted. Open, either form
 *   would be an unlimited writer into Resend, and Turnstile is not enforced
 *   on every deployment.
 * - Turnstile runs after the rate limit, so the verification API cannot be
 *   hammered through us, and is a no-op until `TURNSTILE_SECRET_KEY` is set.
 *   It is the one place the raw IP still goes, as Cloudflare's `remoteip`.
 */
export async function guardPublicForm(
  req: Request,
  surface: PublicFormSurface,
  messages: PublicFormMessages,
  options: PublicFormGuardOptions = {},
): Promise<PublicFormGuardResult> {
  if (!isAllowedRequestSource(req)) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    }
  }

  const limits = getSecurityLimits()
  const ip = getRequestClientIp(req)
  const ipDigest = anonIpKeyDigest(ip)
  const limiterKey = `${surface}:${ipDigest}`
  let limit: LimitResult
  try {
    limit = await checkChatLimits(
      limiterKey,
      limits.mailingListRatePerMinute,
      0,
    )
  } catch (error) {
    reportLimiterOutage(error, {
      surface,
      operation: 'checkChatLimits',
      redact: [ip, ipDigest, limiterKey],
    })
    return {
      ok: false,
      response: NextResponse.json(
        { message: messages.unavailable },
        { status: 503 },
      ),
    }
  }
  if (!limit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((limit.resetAt - Date.now()) / 1000),
    )
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      ),
    }
  }

  const body: unknown = await req.json().catch(() => null)
  if (options.turnstile === false) return { ok: true, ip, body }

  const token = (body as { turnstileToken?: unknown } | null)?.turnstileToken
  const turnstile = await verifyRequestTurnstileToken({
    token: typeof token === 'string' ? token : '',
    ip,
  })
  if (!turnstile.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: messages.verificationFailed },
        { status: 403 },
      ),
    }
  }

  return { ok: true, ip, body }
}
