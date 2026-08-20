import { Resend } from 'resend'

/**
 * Add an email to the Resend contact list (optionally segmented via
 * `RESEND_CONTACT_SEGMENT_ID`) — the single capture path shared by the
 * Clerk sign-up webhook and the contact form's explicit opt-in checkbox.
 *
 * @param contact - Email plus optional name parts to store on the contact.
 *
 * @remarks Deliberately fire-and-forget in spirit: capture is never the
 * caller's primary job (delivering a message, acking a webhook), so this
 * logs and swallows every failure — including the expected
 * duplicate-contact error when someone opts in twice — and no-ops with a
 * warning when `RESEND_API_KEY` is absent. Callers must never let a
 * capture failure fail the user-facing request.
 */
export async function captureContact(contact: {
  email: string
  firstName?: string
  lastName?: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const segmentId = process.env.RESEND_CONTACT_SEGMENT_ID
  if (!apiKey) {
    console.warn('[captureContact] RESEND_API_KEY missing; skipping capture')
    return
  }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.contacts.create({
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
    })
    if (error) {
      console.error('[captureContact] Resend contact sync failed', {
        name: error.name,
        message: error.message.slice(0, 300),
      })
    }
  } catch (error) {
    console.error('[captureContact] Resend contact sync threw', {
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
    })
  }
}
