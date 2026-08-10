import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import * as z from 'zod'

import {
  getRequestClientIp,
  getSecurityLimits,
  isAllowedRequestSource,
  verifyRequestTurnstileToken,
} from '@/lib/security/guardrails'
import { checkChatLimits } from '@/lib/security/limiter'

const bodySchema = z.object({
  fullname: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(5000),
})

/** Minimal HTML entity escape for user-supplied strings in the email body. */
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/**
 * Contact-form delivery via SendGrid.
 *
 * @remarks Hardened to the same guardrail stack as the Hermes chat route
 * (fresh-eyes review 2026-08, finding M1): same-origin source guard, per-IP
 * rate limiting (`mailingListRatePerMinute`), Zod validation with a real
 * email check, and HTML-escaped interpolation so user input cannot inject
 * markup into the notification email. Turnstile is enforced whenever
 * `TURNSTILE_SECRET_KEY` is set (the widget ships env-gated with the
 * matching `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); without keys the route
 * behaves exactly as before, so previews and local dev need no setup.
 */
export async function POST(req: Request) {
  const apiKey = process.env.SENDGRID_API_KEY
  const isEuResidency = process.env.SENDGRID_DATA_RESIDENCY === 'eu'
  if (!apiKey) {
    return NextResponse.json(
      { message: 'SENDGRID_API_KEY is not configured.' },
      { status: 500 },
    )
  }

  if (!isAllowedRequestSource(req)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const limits = getSecurityLimits()
  const ip = getRequestClientIp(req)
  const limit = await checkChatLimits(
    `contact:${ip}`,
    limits.mailingListRatePerMinute,
    0,
  )
  if (!limit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((limit.resetAt - Date.now()) / 1000),
    )
    return NextResponse.json(
      { message: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const raw: unknown = await req.json().catch(() => null)

  // Bot gate (review finding m4, wired 2026-08-10): verification is a
  // no-op until TURNSTILE_SECRET_KEY exists in the environment, then it
  // becomes mandatory. Runs after the rate limit so the verification API
  // can't itself be hammered through us.
  const turnstile = await verifyRequestTurnstileToken({
    token:
      typeof (raw as { turnstileToken?: unknown })?.turnstileToken === 'string'
        ? ((raw as { turnstileToken: string }).turnstileToken ?? '')
        : '',
    ip,
  })
  if (!turnstile.ok) {
    return NextResponse.json(
      {
        message:
          'Verification failed. Please refresh and try again — or email me directly.',
      },
      { status: 403 },
    )
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'fullname, valid email, subject, and message are required.' },
      { status: 400 },
    )
  }
  const { fullname, email, subject, message } = parsed.data

  sgMail.setApiKey(apiKey)
  if (isEuResidency) {
    ;(
      sgMail as { setDataResidency?: (region: 'eu') => void }
    ).setDataResidency?.('eu')
  }

  const to = process.env.CONTACT_TO_EMAIL ?? 'brandon@brandonperfetti.com'
  const from = process.env.CONTACT_FROM_EMAIL ?? 'info@brandonperfetti.com'

  try {
    await sgMail.send({
      to,
      from,
      replyTo: email,
      subject,
      text: `New contact from ${fullname}\nEmail: ${email}\n\n${message}`,
      html: `
        <h3>New contact from ${escapeHtml(fullname)}</h3>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong> ${escapeHtml(message)}</p>
      `,
    })

    return NextResponse.json({ message: 'Email sent successfully.' })
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Failed to send email.',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
