// `@clerk/backend`, NOT `@clerk/nextjs/server`. The re-export is the same
// function, but the Next package's ESM dist uses extensionless relative
// imports (`server/clerkClient.js` → `../app-router/server/utils`), which
// bundlers resolve and plain Node ESM — what `payload run` executes under —
// refuses with ERR_MODULE_NOT_FOUND. This script never runs inside Next, so
// it depends on the package that actually defines the client.
import { createClerkClient } from '@clerk/backend'
import { Resend } from 'resend'

import { rememberResendContact } from '../src/lib/email/resendContactMirror'
import {
  formatPlan,
  listAllResendContacts,
  mirrorTargets,
  planBackfill,
} from './lib/clerk-resend-mapping.mjs'

/**
 * One-shot backfill of the Clerk↔Resend contact mapping (#86).
 *
 * The webhook writes the Resend contact id to `external_id` at `user.created`
 * and mirrors it into Upstash Redis keyed by the Clerk user id. Every user who
 * signed up *before* that shipped has neither, and `user.deleted` carries no
 * email address — so without this script their contacts can never be cleaned
 * up. This gives them the link retroactively by matching primary email to an
 * existing Resend contact.
 *
 * ## Both stores, not just `external_id`
 *
 * `--apply` writes `external_id` for newly-matched users AND the Redis mirror
 * for every user with a known contact id — including users who were *already*
 * mapped. That asymmetry is deliberate and is the point of a second run: the
 * mirror shipped after `external_id` did, so an already-mapped user has the
 * Clerk-side link and no mirror, and the mirror is the store `user.deleted`
 * actually resolves through (`docs/AUTH.md`). Mirroring them is safe where
 * rewriting their `external_id` would not be — it only restates a link Clerk
 * already asserts. See `mirrorTargets` in
 * `scripts/lib/clerk-resend-mapping.mjs`.
 *
 * With Upstash unset the run still performs every `external_id` write and
 * reports the skipped mirror writes, rather than half-applying and exiting.
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
 *   payload run scripts/backfill-clerk-resend-mapping.ts -- --apply
 *
 * The `--` is load-bearing. `payload run` parses its own argv with minimist and
 * rebuilds the script's `process.argv` from the POSITIONAL arguments only, so a
 * bare `--apply` is consumed as an option to `payload` and never reaches the
 * `process.argv.includes('--apply')` check below — the script would silently do
 * a dry run while reporting the command that was meant to write.
 *
 * Requires `CLERK_SECRET_KEY` and `RESEND_API_KEY`; `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` are needed for the mirror half. Set
 * `RESEND_CONTACT_SEGMENT_ID` to whatever `captureContact` writes under, so
 * the read matches only contacts this app owns — see
 * {@link listAllResendContacts}.
 */

const apply = process.argv.includes('--apply')

/** Clerk's Backend API caps `getUserList` at 500 per page. */
const CLERK_PAGE_SIZE = 500

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

  // The mirror pass runs even when an external_id write failed above: the two
  // stores are independent, and a user who kept their old (correct) external_id
  // still benefits from having a mirror. Failures are counted, not thrown.
  let mirrored = 0
  let mirrorSkipped = 0
  for (const target of mirrorTargets(plan)) {
    const status = await rememberResendContact(target.userId, target.contactId)
    if (status === 'ok') mirrored += 1
    else mirrorSkipped += 1
  }

  console.log(
    `[backfill:clerk-resend] mirrored ${mirrored} contact id(s), ${mirrorSkipped} not written`,
  )
  if (mirrorSkipped > 0) {
    console.warn(
      '[backfill:clerk-resend] some mirror keys were not written — user.deleted ' +
        'will no-op for those users. Check UPSTASH_REDIS_REST_URL/TOKEN and re-run.',
    )
  }

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
