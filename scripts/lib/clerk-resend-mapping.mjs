/**
 * Matching rules for the one-shot Clerk↔Resend mapping backfill (#86).
 *
 * `scripts/backfill-clerk-resend-mapping.ts` gives every pre-#86 Clerk user
 * the `external_id` the webhook now writes at sign-up, by matching each user's
 * primary email to an existing Resend contact. The webhook's whole hygiene
 * story depends on that link: `user.deleted` carries no email, so an unmapped
 * user's contact can never be cleaned up.
 *
 * The rules live in their own module for the same reason
 * `scripts/lib/orphan-guard.mjs` does: the backfill script ends in a top-level
 * `await run()` and cannot be imported without executing, so the logic that
 * decides which contact belongs to which user would otherwise be the one part
 * of a write-to-production script with no test.
 *
 * Everything here is pure. It takes already-fetched users and contacts and
 * returns a plan; it performs no I/O and never decides to delete anything —
 * the backfill has no destructive mode at all.
 *
 * ## Why matching is by email, and why that is safe *here*
 *
 * Email is a bad long-term key — it is exactly the thing `user.updated` exists
 * to change, which is why the runtime path uses ids. But at backfill time it
 * is the only shared field the two systems have, and the contacts were created
 * *from* those Clerk users by the same webhook, so the correspondence is real
 * rather than inferred. The risk is not staleness, it is collision, and the
 * three refusals below are what keep a collision from writing a wrong link.
 *
 * @module
 */

/**
 * Casefold an email for comparison.
 *
 * @param value - A raw email address, or anything else.
 * @returns The trimmed, lowercased address, or `undefined` when unusable.
 *
 * @remarks The local part of an address is technically case-sensitive, but no
 * real provider treats it that way, and Clerk and Resend each echo whatever
 * casing they were given. Comparing verbatim would leave `Ada@x.test` and
 * `ada@x.test` looking like different people and silently produce a `no-match`
 * for a user whose contact is right there.
 */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * A Clerk user's primary email address.
 *
 * @param user - A Clerk Backend API `User` resource (camelCase).
 * @returns The normalized primary address, or `undefined` when there is none.
 *
 * @remarks Resolves `primaryEmailAddressId` and falls back to the first
 * address only when that id is absent or dangling — the same rule the webhook
 * applies to the snake_case webhook payload.
 *
 * **Why this stays a near-duplicate of `primaryEmail` in the webhook route.**
 * A 2026-09 standards review flagged the pair. The shared part is four lines
 * ("the marked address, else the first"); everything around it differs. The
 * casing difference is real — the Backend SDK deserializes to camelCase
 * resources while the webhook receives raw snake_case JSON — and so is the
 * normalization: this function casefolds for *matching*, whereas the route
 * must hand Resend the address exactly as Clerk spelled it. The remaining
 * obstacle is the module boundary: this file is `.mjs` so it stays runnable
 * and testable under plain node (same reason as `scripts/lib/orphan-guard.mjs`),
 * and a shared helper would have to live in `src/` as TypeScript — which
 * either breaks that property or inverts the dependency and makes `src/`
 * import from `scripts/`. Four lines is not worth either, so the duplication
 * is deliberate and recorded here rather than silently tolerated.
 */
export function primaryEmailOf(user) {
  const addresses = Array.isArray(user?.emailAddresses)
    ? user.emailAddresses
    : []
  const primaryId = user?.primaryEmailAddressId
  const primary = primaryId
    ? addresses.find((entry) => entry?.id === primaryId)
    : undefined
  const chosen = primary ?? addresses[0]
  return normalizeEmail(chosen?.emailAddress)
}

/**
 * Index Resend contacts by normalized email.
 *
 * @param contacts - Resend contact records (`id` plus `email`).
 * @returns `byEmail` (unambiguous matches only) and `ambiguous` (the addresses
 * that appeared more than once, which are deliberately left unmatchable).
 *
 * @remarks Resend treats an address as unique within the audience, so a
 * duplicate here means something already went wrong — a partial import, a
 * manual add. Guessing which of two contacts a user owns would write a link
 * that looks authoritative and is 50% wrong, and the wrong one would later be
 * deleted by `user.deleted`. Refusing costs a line of output.
 */
