import { Webhook } from 'svix'
import { Resend } from 'resend'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Clerk → Resend contact sync (§12 email capture; replaces v3
 * api/mailinglist, migrated from the SendGrid marketing list 2026-08-10
 * when SendGrid's post-trial Marketing Campaigns paywall blocked list
 * access entirely).
 *
 * Clerk fires `user.created` on sign-up; we verify the svix signature with
 * `CLERK_WEBHOOK_SIGNING_SECRET` and create the contact in Resend,
 * optionally assigned to the segment in `RESEND_CONTACT_SEGMENT_ID`.
 *
 * @remarks Consent: the sign-up flow presents Clerk's legal/marketing consent;
 * TODO(brandon): if you enable a granular marketing opt-in field in Clerk,
 * read it from `public_metadata` here and skip non-consenting users.
 */
export async function POST(req: Request) {
  if (!isClerkEnabled()) {
    return Response.json({ error: 'Not configured' }, { status: 503 })
  }

  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!secret) {
    return Response.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const payload = await req.text()
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    event = new Webhook(secret).verify(payload, headers) as typeof event
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'user.created') {
    return Response.json({ received: true })
  }

  const emails =
    (event.data.email_addresses as Array<{ email_address: string }>) || []
  const email = emails[0]?.email_address
  const firstName = (event.data.first_name as string) || undefined
  const lastName = (event.data.last_name as string) || undefined

  if (!email) {
    return Response.json({ received: true })
  }

  const apiKey = process.env.RESEND_API_KEY
  const segmentId = process.env.RESEND_CONTACT_SEGMENT_ID
  if (!apiKey) {
    console.warn('[clerk/webhook] RESEND_API_KEY missing; skipping capture')
    return Response.json({ received: true })
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.contacts.create({
    email,
    firstName,
    lastName,
    ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
  })

  if (error) {
    console.error('[clerk/webhook] Resend contact sync failed', {
      name: error.name,
      message: error.message.slice(0, 300),
    })
    // 200 anyway: Clerk retries are not useful for a bad Resend config, and
    // a duplicate-contact error on webhook redelivery is expected noise.
  }

  return Response.json({ received: true })
}
