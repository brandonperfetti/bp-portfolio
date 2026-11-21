import { NextResponse } from 'next/server'
import * as z from 'zod'

import { captureContact } from '@/lib/email/captureContact'
import { guardPublicForm } from '@/lib/security/publicFormGuard'

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
})

/**
 * The one answer to a valid subscription, whatever Resend made of it.
 *
 * @remarks Constant on purpose: a different answer for an address already on
 * the list would let anyone test whether an address is subscribed.
 */
const SUBSCRIBED_MESSAGE =
  "Thanks. You'll get an email when I publish something new."

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
 * **A prior unsubscribe stands.** `captureContact` sends no `unsubscribed`
 * field, so a reader who unsubscribed and submits again is not asked back
 * onto the list by this route; clearing an opt-out would change the shared
 * helper, and the webhook and contact form with it. The reply is the same either way, so it
 * does not disclose that state.
 *
 * **Capture** is `captureContact`, the helper the Clerk webhook and the
 * contact form already share, so all three land in the same list and
 * segment (`RESEND_CONTACT_SEGMENT_ID`). It swallows Resend's errors,
 * including the duplicate-contact one, so every valid address gets the same
 * answer and nothing reveals whether it was already on the list.
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

  await captureContact({ email: parsed.data.email })

  return NextResponse.json({ message: SUBSCRIBED_MESSAGE })
}
