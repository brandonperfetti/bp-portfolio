import { Webhook } from 'svix'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Clerk → SendGrid list sync (§12 email capture; replaces v3 api/mailinglist).
 *
 * Clerk fires `user.created` on sign-up; we verify the svix signature with
 * `CLERK_WEBHOOK_SIGNING_SECRET` and upsert the email into the SendGrid
 * marketing list.
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

  const apiKey = process.env.SENDGRID_API_KEY
  const listId = process.env.SENDGRID_MARKETING_LIST_ID
  if (!apiKey) {
    console.warn('[clerk/webhook] SENDGRID_API_KEY missing; skipping list sync')
    return Response.json({ received: true })
  }

  const res = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(listId ? { list_ids: [listId] } : {}),
      contacts: [{ email, first_name: firstName, last_name: lastName }],
    }),
  })

  if (!res.ok) {
    console.error('[clerk/webhook] SendGrid sync failed', {
      status: res.status,
      body: (await res.text()).slice(0, 300),
    })
    // 200 anyway: Clerk retries are not useful for a bad SendGrid config.
  }

  return Response.json({ received: true })
}
