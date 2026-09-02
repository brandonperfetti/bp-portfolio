import { clerkClient } from '@clerk/nextjs/server'
import { Webhook } from 'svix'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'
import { captureContact } from '@/lib/email/captureContact'
import {
  forgetResendContact,
  recallResendContact,
  rememberResendContact,
  type ResendContactMirrorLookup,
} from '@/lib/email/resendContactMirror'
import {
  findContactEmailById,
  findContactIdByEmail,
  getResendClient,
  removeContact,
} from '@/lib/email/resendContacts'
import { boundedErrorMessage } from '@/lib/observability/boundedErrorMessage'

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
 * ## Contact hygiene and the identity mapping (#86)
 *
 * `user.deleted` and `user.updated` used to 2xx-and-ignore, which left a
 * deleted user's contact in the audience forever and never followed a
 * primary-email change. Closing that needs one thing the Clerk payload does
 * not carry: a stable link from a Clerk user to a Resend contact.
 *
 * **A Resend contact has no external key.** Its email is the URL selector —
 * `contacts.update` PATCHes `/contacts/:emailOrId` and its body carries only
 * `unsubscribed`, `first_name`, `last_name` and `properties` (measured
 * against the pinned `resend@6.18.1` dist), so an id-addressed update
 * *cannot* change a contact's email. And `user.deleted` carries only
 * `id`, `object` and `deleted` — no email to look one up by. So the mapping
 * has to be stored somewhere, before it is needed.
 *
 * **Two stores, because one of them cannot serve the delete.** At
 * `user.created` the Resend contact id is written to the Clerk user's
 * `external_id` (Backend API) *and* mirrored into Upstash Redis keyed by the
 * Clerk user id (`@/lib/email/resendContactMirror`). The first cut of #86
 * stored only `external_id` and then read it back off the `user.deleted`
 * payload — which never contains it, because the payload is
 * `{ deleted, id, object }` and the Clerk user it hung on is already gone. So
 * every real delete delivery no-oped and the contact survived: the exact gap
 * #86 exists to close. The mirror survives the user and is keyed by the one
 * field the delete payload does carry, so it is the delete path's source of
 * truth; `external_id` stays the mapping for the *live* user (dashboard
 * visible, and what the backfill and `user.updated` read).
 *
 * - `user.created` — capture, then map. The `external_id` write is skipped
 *   when one is already set, so a Clerk redelivery never rewrites it; the
 *   mirror is written on BOTH paths, so a redelivery or a user mapped by the
 *   backfill before the mirror existed converges instead of staying
 *   half-mapped. Every mapping write is best-effort and never fails the ack.
 * - `user.deleted` — resolve the contact from the mirror by `data.id`, then
 *   REMOVE it and drop the mirror key. Deliberately not a Resend suppression:
 *   a suppression blocks *all* mail to that address including transactional
 *   (password resets), so it is the wrong tool for "this account is gone".
 *   Audience removal is the reversible, marketing-scoped action. See
 *   `docs/AUTH.md`.
 * - `user.updated` — when the primary email changed, create the new contact
 *   and then remove the old one (in that order: the SDK cannot rename), and
 *   write the NEW contact id back to `external_id` and to the mirror.
 *
 * Every path no-ops cleanly with a distinct log line when the mapping cannot
 * be resolved — pre-mapping users, dashboard test deliveries, retries, and a
 * Redis that is unset (local dev) or unreachable. A non-2xx is never the
 * answer: Clerk redelivers every one of them.
 *
 * Primary email is always resolved via `primary_email_address_id`, never
 * `email_addresses[0]`: they coincide at sign-up but diverge on exactly the
 * multi-address accounts `user.updated` exists to follow.
 *
 * ## What lives here, and what does not
 *
 * This module owns the two jobs that are actually about being an HTTP
 * endpoint — svix verification and event routing — plus the per-event policy
 * that decides which mapping to trust. The Resend I/O it performs lives in
 * `@/lib/email/resendContacts`, and the mirror in
 * `@/lib/email/resendContactMirror`; both are usable, and testable, without
 * constructing a signed webhook delivery.
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

  switch (event.type) {
    case 'user.created':
      await handleUserCreated(event.data)
      break
    case 'user.updated':
      await handleUserUpdated(event.data)
      break
    case 'user.deleted':
      await handleUserDeleted(event.data)
      break
    default:
      break
  }

  return Response.json({ received: true })
}