export function indexContactsByEmail(contacts) {
  const byEmail = new Map()
  const ambiguous = new Set()

  for (const record of contacts ?? []) {
    const email = normalizeEmail(record?.email)
    const id = typeof record?.id === 'string' ? record.id : undefined
    if (!email || !id) continue

    const seen = byEmail.get(email)
    if (seen && seen !== id) {
      ambiguous.add(email)
      continue
    }
    byEmail.set(email, id)
  }

  for (const email of ambiguous) byEmail.delete(email)

  return { byEmail, ambiguous: [...ambiguous].sort() }
}

/**
 * Decide what the backfill should do for every Clerk user.
 *
 * @param users - Clerk Backend API `User` resources.
 * @param contacts - Resend contact records (`id` plus `email`).
 * @returns `entries` in input order, plus a `summary` count per status.
 *
 * @remarks One entry per user, each carrying exactly one status:
 *
 * - `already-mapped` — `externalId` is set. Skipped, never overwritten: the
 *   backfill repairs users the webhook missed, it does not second-guess links
 *   the webhook made.
 * - `no-primary-email` — nothing to match on.
 * - `no-match` — no contact carries this address. Expected and benign: the
 *   user never opted in, or their contact was already removed.
 * - `ambiguous` — two contacts share the address (see
 *   {@link indexContactsByEmail}).
 * - `conflict` — the matched contact is already another user's `externalId`.
 *   Writing it would point two Clerk users at one contact, and the first
 *   `user.deleted` would then orphan the other. This is the check that makes
 *   email matching safe.
 * - `map` — the write to perform.
 *
 * Contacts claimed by `already-mapped` users are reserved *before* any
 * matching happens, so a conflict is detected regardless of user order.
 */
export function planBackfill(users, contacts) {
  const { byEmail, ambiguous } = indexContactsByEmail(contacts)
  const ambiguousSet = new Set(ambiguous)
  const list = users ?? []

  // Pass 1: every contact id an existing mapping already spoken for.
  const claimed = new Map()
  for (const user of list) {
    const externalId = user?.externalId
    if (typeof externalId === 'string' && externalId.length > 0) {
      claimed.set(externalId, user.id)
    }
  }

  const entries = []
  for (const user of list) {
    const userId = user?.id
    const email = primaryEmailOf(user)
    // `contactId` is present on every entry (undefined where there is none) so
    // consumers get one uniform shape rather than a union to narrow.
    const base = { userId, email, contactId: undefined }

    if (typeof user?.externalId === 'string' && user.externalId.length > 0) {
      entries.push({
        ...base,
        status: 'already-mapped',
        contactId: user.externalId,
      })
      continue
    }
    if (!email) {
      entries.push({ ...base, status: 'no-primary-email' })
      continue
    }
    if (ambiguousSet.has(email)) {
      entries.push({ ...base, status: 'ambiguous' })
      continue
    }

    const contactId = byEmail.get(email)
    if (!contactId) {
      entries.push({ ...base, status: 'no-match' })
      continue
    }

    const claimedBy = claimed.get(contactId)
    if (claimedBy && claimedBy !== userId) {
      entries.push({ ...base, status: 'conflict', contactId, claimedBy })
      continue
    }

    claimed.set(contactId, userId)
    entries.push({ ...base, status: 'map', contactId })
  }

  const summary = {
    total: entries.length,
    map: 0,
    'already-mapped': 0,
    'no-primary-email': 0,
    'no-match': 0,
    ambiguous: 0,
    conflict: 0,
  }
  for (const entry of entries) summary[entry.status] += 1

  return { entries, summary }
}

/**
 * The `(userId, contactId)` pairs whose Redis mirror the backfill should write.
 *
 * @param plan - The result of {@link planBackfill}.
 * @returns One entry per user with a known contact id, in plan order.
 *
 * @remarks **Deliberately wider than the `map` set.** `already-mapped` users
 * are included, and they are the whole reason this function exists: the mirror
 * shipped after `external_id` did, so every user the webhook or an earlier
 * backfill run already mapped has an `external_id` and *no mirror* — and the
 * mirror is what `user.deleted` resolves through. Restricting the mirror write
 * to newly-mapped users would leave exactly the pre-existing population
 * undeletable, which is the population this backfill exists to repair.
 *
 * Writing the mirror is safe where writing `external_id` would not be: it is
 * a copy of a link that already exists, keyed by user id, so it can only ever
 * restate what Clerk already says. The refusals in {@link planBackfill} still
 * do all the deciding — a status that produced no contact id produces no
 * mirror write here either.
 */
export function mirrorTargets(plan) {
  const targets = []
  for (const entry of plan?.entries ?? []) {
    if (entry.status !== 'map' && entry.status !== 'already-mapped') continue
    if (!entry.userId || !entry.contactId) continue
    targets.push({ userId: entry.userId, contactId: entry.contactId })
  }
  return targets
}

