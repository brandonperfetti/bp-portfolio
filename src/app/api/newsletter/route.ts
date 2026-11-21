import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import * as z from 'zod'

import { buildConfirmEmail } from '@/lib/email/newsletterConfirmEmail'
import {
  createConfirmToken,
  getConfirmTokenKey,
} from '@/lib/email/newsletterConfirmToken'
import { reportNewsletterFailure } from '@/lib/email/newsletterFailure'
import { guardPublicForm } from '@/lib/security/publicFormGuard'

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
})

/**
 * The one answer to a sign-up whose confirmation email was sent.
 *
 * @remarks Constant on purpose: every address gets it, on the list or not,
 * so the answer cannot be used to test whether an address is subscribed.
 */
const CONFIRM_SENT_MESSAGE = 'Thanks. Check your inbox for a link to confirm.'

/**
 * The one answer when the confirmation email could not be sent.
 *
 * @remarks The same for every address (#409): the sign-up did not happen,
 * and nothing says whether the address was already on the list.
 */
const SEND_FAILED_MESSAGE =
  "Couldn't sign you up right now. Please try again later."

/** The answer when this deployment cannot send or sign confirmations. */
const UNAVAILABLE_MESSAGE = 'Subscriptions are unavailable right now.'

/**
 * Newsletter Signup block → a confirmation email (#367, double opt-in #407).
 *
 * The page-builder's Newsletter Signup form posts here. It replaces v3's
 * `/api/mailinglist`, which went when the Clerk webhook took over sign-up
 * capture and left this form posting to a 404.
 *
 * @remarks
 * **Double opt-in (Brandon, on #411).** A submit changes nothing on the
 * list. It sends one email to the address, with a link to
 * `/newsletter/confirm` carrying a signed, expiring token for that address
 * (`newsletterConfirmToken.ts`); only the confirmation
 * (`/api/newsletter/confirm`) joins the list, or rejoins it for a reader who
 * unsubscribed. So an address joins only when its owner asks to, which this
 * form cannot otherwise prove: unlike sign-up (Clerk's email code, or
 * Google), anyone can type any address here.
 *
 * **One success reply, one failure reply (#409).** Every address that is
 * sent a confirmation gets `CONFIRM_SENT_MESSAGE`, new or already on the
 * list, so the answer never says which. When Resend refuses the send or
 * cannot be reached, every address gets a 503 with `SEND_FAILED_MESSAGE`,
 * reported to Sentry with no address. The owner of an address already on the
 * list gets a confirmation they can ignore.
 *
 * **Guardrails** are `/api/contact`'s, through the shared `guardPublicForm`:
 * same-origin source, a per-IP rate limit keyed on the IP's HMAC digest
 * (`newsletter:<digest>`, #364) at `mailingListRatePerMinute`, a 503 when the
 * limiter store fails (#390), and Turnstile whenever `TURNSTILE_SECRET_KEY`
 * is set. They now also bound how many confirmation emails one client can
 * make the site send to other people's addresses.
 *
 * No `RESEND_API_KEY`, or no `PAYLOAD_SECRET` to sign the link with, answers
 * 503 before any guard runs, and nothing is sent.
 */
export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY
  const key = getConfirmTokenKey()
  if (!apiKey || !key) {
    return NextResponse.json({ message: UNAVAILABLE_MESSAGE }, { status: 503 })
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

  const { email } = parsed.data
  const message = buildConfirmEmail(createConfirmToken(email, key))
  const from = process.env.CONTACT_FROM_EMAIL ?? 'info@brandonperfetti.com'

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: email,
      ...message,
    })
    if (error) {
      reportNewsletterFailure('send', {
        errorName: error.name,
        statusCode: error.statusCode,
      })
      return NextResponse.json(
        { message: SEND_FAILED_MESSAGE },
        { status: 503 },
      )
    }
  } catch {
    reportNewsletterFailure('send')
    return NextResponse.json({ message: SEND_FAILED_MESSAGE }, { status: 503 })
  }

  return NextResponse.json({ message: CONFIRM_SENT_MESSAGE })
}
