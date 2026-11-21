import { Resend } from 'resend'

import { boundedErrorMessage } from '@/lib/observability/boundedErrorMessage'

/** The Resend call a failed capture stopped at. */
export type CaptureStage = 'lookup' | 'create' | 'resubscribe' | 'segment'

/**
 * What a capture did, for the one caller that must answer for it.
 *
 * @remarks `captured` covers a new contact and an existing one alike, on
 * purpose: a caller that answers a visitor must not be able to tell them
 * apart, so the type does not either. A failure carries only the stage and
 * Resend's error name and status, never the address or Resend's message
 * (which can echo it), so it is safe to send to Sentry as it is.
 */
export type CaptureOutcome =
  | { status: 'captured' }
  | { status: 'skipped' }
  | {
      status: 'failed'
      stage: CaptureStage
      errorName?: string
      statusCode?: number | null
    }

/** Options for {@link captureContact}. */
export type CaptureOptions = {
  /**
   * Set an existing, unsubscribed contact back to subscribed. Only the
   * Newsletter Signup form passes it (#407): there the submit is the opt-in
   * itself. The Clerk webhook and the contact form leave an opt-out alone.
   */
  rejoin?: boolean
}

/** Largest page Resend serves for a contact's segments. */
const SEGMENT_PAGE_LIMIT = 100

type ResendError = {
  name?: string
  message?: string
  statusCode?: number | null
}

function failed(
  stage: CaptureStage,
  error: ResendError | null | undefined,
  logMessage: string,
): CaptureOutcome {
  console.error(`[captureContact] ${logMessage}`, {
    stage,
    name: error?.name,
    message: error?.message?.slice(0, 300),
  })
  return {
    status: 'failed',
    stage,
    errorName: error?.name,
    statusCode: error?.statusCode ?? null,
  }
}

/**
 * Add an email to the Resend contact list, in `RESEND_CONTACT_SEGMENT_ID`
 * when it is set: the single capture path shared by the Clerk sign-up
 * webhook, the contact form's explicit opt-in box and the Newsletter Signup
 * form (`/api/newsletter`, #367).
 *
 * @param contact - Email plus optional name parts to store on a new contact.
 * @param options - `rejoin` clears an existing contact's opt-out; see
 * {@link CaptureOptions}.
 * @returns What happened. It never throws.
 *
 * @remarks **It looks the address up before writing (#406, #409).** Resend
 * does not document what a create for an existing contact does: its
 * OpenAPI spec lists only a 201, and the one user report says it answers a
 * plain success (resend-node#494). So the old create-only call could not
 * tell a duplicate from a failure, and an existing contact never joined the
 * segment. A lookup by email is the documented read and answers
 * `404 not_found` for an absent contact (measured 2026-11-21). Then:
 *
 * - **absent:** create it, with the segment, as before;
 * - **present:** with `rejoin` and `unsubscribed: true`, update it to
 *   `unsubscribed: false` (the field is the contact's global subscription
 *   status); then, when a segment is configured and the contact is not in
 *   it, add it. Names on an existing contact are left as they are.
 *
 * Two submits racing past the lookup both create; if Resend refuses the
 * second, that call reports a `create` failure and a retry takes the
 * existing-contact path.
 *
 * **It never throws.** Capture is never the webhook's or the contact form's
 * main job, so they ignore the outcome and a failure is a log line, as
 * before. The newsletter form, whose only job this is, answers from it.
 * No `RESEND_API_KEY` is `skipped`, with a warning.
 */
export async function captureContact(
  contact: {
    email: string
    firstName?: string
    lastName?: string
  },
  options: CaptureOptions = {},
): Promise<CaptureOutcome> {
  const apiKey = process.env.RESEND_API_KEY
  const segmentId = process.env.RESEND_CONTACT_SEGMENT_ID
  if (!apiKey) {
    console.warn('[captureContact] RESEND_API_KEY missing; skipping capture')
    return { status: 'skipped' }
  }

  let stage: CaptureStage = 'lookup'
  try {
    const resend = new Resend(apiKey)
    const { email } = contact

    const existing = await resend.contacts.get({ email })
    const absent =
      existing.error?.name === 'not_found' || existing.error?.statusCode === 404
    if (existing.error && !absent) {
      return failed('lookup', existing.error, 'Resend contact lookup failed')
    }

    if (absent || !existing.data) {
      stage = 'create'
      const { error } = await resend.contacts.create({
        email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
      })
      if (error) return failed('create', error, 'Resend contact create failed')
      return { status: 'captured' }
    }

    if (options.rejoin && existing.data.unsubscribed) {
      stage = 'resubscribe'
      const { error } = await resend.contacts.update({
        email,
        unsubscribed: false,
      })
      if (error) {
        return failed('resubscribe', error, 'Resend contact resubscribe failed')
      }
    }

    if (segmentId) {
      stage = 'segment'
      const memberships = await resend.contacts.segments.list({
        email,
        limit: SEGMENT_PAGE_LIMIT,
      })
      if (memberships.error) {
        return failed(
          'segment',
          memberships.error,
          'Resend segment read failed',
        )
      }
      const inSegment = memberships.data?.data.some((s) => s.id === segmentId)
      if (!inSegment) {
        const { error } = await resend.contacts.segments.add({
          email,
          segmentId,
        })
        if (error) return failed('segment', error, 'Resend segment add failed')
      }
    }

    return { status: 'captured' }
  } catch (error) {
    console.error('[captureContact] Resend contact sync threw', {
      stage,
      message: boundedErrorMessage(error),
    })
    return { status: 'failed', stage }
  }
}
