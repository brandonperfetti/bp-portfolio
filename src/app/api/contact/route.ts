import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import * as z from 'zod'

import { captureContact } from '@/lib/email/captureContact'
import { guardPublicForm } from '@/lib/security/publicFormGuard'

const bodySchema = z.object({
  fullname: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(5000),
  // Explicit mailing-list opt-in (unchecked by default in the UI) — never
  // capture a contact-form sender without this.
  subscribe: z.boolean().optional(),
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
 * Contact-form delivery via Resend (migrated from SendGrid 2026-08-10; the
 * route also moved from `/api/sendgrid` to the vendor-neutral `/api/contact`
 * so the next provider change touches zero URLs).
 *
 * @remarks Hardened to the same guardrail stack as the Corvus chat route
 * (fresh-eyes review 2026-08, finding M1): same-origin source guard, per-IP
 * rate limiting (`mailingListRatePerMinute`, keyed on the IP's HMAC digest,
 * never the raw address, #364, failing closed on a store outage, #390) and
 * Turnstile, all in `guardPublicForm`, which `/api/newsletter` shares (#367);
 * then Zod validation with a real email check, and HTML-escaped
 * interpolation so user input cannot inject markup into the notification
 * email. Turnstile is enforced whenever
 * `TURNSTILE_SECRET_KEY` is set (the widget ships env-gated with the
 * matching `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); without keys the route
 * behaves exactly as before, so previews and local dev need no setup.
 */
export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { message: 'RESEND_API_KEY is not configured.' },
      { status: 500 },
    )
  }

  const guard = await guardPublicForm(req, 'contact', {
    // A visitor who loses the form to a limiter outage (#390) or a failed bot
    // check is pointed at email, which still works.
    unavailable:
      'The contact form is temporarily unavailable. Please try again later — or email me directly.',
    verificationFailed:
      'Verification failed. Please refresh and try again — or email me directly.',
  })
  if (!guard.ok) return guard.response
  const raw = guard.body

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'fullname, valid email, subject, and message are required.' },
      { status: 400 },
    )
  }
  const { fullname, email, subject, message, subscribe } = parsed.data

  const to = process.env.CONTACT_TO_EMAIL ?? 'brandon@brandonperfetti.com'
  const from = process.env.CONTACT_FROM_EMAIL ?? 'info@brandonperfetti.com'

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
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

  if (error) {
    return NextResponse.json(
      { message: 'Failed to send email.', error: error.message },
      { status: 500 },
    )
  }

  // Consent-gated capture, only after the message actually delivered —
  // captureContact swallows its own failures, so a capture hiccup never
  // turns a delivered message into a user-facing error.
  if (subscribe) {
    const [firstName, ...rest] = fullname.split(/\s+/)
    await captureContact({
      email,
      firstName,
      lastName: rest.join(' ') || undefined,
    })
  }

  return NextResponse.json({ message: 'Email sent successfully.' })
}