/**
 * Render a plan as human-readable lines.
 *
 * @param plan - The result of {@link planBackfill}.
 * @param options - `apply` selects the imperative wording for the write mode.
 * @returns Lines to print, one per user plus a summary block.
 *
 * @remarks The per-user line is the point of the dry run: this script's whole
 * safety model is that Brandon reads the plan before passing `--apply`, so
 * every decision has to be legible without cross-referencing anything.
 */
export function formatPlan(plan, options = {}) {
  const apply = options.apply === true
  const lines = []

  for (const entry of plan.entries) {
    const who = `${entry.userId ?? '(no id)'} <${entry.email ?? 'no primary email'}>`
    switch (entry.status) {
      case 'map':
        lines.push(
          `${apply ? 'MAP    ' : 'PLAN   '} ${who} -> ${entry.contactId}`,
        )
        break
      case 'already-mapped':
        // The external_id is left alone, but the mirror is still (re)written —
        // see `mirrorTargets`. Saying so keeps the dry run honest about the
        // one write this status does produce.
        lines.push(
          `SKIP    ${who} already mapped to ${entry.contactId}` +
            `${apply ? ' (mirror written)' : ' (mirror would be written)'}`,
        )
        break
      case 'no-primary-email':
        lines.push(`SKIP    ${who} no primary email address`)
        break
      case 'no-match':
        lines.push(`SKIP    ${who} no Resend contact with this address`)
        break
      case 'ambiguous':
        lines.push(`SKIP    ${who} multiple Resend contacts share this address`)
        break
      case 'conflict':
        lines.push(
          `SKIP    ${who} contact ${entry.contactId} already mapped to ${entry.claimedBy}`,
        )
        break
      default:
        lines.push(`SKIP    ${who} unrecognised status ${entry.status}`)
    }
  }

  const s = plan.summary
  lines.push('')
  lines.push(
    `${s.total} users · ${s.map} to map · ${s['already-mapped']} already mapped · ` +
      `${s['no-match']} unmatched · ${s['no-primary-email']} without email · ` +
      `${s.ambiguous} ambiguous · ${s.conflict} conflicting · ` +
      `${mirrorTargets(plan).length} mirror key(s)`,
  )
  lines.push(
    apply
      ? 'Applying: writing external_id for the mapped users above, plus a Redis mirror key for every user with a known contact id.'
      : 'Dry run: nothing was written — no external_id, no mirror keys. Re-run with --apply to write these.',
  )

  return lines
}

/** Resend's contact list endpoint pages by cursor. */
const RESEND_PAGE_SIZE = 100

/**
 * Every Resend contact this app may act on, walked page by page.
 *
 * @param resend - A Resend client (only `contacts.list` is used).
 * @returns All contacts, as `id` plus `email` records.
 *
 * @remarks Reads the whole audience rather than looking each user up by
 * address. A per-user `contacts.get` would be one HTTP call per user against a
 * rate-limited API, and would also lose the duplicate-address detection that
 * makes the match safe — a single-address lookup cannot see that a second
 * contact shares it.
 *
 * **Scoped to `RESEND_CONTACT_SEGMENT_ID` when it is set.** `captureContact`
 * creates every contact this app owns with `segments: [{ id }]` under that
 * env, so an account-wide list can match a Clerk user to a contact the app
 * never created — an imported list, another product sharing the Resend
 * account. That match is not merely wrong: it is written into `external_id`
 * and the Redis mirror, and `user.deleted` later resolves through the mirror
 * and DELETES whatever it finds. Scoping the read is what keeps the blast
 * radius of a bad match inside this app's own segment.
 *
 * Optional for the same reason the segment itself is: with the env unset,
 * `captureContact` creates unsegmented contacts and there is no segment to
 * filter by, so the account-wide read is the correct — and only — behavior.
 *
 * Lives here, with the client injected, so a test can PROVE the data flow —
 * that the `segmentId` reaching `contacts.list` is the one from
 * `RESEND_CONTACT_SEGMENT_ID` — against a mocked client, instead of grepping
 * the script's source text for the right spelling.
 */
export async function listAllResendContacts(resend) {
  const contacts = []
  const segmentId = process.env.RESEND_CONTACT_SEGMENT_ID
  let after

  for (;;) {
    const { data, error } = await resend.contacts.list({
      limit: RESEND_PAGE_SIZE,
      ...(segmentId ? { segmentId } : {}),
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
