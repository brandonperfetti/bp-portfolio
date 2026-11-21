import { NextResponse } from 'next/server'

import { captureContact } from '@/lib/email/captureContact'
import {
  getConfirmTokenKey,
  verifyConfirmToken,
} from '@/lib/email/newsletterConfirmToken'
import { reportNewsletterFailure } from '@/lib/email/newsletterFailure'
import {
  claimConfirmToken,
  releaseConfirmToken,
} from '@/lib/email/newsletterTokenUse'
import { guardPublicForm } from '@/lib/security/publicFormGuard'

/**
 * What the confirm page shows for each answer. The page reads `status`, so
 * the copy lives with the page; `message` is a plain fallback.
 */
type ConfirmStatus =
  'confirmed' | 'expired' | 'invalid' | 'used' | 'failed' | 'incomplete'

function answer(status: ConfirmStatus, httpStatus: number, message: string) {
  return NextResponse.json({ status, message }, { status: httpStatus })
}

/**
 * Newsletter double opt-in, second step: the confirm page's button posts the
 * link's token here, and a valid token joins the list (#407).
 *
 * @remarks
 * **The address comes only from the token.** The body carries the token and
 * nothing else, and the token seals the address and the expiry with
 * AES-256-GCM (`newsletterConfirmToken.ts`), so a token cannot confirm any
 * address but the one it was sent to; an edited, forged or expired one is
 * refused with no Resend call.
 *
 * **Each link works once.** A verified token is claimed in the rate
 * limiter's store before the join (`newsletterTokenUse.ts`), so pressing an
 * old link again answers `used` (410) and never clears an unsubscribe made
 * after it was confirmed. A join that fails before anything on the list
 * changed (lookup or create) releases the claim, so the reader can retry the
 * same link; one that fails later (re-subscribe or segment) keeps it, since
 * the re-subscribe may have applied, and answers `incomplete`: sign up again
 * for a new link. If the release itself fails, the link stays used too. A
 * store failure answers 503 and joins no one.
 *
 * **The join is the existing rejoin path.** `captureContact` with `rejoin`
 * creates a new contact in the segment, or sets an existing unsubscribed one
 * back to `unsubscribed: false`, reads it back, and puts it in the segment.
 * Anything short of that is a 503 `failed`, reported to Sentry by stage with
 * no address, never a false `confirmed` (#409).
 *
 * **Guardrails:** the same-origin check and the newsletter rate limit, in
 * its own bucket (`newsletter-confirm:<digest>`), failing closed on a store
 * outage (#390). No Turnstile: the token, which only the address's owner
 * received, is the proof a bot check would stand in for.
 *
 * No `RESEND_API_KEY`, or no `PAYLOAD_SECRET` to check the token with,
 * answers 503 before any guard runs, and the list is not touched.
 */
export async function POST(req: Request) {
  const key = getConfirmTokenKey()
  if (!process.env.RESEND_API_KEY || !key) {
    return answer('failed', 503, 'Confirmations are unavailable right now.')
  }

  const guard = await guardPublicForm(
    req,
    'newsletter-confirm',
    {
      unavailable:
        'Confirmations are temporarily unavailable. Please try again later.',
      verificationFailed: 'Verification failed. Please refresh and try again.',
    },
    { turnstile: false },
  )
  if (!guard.ok) return guard.response

  const token = (guard.body as { token?: unknown } | null)?.token
  const verified = verifyConfirmToken(token, key)
  if (!verified.ok) {
    return verified.reason === 'expired'
      ? answer('expired', 410, 'This link has expired.')
      : answer('invalid', 400, "This link doesn't work.")
  }

  // `verifyConfirmToken` accepted it, so it is a string.
  const sealed = token as string
  let claim: Awaited<ReturnType<typeof claimConfirmToken>>
  try {
    claim = await claimConfirmToken(sealed)
  } catch {
    reportNewsletterFailure('token_claim')
    return answer('failed', 503, "Couldn't confirm right now.")
  }
  if (claim === 'used') {
    return answer('used', 410, 'This link has already been used.')
  }

  const outcome = await captureContact(
    { email: verified.email },
    { rejoin: true },
  )
  if (outcome.status !== 'captured') {
    reportNewsletterFailure(
      outcome.status === 'failed' ? outcome.stage : 'skipped',
      outcome.status === 'failed' ? outcome : {},
    )
    // Free the link only when nothing on the list can have changed: the
    // lookup or the create failed, or capture was skipped. Past that, the
    // re-subscribe may have applied, and a freed link could undo a later
    // unsubscribe, so it stays used and the reader signs up again.
    const unchanged =
      outcome.status === 'skipped' ||
      outcome.stage === 'lookup' ||
      outcome.stage === 'create'
    if (unchanged) {
      await releaseConfirmToken(sealed)
      return answer('failed', 503, "Couldn't confirm right now.")
    }
    return answer('incomplete', 503, "Couldn't finish confirming.")
  }

  return answer('confirmed', 200, "You're subscribed.")
}