/** A Clerk `user.*` payload, read defensively — webhooks are untyped JSON. */
type ClerkUserData = Record<string, unknown>

/**
 * Read a string field, treating `null`, `''` and non-strings as absent.
 *
 * @param data - The `user.*` event payload.
 * @param key - The snake_case field to read.
 * @returns The value when it is a non-empty string, else `undefined`.
 *
 * @remarks Named for what it guarantees, not for its return type — it was
 * `str()`, which said nothing about the two coercions that are the entire
 * point. Clerk sends `null` for an unset name and can send `''`; both must
 * read as absent so `captureContact` receives `undefined` rather than
 * threading an empty string into a Resend contact, and so an empty
 * `external_id` is never mistaken for a mapping.
 */
function nonEmptyStringField(
  data: ClerkUserData,
  key: string,
): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The user's primary email address.
 *
 * @param data - The `user.*` event payload.
 * @returns The primary address, or `undefined` when the user has none.
 *
 * @remarks Resolves `primary_email_address_id` against `email_addresses` and
 * falls back to the first entry only when that id is absent or dangling. The
 * fallback is what the route did unconditionally before #86; keeping it as a
 * fallback preserves sign-up behavior (a new user has exactly one address)
 * while making multi-address accounts correct.
 *
 * **Near-duplicate of `primaryEmailOf` in
 * `scripts/lib/clerk-resend-mapping.mjs`, deliberately.** The shared part is
 * four lines; around it the two differ in field casing (raw snake_case webhook
 * JSON here, camelCase Backend SDK resources there) and in normalization (that
 * one casefolds for matching; this one must hand Resend the address exactly as
 * Clerk spelled it). Sharing them would mean either putting the helper in
 * `src/` and making a `.mjs` script lib import TypeScript — losing the
 * plain-node runnability that is why it is `.mjs` — or making `src/` import
 * from `scripts/`. Neither is worth four lines; see that module for the
 * matching half of this note.
 *
 * **`Array.isArray`, not `?? []`.** The cast is a compile-time claim about
 * untyped webhook JSON, and `?? []` only makes good on it for `null` and
 * `undefined`. A signed payload carrying `email_addresses: 'garbage'` — or an
 * object — reached `.find` and threw a `TypeError` that escaped the route: the
 * POST `try`/`catch` wraps signature verification only, so the throw surfaced
 * as a 500. That contradicts this route's contract that every unresolvable
 * case is a 2xx no-op, and it is the worst possible answer to a permanently
 * malformed payload, because Clerk redelivers every non-2xx and would retry
 * this one forever. A non-array now reads as "no addresses" and the event
 * no-ops down its existing logged path.
 *
 * The guard is deliberately local rather than a blanket `try`/`catch` around
 * the handler dispatch. Uncaught TRANSIENT failures — Redis unreachable,
 * Resend down — SHOULD stay non-2xx precisely so Clerk retries them;
 * swallowing those into a 200 would turn a recoverable blip into silent data
 * loss. Only the permanently-malformed shape belongs in a 2xx.
 */
function primaryEmail(data: ClerkUserData): string | undefined {
  const raw = data.email_addresses
  const emails = Array.isArray(raw)
    ? (raw as Array<{ id?: string; email_address?: string }>)
    : []
  const primaryId = nonEmptyStringField(data, 'primary_email_address_id')
  const primary = primaryId
    ? emails.find((entry) => entry?.id === primaryId)
    : undefined
  const chosen = primary ?? emails[0]
  const email = chosen?.email_address
  return typeof email === 'string' && email.length > 0 ? email : undefined
}

/** The name parts, threaded as `undefined` (never `null`) for absent values. */
function nameParts(data: ClerkUserData) {
  return {
    firstName: nonEmptyStringField(data, 'first_name'),
    lastName: nonEmptyStringField(data, 'last_name'),
  }
}

