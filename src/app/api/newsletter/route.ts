import { captureException } from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import * as z from 'zod'

import { captureContact } from '@/lib/email/captureContact'
import { guardPublicForm } from '@/lib/security/publicFormGuard'

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
})

/**
 * The one answer to a subscription Resend completed, new address or not.
 *
 * @remarks Constant on purpose: a different answer for an address already on
 * the list would let anyone test whether an address is subscribed.
 */
const SUBSCRIBED_MESSAGE =
  "Thanks. You'll get an email when I publish something new."

/**
 * The one answer when Resend refused the write or could not be reached.
 *
 * @remarks The same for every address (#409): it says the subscription did
 * not happen, never whether the address was already on the list.
 */
const CAPTURE_FAILED_MESSAGE =
  "Couldn't subscribe you right now. Please try again later."

/**
 * A newsletter capture Resend did not complete, as reported to Sentry.
 *
 * @remarks Its message names only the stage; Resend's error name and status
 * go as tags. No address, and not Resend's message, which can echo one.
 */
class NewsletterCaptureError extends Error {
  constructor(stage: string) {
    super(`Newsletter capture failed at ${stage}`)
    this.name = 'NewsletterCaptureError'
  }
}

/**
 * Newsletter Signup block → Resend contact list (#367).
 *
 * The page-builder's Newsletter Signup form posts here. It replaces v3's
 * `/api/mailinglist`, which went when the Clerk webhook took over sign-up
 * capture and left this form posting to a 404.
 *
 * @remarks
 * **Guardrails** are `/api/contact`'s, through the shared `guardPublicForm`:
 * same-origin source, a per-IP rate limit keyed on the IP's HMAC digest
 * (`newsletter:<digest>`, #364) at `mailingListRatePerMinute`, a 503 when the
 * limiter store fails (#390), and Turnstile whenever `TURNSTILE_SECRET_KEY`
 * is set.
 *
 * **Consent** follows the sign-up rule (#362): only an explicit act joins
 * the list. Here the act is the whole form, a single email field whose only
 * purpose is subscribing, so submitting it is the opt-in, where sign-up and
 * the contact form, which do something else first, ask with an unticked box.
 * Single opt-in, like the contact form's box: no confirmation email, so
 * unlike sign-up (Clerk's email code, or Google) nothing proves the visitor
 * owns the address. A confirmation step would be a product decision.
 *
 * **A returning reader rejoins (#407).** Brandon decided on #404 that
 * someone who unsubscribed may rejoin through this form, so the route asks
 * `captureContact` to `rejoin`: an existing, unsubscribed contact is set back
 * to subscribed and put in the segment. Only this route does; the Clerk
 * webhook and the contact form leave an opt-out alone. With single opt-in
 * this widens the consent gap above: anyone can put back on the list an
 * address whose owner chose to leave, which is one more reason the rate
 * limit and Turnstile stay on this route (`docs/AUTH.md` § Email capture).
 *
 * **One success reply, one failure reply (#409).** A new address and one
 * already on the list, subscribed or not, both get `SUBSCRIBED_MESSAGE`, so
 * the answer does not say which it was. When Resend refuses a write or
 * cannot be reached, the route answers 503 with `CAPTURE_FAILED_MESSAGE`,
 * the same for every address, and reports the failed stage to Sentry with
 * no address in it, rather than tell the visitor they subscribed.
 *
 * **Capture** is `captureContact`, the helper the Clerk webhook and the
 * contact form share, so all three land in the same list and segment
 * (`RESEND_CONTACT_SEGMENT_ID`).
 *
 * No `RESEND_API_KEY` answers 503 before any guard runs: capture would
 * no-op, and telling the visitor they were subscribed would be false.
 */
export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { message: 'Subscriptions are unavailable right now.' },
      { status: 503 },
    )
  }

  const guard = await guardPublicForm(req, 'newsletter', {
    unavailable:
      'Subscriptions are temporarily unavailable. Please try again later.',
    verificationFailed: 'Verification failed. Please refresh and try again.',
  })
  if (!guard.ok) return guard.response

  const parsed = bodySchema.safeParse(guard.body)
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Please enter a valid email address.' },
      { status: 400 },
    )
  }

  const outcome = await captureContact(
    { email: parsed.data.email },
    { rejoin: true },
  )

  if (outcome.status !== 'captured') {
    const failure =
      outcome.status === 'failed'
        ? outcome
        : { stage: 'skipped', errorName: undefined, statusCode: null }
    captureException(new NewsletterCaptureError(failure.stage), {
      tags: {
        'newsletter.capture_stage': failure.stage,
        'resend.error_name': failure.errorName ?? 'none',
        'resend.status_code': String(failure.statusCode ?? 'none'),
      },
    })
    return NextResponse.json(
      { message: CAPTURE_FAILED_MESSAGE },
      { status: 503 },
    )
  }

  return NextResponse.json({ message: SUBSCRIBED_MESSAGE })
}
