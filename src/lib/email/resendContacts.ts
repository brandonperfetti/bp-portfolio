import { Resend } from 'resend'

import { boundedErrorMessage } from '@/lib/observability/boundedErrorMessage'

/**
 * The audience-maintenance half of the Resend contacts API: look a contact up,
 * read one back, remove one.
 *
 * @remarks **Why this is not in `captureContact`.** That module owns contact
 * *creation* and is shared with the contact form, where the caller wants
 * fire-and-forget and no return value. These are the operations the Clerk
 * webhook needs to keep the audience honest afterwards (#86), and they all
 * have to report what happened so the caller can decide whether to remove a
 * contact, re-map a user, or drop a mirror key.
 *
 * **Why they left the route.** `src/app/api/clerk/webhook/route.ts` had grown
 * to ~420 lines mixing three unrelated jobs: svix verification, Clerk event
 * routing, and this Resend I/O. The route keeps the first two — the things
 * that are genuinely about being an HTTP endpoint — and these move here, where
 * they are testable without constructing a signed webhook delivery.
 *
 * **Every function swallows its failures.** The only caller is a webhook, and
 * Clerk redelivers every non-2xx, so a Resend outage that threw would become a
 * retry storm. Each returns `undefined`/`false` after logging instead, and the
 * caller treats that as "no-op this delivery".
 */

/**
 * A Resend client, or `null` when `RESEND_API_KEY` is absent.
 *
 * @param context - Caller identity for the skip log (e.g. `'user.deleted'`).
 * @returns The client, or `null` after logging the skip.
 *
 * @remarks Mirrors `captureContact`'s no-key behavior so a keys-off
 * environment degrades to a warning instead of a 500. Constructed per call
 * rather than cached: the `Resend` constructor only closes over the key, and
 * caching it would freeze whatever `RESEND_API_KEY` was set when the first
 * request warmed the instance.
 */
export function getResendClient(context: string): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[resend-contacts] RESEND_API_KEY missing; skipping', {
      context,
    })
    return null
  }
  return new Resend(apiKey)
}

/**
 * Look up a Resend contact id by email address.
 *
 * @param resend - The Resend client.
 * @param email - The contact's email address.
 * @returns The contact id, or `undefined` when it cannot be resolved.
 *
 * @remarks This extra round trip exists because `captureContact` returns
 * `void` — it is the shared capture path for the contact form too, and
 * widening its contract is out of this change's scope. The create response
 * does carry the new id, so if that helper ever returns it, this lookup
 * becomes dead code on the create paths.
 */
export async function findContactIdByEmail(
  resend: Resend,
  email: string,
): Promise<string | undefined> {
  try {
    const { data, error } = await resend.contacts.get({ email })
    if (error || !data) {
      console.error('[resend-contacts] contact lookup failed', {
        name: error?.name,
        message: error?.message?.slice(0, 300),
      })
      return undefined
    }
    return data.id
  } catch (error) {
    console.error('[resend-contacts] contact lookup threw', {
      message: boundedErrorMessage(error),
    })
    return undefined
  }
}

/**
 * Read the email address a contact currently holds.
 *
 * @param resend - The Resend client.
 * @param contactId - The Resend contact id.
 * @returns The stored address, or `undefined` when the contact is unreadable.
 *
 * @remarks The `user.updated` path needs this to decide whether the primary
 * email actually moved. Compare the result case-insensitively: Resend echoes
 * the casing it was given and Clerk may report a differently-cased spelling of
 * the same mailbox, and treating that as a change would delete and recreate
 * the contact on every profile save.
 */
export async function findContactEmailById(
  resend: Resend,
  contactId: string,
): Promise<string | undefined> {
  try {
    const { data, error } = await resend.contacts.get(contactId)
    if (error || !data) {
      console.error('[resend-contacts] mapped contact unreadable', {
        contactId,
        name: error?.name,
        message: error?.message?.slice(0, 300),
      })
      return undefined
    }
    return data.email
  } catch (error) {
    console.error('[resend-contacts] mapped contact read threw', {
      contactId,
      message: boundedErrorMessage(error),
    })
    return undefined
  }
}

/**
 * Remove a contact from the audience.
 *
 * @param resend - The Resend client.
 * @param contactId - The Resend contact id.
 * @param context - Log context describing why the contact is being removed.
 * @returns `true` when Resend confirmed the removal.
 *
 * @remarks **Audience removal, never a suppression.** A Resend suppression
 * blocks *all* mail to an address including transactional (a password reset),
 * so it is the wrong tool for "this account is gone" — if the person signs up
 * again they are silently unreachable. Removal is marketing-scoped and
 * reversible. Suppression is not used anywhere in this codebase
 * (`docs/AUTH.md`).
 *
 * The boolean is load-bearing for `user.deleted`: it is what lets the caller
 * keep the Redis mirror key on a failed removal, which is the only remaining
 * record of the link once the Clerk user is gone.
 */
export async function removeContact(
  resend: Resend,
  contactId: string,
  context: string,
): Promise<boolean> {
  try {
    const { error } = await resend.contacts.remove(contactId)
    if (error) {
      console.error('[resend-contacts] contact removal failed', {
        context,
        contactId,
        name: error.name,
        message: error.message.slice(0, 300),
      })
      return false
    }
    console.info('[resend-contacts] removed contact', { context, contactId })
    return true
  } catch (error) {
    console.error('[resend-contacts] contact removal threw', {
      context,
      contactId,
      message: boundedErrorMessage(error),
    })
    return false
  }
}