/**
 * Write the Resend contact id to the Clerk user's `external_id`.
 *
 * @param userId - The Clerk user id.
 * @param contactId - The Resend contact id to store.
 *
 * @remarks Never throws. A mapping failure must not fail the webhook: Clerk
 * redelivers every non-2xx, and a redelivery would re-run `captureContact`
 * for a contact that already exists. The distinct log line is the signal —
 * an unmapped user is repairable later by
 * `scripts/backfill-clerk-resend-mapping.ts`.
 */
async function writeExternalId(
  userId: string,
  contactId: string,
): Promise<void> {
  try {
    const clerk = await clerkClient()
    await clerk.users.updateUser(userId, { externalId: contactId })
    console.info('[clerk-webhook] mapped Resend contact to Clerk external_id', {
      userId,
      contactId,
    })
  } catch (error) {
    console.error(
      '[clerk-webhook] external_id write failed; user left unmapped',
      {
        userId,
        contactId,
        message: boundedErrorMessage(error),
      },
    )
  }
}

/**
 * `user.created`: capture the contact, then record the mapping.
 *
 * @param data - The `user.created` payload.
 *
 * @remarks The `captureContact` call shape is unchanged from #74 — capture
 * still owns segment assignment, duplicate-swallowing and the no-key warning.
 *
 * The `external_id` write is skipped when one is already set, so a redelivery
 * cannot rewrite an established link. **The mirror write is not skipped**: it
 * is the reconcile path. An already-set `external_id` is exactly the state of
 * every user the backfill mapped before the mirror existed, and of any user
 * whose mirror write failed on a previous delivery — for them the contact id
 * is right there in the payload, so redelivering `user.created` (or any Clerk
 * dashboard resend) is enough to converge, with no second Clerk write.
 */
async function handleUserCreated(data: ClerkUserData): Promise<void> {
  const email = primaryEmail(data)
  if (!email) return

  const { firstName, lastName } = nameParts(data)

  // captureContact logs + swallows every failure, so this always 200s:
  // Clerk retries are not useful for a bad Resend config, and a
  // duplicate-contact error on webhook redelivery is expected noise.
  await captureContact({ email, firstName, lastName })

  const userId = nonEmptyStringField(data, 'id')
  if (!userId) return

  const mappedContactId = nonEmptyStringField(data, 'external_id')
  if (mappedContactId) {
    console.info('[clerk-webhook] external_id already set; mapping skipped', {
      userId,
      contactId: mappedContactId,
    })
    await mirrorContact(userId, mappedContactId, 'user.created:reconcile')
    return
  }

  const resend = getResendClient('user.created')
  if (!resend) return

  const contactId = await findContactIdByEmail(resend, email)
  if (!contactId) return

  await writeExternalId(userId, contactId)
  await mirrorContact(userId, contactId, 'user.created')
}

/**
 * Mirror a contact id into Redis and log the outcome.
 *
 * @param userId - The Clerk user id.
 * @param contactId - The Resend contact id now mapped to that user.
 * @param context - The event that produced the mapping, for the log line.
 *
 * @remarks Never throws and never affects the response. A user with an
 * `external_id` but no mirror is still fully functional today — only their
 * eventual `user.deleted` degrades to the logged no-op — and the next
 * `user.created` redelivery reconciles them, so a failure here is recoverable
 * noise rather than a reason to make Clerk retry.
 */
async function mirrorContact(
  userId: string,
  contactId: string,
  context: string,
): Promise<void> {
  const mirror = await rememberResendContact(userId, contactId)
  if (mirror === 'ok') {
    console.info('[clerk-webhook] mirrored Resend contact id', {
      context,
      userId,
      contactId,
    })
    return
  }
  console.warn('[clerk-webhook] contact mirror not written', {
    context,
    userId,
    contactId,
    mirror,
  })
}

