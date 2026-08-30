import { createClerkClient } from '@clerk/nextjs/server'
import { Resend } from 'resend'

import { formatPlan, planBackfill } from './lib/clerk-resend-mapping.mjs'

/**
 * One-shot backfill of the Clerk↔Resend contact mapping (#86).
 *
 * The webhook now writes the Resend contact id to `external_id` at
 * `user.created`, and `user.deleted` / `user.updated` resolve the contact
 * through it. Every user who signed up *before* that shipped has no
 * `external_id`, and `user.deleted` carries no email address — so without this
 * script their contacts can never be cleaned up. This gives them the link
 * retroactively by matching primary email to an existing Resend contact.
 *
 * Run it once, after the webhook change is deployed and before subscribing the
 * production endpoint to `user.deleted` / `user.updated` (`docs/AUTH.md`).
 *
 * ## Dry run by default
 *
 * The script prints a per-user plan and writes nothing unless `--apply` is
 * passed. That is the safety model: it matches on email — the one field both
 * systems share, and the one field `user.updated` exists to change — so the
 * plan is meant to be *read* before it is applied. The matching rules refuse
 * every case they cannot state unambiguously (see
 * `scripts/lib/clerk-resend-mapping.mjs`), and there is no destructive mode at
 * all: this script never deletes a contact, never clears an `external_id`, and
 * never overwrites a mapping the webhook already made.
 *
 * Usage:
 *   payload run scripts/backfill-clerk-resend-mapping.ts
 *   payload run scripts/backfill-clerk-resend-mapping.ts --apply
 *
 * Requires `CLERK_SECRET_KEY` and `RESEND_API_KEY`.
 */

const apply = process.argv.includes('--apply')

/** Clerk's Backend API caps `getUserList` at 500 per page. */
const CLERK_PAGE_SIZE = 500

/** Resend's contact list endpoint pages by cursor. */
const RESEND_PAGE_SIZE = 100

/**
 * Every Clerk user, walked page by page.
 *
 * @param clerk - A Clerk Backend API client.
 * @returns All users.
 *
 * @remarks Ordered by `created_at` ascending so the walk is stable: the
 * default is `-created_at`, under which a sign-up during the walk shifts every
 * later page and can hide a user entirely. Nothing here writes during the
 * read, so a stable order is enough — no snapshot is needed.
 */
async function listAllClerkUsers(
  clerk: ReturnType<typeof createClerkClient>,
): Promise<Array<Record<string, unknown>>> {
  const users: Array<Record<string, unknown>> = []
  for (let offset = 0; ; offset += CLERK_PAGE_SIZE) {
    const page = await clerk.users.getUserList({
      limit: CLERK_PAGE_SIZE,
      offset,
      orderBy: '+created_at',
    })
    users.push(...(page.data as unknown as Array<Record<string, unknown>>))
    if (page.data.length < CLERK_PAGE_SIZE) break
  }
  return users
}

/**
 * Every Resend contact in the audience.
 *
 * @param resend - A Resend client.
 * @returns All contacts, as `id` plus `email` records.
 *
 * @remarks Reads the whole audience rather than looking each user up by
 * address. A per-user `contacts.get` would be one HTTP call per user against a
 * rate-limited API, and would also lose the duplicate-address detection that
 * makes the match safe — a single-address lookup cannot see that a second
 * contact shares it.
 */
async function listAllResendContacts(
  resend: Resend,
): Promise<Array<{ id: string; email: string }>> {
  const contacts: Array<{ id: string; email: string }> = []
  let after: string | undefined

  for (;;) {
    const { data, error } = await resend.contacts.list({
      limit: RESEND_PAGE_SIZE,
      ...(after ? { after } : {}),
    })
    if (error) {
      throw new Error(`Resend contacts.list failed: ${error.message}`)
    }
    const page = data?.data ?? []
    for (const contact of page) {
      contacts.push({ id: contact.id, email: contact.email })
    }
    if (!data?.has_more || page.length === 0) break
    after = page[page.length - 1]?.id
    if (!after) break
  }

  return contacts
}

/**
 * Read both systems, print the plan, and write it when `--apply` is passed.
 *
 * @remarks Failures on individual writes are counted and reported rather than
 * aborting the run: an unmapped user is a benign, re-runnable state (the
 * script is idempotent — a mapped user is `already-mapped` next time), whereas
 * stopping halfway through leaves an operator with no idea how far it got.
 */
async function run(): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY
  const apiKey = process.env.RESEND_API_KEY
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is required')
  if (!apiKey) throw new Error('RESEND_API_KEY is required')

  const clerk = createClerkClient({ secretKey })
  const resend = new Resend(apiKey)

  const [users, contacts] = await Promise.all([
    listAllClerkUsers(clerk),
    listAllResendContacts(resend),
  ])

  console.log(
    `[backfill:clerk-resend] ${users.length} Clerk users, ${contacts.length} Resend contacts`,
  )

  const plan = planBackfill(users, contacts)
  for (const line of formatPlan(plan, { apply })) console.log(line)

  if (!apply) return

  let written = 0
  let failed = 0
  for (const entry of plan.entries) {
    if (entry.status !== 'map' || !entry.userId || !entry.contactId) continue
    try {
      await clerk.users.updateUser(entry.userId, {
        externalId: entry.contactId,
      })
      written += 1
    } catch (error) {
      failed += 1
      console.error(
        `[backfill:clerk-resend] failed to map ${entry.userId} -> ${entry.contactId}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  console.log(
    `[backfill:clerk-resend] wrote ${written} mapping(s), ${failed} failure(s)`,
  )
  if (failed > 0) throw new Error(`${failed} mapping write(s) failed`)
}

// `payload run` kills floating promises after module evaluation — top-level
// await is required (same lesson as the e2e seed and the article migration).
try {
  await run()
  process.exit(0)
} catch (err) {
  console.error('[backfill:clerk-resend] fatal:', err)
  process.exit(1)
}
