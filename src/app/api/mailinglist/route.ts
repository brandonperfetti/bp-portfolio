import { NextResponse } from 'next/server'
import {
  applyRateLimit,
  getRequestClientIp,
  getSecurityLimits,
  verifyRequestTurnstileToken,
} from '@/lib/security/guardrails'

interface SendGridError {
  message: string
  field?: string
  help?: string
}

/**
 * Subscribes a user email to the configured SendGrid marketing list.
 *
 * Expected request body:
 * - `{ email: string, turnstileToken?: string }`, or
 * - `{ mail: string, turnstileToken?: string }`
 *
 * Email is normalized via `trim().toLowerCase()` before submission.
 *
 * @param req Incoming request with JSON payload containing email/mail.
 * @returns JSON response with:
 * - `200` on successful subscription (`{ message }`)
 * - `400` for invalid JSON or missing email
 * - `403` when Turnstile verification fails
 * - `429` when request rate limit is exceeded
 * - `500` for SendGrid/configuration failures (`{ message, error? }`)
 */
export async function PUT(req: Request) {
  const limits = getSecurityLimits()
  const clientIp = getRequestClientIp(req)
  const rate = applyRateLimit({
    key: `hermes:mailinglist:${clientIp}`,
    limit: limits.mailingListRatePerMinute,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rate.resetAt - Date.now()) / 1000),
    )
    return NextResponse.json(
      { message: 'Too many subscribe attempts. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limits.mailingListRatePerMinute),
          'X-RateLimit-Remaining': String(rate.remaining),
          'X-RateLimit-Reset': String(Math.floor(rate.resetAt / 1000)),
        },
      },
    )
  }

  const apiKey = process.env.SENDGRID_API_KEY
  const listId = process.env.SENDGRID_MAILING_ID ?? process.env.SENDGRID_LIST_ID
  const isEuResidency = process.env.SENDGRID_DATA_RESIDENCY === 'eu'
  const apiBase = isEuResidency
    ? 'https://api.eu.sendgrid.com'
    : 'https://api.sendgrid.com'

  if (!apiKey || !listId) {
    return NextResponse.json(
      {
        message:
          'SendGrid mailing list environment variables are not configured.',
        error:
          'Expected SENDGRID_API_KEY and SENDGRID_MAILING_ID (or SENDGRID_LIST_ID).',
      },
      { status: 500 },
    )
  }

  let parsedBody: unknown
  try {
    parsedBody = await req.json()
  } catch (error) {
    console.error('[api/mailinglist] Invalid JSON body', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ message: 'Invalid JSON body.' }, { status: 400 })
  }

  const body =
    parsedBody && typeof parsedBody === 'object'
      ? (parsedBody as {
          mail?: unknown
          email?: unknown
          turnstileToken?: unknown
        })
      : {}

  const turnstile = await verifyRequestTurnstileToken({
    token: String(body.turnstileToken ?? ''),
    ip: clientIp,
  })
  if (!turnstile.ok) {
    return NextResponse.json(
      {
        message: turnstile.required
          ? 'Security challenge failed. Please refresh and try again.'
          : 'Unable to verify request.',
      },
      { status: 403 },
    )
  }

  const email = String(body.mail ?? body.email ?? '')
    .trim()
    .toLowerCase()

  if (!email) {
    return NextResponse.json({ message: 'Email is required.' }, { status: 400 })
  }

  try {
    const response = await fetch(`${apiBase}/v3/marketing/contacts`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contacts: [{ email }], list_ids: [listId] }),
    })

    const payload = await response.json()

    if (!response.ok || payload.errors) {
      return NextResponse.json(
        {
          message: 'Unable to subscribe right now. Please try again.',
          error: payload.errors
            ?.map((entry: SendGridError) =>
              [
                entry.message,
                entry.field ? `field: ${entry.field}` : '',
                entry.help,
              ]
                .filter(Boolean)
                .join(' | '),
            )
            .join(', '),
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      message: 'Your email has been added to the mailing list. Welcome.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Unable to subscribe right now. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