/**
 * `user.deleted`: remove the mapped Resend contact from the audience.
 *
 * @param data - The `user.deleted` payload.
 *
 * @remarks Deletion is the decided action, not suppression — a Resend
 * suppression blocks transactional mail too.
 *
 * **Resolution order: mirror first, payload second.** The measured payload is
 * `{ deleted, id, object }`, so the payload read alone is a guaranteed miss —
 * reading `external_id` here was the whole defect, and the pre-fix unit test
 * only passed because it fabricated that field onto the delete event. The
 * mirror is keyed by `data.id`, the one field that is actually present. The
 * `external_id` read is kept *after* it as a documented fallback: it costs a
 * property access, it is harmless if Clerk ever enriches this payload, and it
 * keeps the handler correct for a hand-crafted redelivery that carries one.
 *
 * The mirror key is dropped only after the removal succeeds — see
 * {@link forgetResendContact} for why deleting it eagerly would be worse than
 * leaving a stray key.
 *
 * Every unresolvable case is a 2xx no-op with its own log line, and the three
 * are deliberately distinguishable: a `miss` is an unmapped user (pre-mapping
 * signup, dashboard test delivery), while `unavailable`/`error` mean the
 * mirror itself is degraded and contacts are silently accumulating. A non-2xx
 * would only buy a Clerk retry loop against a mapping that will not appear.
 */
async function handleUserDeleted(data: ClerkUserData): Promise<void> {
  const userId = nonEmptyStringField(data, 'id')

  const mirrored: ResendContactMirrorLookup = userId
    ? await recallResendContact(userId)
    : { status: 'miss' }

  const contactId =
    mirrored.contactId ?? nonEmptyStringField(data, 'external_id')
  if (!contactId) {
    console.info(
      '[clerk-webhook] user.deleted resolved no Resend contact; nothing to remove',
      { userId, mirror: mirrored.status },
    )
    return
  }

  const resend = getResendClient('user.deleted')
  if (!resend) return

  const removed = await removeContact(resend, contactId, 'user.deleted')
  if (removed && userId && mirrored.status === 'hit') {
    await forgetResendContact(userId)
  }
}

/**
 * `user.updated`: follow a primary-email change to Resend.
 *
 * @param data - The `user.updated` payload.
 *
 * @remarks A Resend contact's email is immutable through the SDK, so a change
 * is create-new-then-remove-old, in that order. Ordering is the whole safety
 * argument: if the create fails, the old contact is still there and the
 * mapping still points at it, so the run is a no-op rather than a data loss.
 * The new id is then written back to `external_id` AND to the mirror — a
 * mirror left pointing at the removed contact would make the later
 * `user.deleted` try to delete something that no longer exists while the live
 * contact survived, which is #86's failure one step downstream.
 *
 * The mapping is still read from the payload here, not from the mirror:
 * unlike `user.deleted`, `user.updated` carries the full live user object, so
 * `external_id` is present and is the authoritative value the backfill and the
 * Clerk dashboard also show.
 *
 * Idempotent under redelivery: the second delivery reads the already-updated
 * contact, sees the emails match, and no-ops before touching anything.
 */
async function handleUserUpdated(data: ClerkUserData): Promise<void> {
  const userId = nonEmptyStringField(data, 'id')
  const contactId = nonEmptyStringField(data, 'external_id')
  if (!contactId) {
    console.info(
      '[clerk-webhook] user.updated carried no external_id; nothing to sync',
      { userId },
    )
    return
  }

  const email = primaryEmail(data)
  if (!email) {
    console.info('[clerk-webhook] user.updated carried no primary email', {
      userId,
    })
    return
  }

  const resend = getResendClient('user.updated')
  if (!resend) return

  const currentEmail = await findContactEmailById(resend, contactId)
  if (!currentEmail) return

  if (currentEmail.toLowerCase() === email.toLowerCase()) {
    console.info('[clerk-webhook] primary email unchanged; no contact sync', {
      userId,
      contactId,
    })
    return
  }

  const { firstName, lastName } = nameParts(data)
  await captureContact({ email, firstName, lastName })

  const newContactId = await findContactIdByEmail(resend, email)
  if (!newContactId) {
    console.error(
      '[clerk-webhook] new contact unresolvable; old contact left intact',
      { userId, contactId },
    )
    return
  }

  if (newContactId !== contactId) {
    await removeContact(resend, contactId, 'user.updated')
  }

  if (userId) {
    await writeExternalId(userId, newContactId)
    await mirrorContact(userId, newContactId, 'user.updated')
  }
}
