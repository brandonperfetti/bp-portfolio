import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import * as z from 'zod'

import {
  getRequestClientIp,
  getSecurityLimits,
  isAllowedRequestSource,
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
 * markup into the notification email. Turnstile remains deliberately
 * unwired (needs a frontend widget + keys) — the rate limit is the abuse
 * control until then.
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
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
