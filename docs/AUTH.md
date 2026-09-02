# Auth, gating & email capture (Clerk)

## Setup

- `@clerk/nextjs`; middleware lives in `src/proxy.ts` (Next 16 proxy
  convention), wrapped by `isClerkEnabled()` so missing keys never break
  boot. `<ClerkProvider>` mounts in the frontend layout under the same gate.
- Routes: `/sign-in`, `/sign-up` (catch-all Clerk components), `/account`.
- Header shows a signed-in-only `UserButton` chip (`HeaderUserButton`,
  mounted only when `isClerkEnabled()` — anonymous visitors and keys-off
  environments get the pre-auth header byte-identical). Sign-IN has no
  persistent header entry by design; gated-article CTAs are the door.
  "Manage account" navigates to `/account`, the one profile surface.
- Payload admin auth is **separate** (Payload Users) — Clerk never guards
  `/admin`.

## Gating model (server-side, §12)

- Posts carry `access.visibility = public | gated` plus dormant
  `requiredPlan` / `requiredFeature` fields (Clerk Billing seam).
- Enforcement happens in RSCs via `getViewer()` (`src/lib/auth/getViewer.ts`)
  - `canAccess(isAuthenticated, doc)` (`src/access/canAccess.ts`): gated
    bodies are excluded from the payload for anonymous viewers — a teaser +
    sign-in prompt renders instead. Client `<Protect>`-style components are
    UX only.
- `getViewer()` returns `{ isAuthenticated, userId }` (`userId` added #74). The
  Corvus chat route is the first consumer keying a rate limit by Clerk `userId`
  — anonymous visitors hit an IP-keyed free-taste gate + abuse limit, signed-in
  users a `userId`-keyed higher ceiling (see `docs/AI.md`).
- **Billing flip (do not build until asked):** enable Clerk Billing, replace
  the `canAccess` internals with plan/feature checks (`has({ plan })`), and
  the field seams light up. `// TODO(brandon): enable Clerk Billing` marks
  the seam.

## Email capture

- Two capture paths, one shared helper (`src/lib/email/captureContact.ts`
  — logs and swallows every failure; capture is never the caller's
  primary job):
  1. Clerk webhook → `POST /api/clerk/webhook` (svix signature verified
     with `CLERK_WEBHOOK_SIGNING_SECRET`) on sign-up.
  2. Contact form → explicit opt-in checkbox (unchecked by default) on
     the Messenger form; `/api/contact` captures only when the flag is
     set AND the message delivered. Never capture without that flag.
     Both land in the Resend contact list, segmented via
     `RESEND_CONTACT_SEGMENT_ID`. Respect the marketing consent field, and
     honor per-contact unsubscribe state before any broadcast ever sends.
     (Migrated from the SendGrid marketing list 2026-08-10 — SendGrid walls
     contact storage behind a separate paid Marketing Campaigns plan.)
- Payload transactional email (forgot-password etc.) rides the
  `@payloadcms/email-resend` adapter configured in `payload.config.ts`
  (active when `RESEND_API_KEY` is set).

## Contact hygiene: the Clerk↔Resend mapping (#86)

`POST /api/clerk/webhook` handles three events. Keeping a deleted user's
contact out of the audience, and following a primary-email change into it,
both need something neither event payload carries: a stable link from a Clerk
user to a Resend contact.

**Why a mapping is required rather than convenient.** Two measured facts:

- `user.deleted` carries only `{ deleted, id, object }` — there is **no email
  address in it**, so the contact cannot be looked up after the fact.
- A Resend contact has no external key, and its email is the URL selector.
  `contacts.update` PATCHes `/contacts/:emailOrId` with a body of only
  `unsubscribed`, `first_name`, `last_name` and `properties` (measured against
  the pinned `resend@6.18.1` dist), so **a contact's email cannot be renamed**.

So the link is stored before it is needed. It is stored **twice**, because one
of the two stores cannot serve the delete:

- **`external_id` on the Clerk user** — written at `user.created` via the
  Backend API (`clerkClient().users.updateUser`). This is the mapping for the
  _live_ user: visible in the Clerk dashboard, and what the backfill and
  `user.updated` read.
- **A Redis mirror** (`src/lib/email/resendContactMirror.ts`) — Upstash, keyed
  `clerk:resend-contact:<clerkUserId>`, no TTL. **This is the delete path's
  source of truth.**

**Why the mirror is not redundant.** The first cut of this work stored only
`external_id` and then read it back off the `user.deleted` payload. That
payload is `{ deleted, id, object }` and the Clerk user it hung on is already
gone, so the read was a guaranteed miss: every real delete delivery no-oped and
the contact survived — the exact hygiene gap this section exists to close. (The
unit test passed only because it fabricated `external_id` onto the delete
event.) The mirror outlives the Clerk user and is keyed by `data.id`, the one
field the delete payload does carry.

| Event          | Behavior                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.created` | `captureContact`, then write the contact id to `external_id` **and** the mirror. The `external_id` write is skipped when one is already set; the mirror write is not (it reconciles). |
| `user.deleted` | Resolve the contact from the **mirror** by `data.id`, remove it, then drop the mirror key. Payload `external_id` is a documented fallback. Unresolvable → 2xx no-op, distinct log.    |
| `user.updated` | If the primary email changed, create the new contact, then remove the old, then write the new id back to `external_id` **and** the mirror.                                            |

Every mapping write is best-effort: a failure logs and still acks, because
Clerk redelivers every non-2xx and a redelivery would re-run `captureContact`
against a contact that already exists.

**Mirror degradation modes**, all of which are 2xx no-ops rather than failures:

| State                                        | Delete path behavior                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Upstash env unset (local dev)                | Logs `unavailable` and no-ops; production also logs once at module warm-up. |
| Key missing (pre-mirror user, test delivery) | Logs `miss` and no-ops — the pre-#86 behavior, reached honestly.            |
| Redis unreachable or erroring                | Logs `error` and no-ops.                                                    |
| Keyspace lost entirely                       | Deletes stop cleaning up, loudly; re-runnable via the backfill.             |

`miss` and `unavailable` are deliberately distinguishable in the logs: the
first is an unmapped user, the second means deletes are silently leaving
contacts in the audience. The mirror key is dropped **only after** Resend
confirms the removal — the Clerk user is gone by then, so that key is the only
remaining record of which contact a retry would target.

Primary email is always resolved via `primary_email_address_id`, never
`email_addresses[0]`. The two coincide at sign-up but diverge on exactly the
multi-address accounts `user.updated` exists to follow.

**Delete, not suppress.** A Resend _suppression_ blocks all mail to an address
— including transactional mail such as a password reset. That makes it the
wrong tool for "this account is gone": if the person signs up again they are
silently unreachable. Audience removal is marketing-scoped and reversible, so
`user.deleted` deletes the contact. Suppression is not used anywhere in this
codebase.

**Ordering on an email change is the safety argument.** Because the SDK cannot
rename a contact, the change is create-new-then-remove-old, in that order. If
the create fails, the old contact is still in the audience and `external_id`
still points at it — the run is a no-op rather than a data loss. Redelivery is
safe: the second delivery reads the already-updated contact, sees the addresses
match, and stops before touching anything.

### Backfill

`scripts/backfill-clerk-resend-mapping.ts` gives pre-#86 users the mapping the
webhook now writes at sign-up, matching each user's primary email to an
existing Resend contact. It writes **both** stores: `external_id` for
newly-matched users, and a mirror key for every user with a known contact id —
including users who are _already_ mapped, who by definition have an
`external_id` and no mirror. Mirroring them is safe where rewriting their
`external_id` would not be: it only restates a link Clerk already asserts.

```bash
payload run scripts/backfill-clerk-resend-mapping.ts              # dry run
payload run scripts/backfill-clerk-resend-mapping.ts -- --apply   # write
```

The `--` in the second form is load-bearing — a bare `--apply` never reaches the
script; the script's docblock explains why.

**Dry run by default** — it prints a per-user plan and writes nothing without
`--apply`. It has no destructive mode: it never deletes a contact, never clears
an `external_id`, and never overwrites a mapping the webhook already made. The
rules (`scripts/lib/clerk-resend-mapping.mjs`) skip rather than guess whenever
a user has no primary email, no matching contact, an address two contacts
share, or a contact another Clerk user already claims — that last one because
two users pointed at one contact means the first `user.deleted` removes
somebody else's contact. Re-running is safe; a mapped user is `already-mapped`
next time — and still has their mirror key rewritten, which is what makes a
second run useful after the mirror shipped. Needs `CLERK_SECRET_KEY` and
`RESEND_API_KEY`, plus `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
for the mirror half (without them the run still does every `external_id` write
and reports the skipped mirror writes).

**The read is scoped to the app's own segment.** When
`RESEND_CONTACT_SEGMENT_ID` is set — the same env `captureContact` creates
contacts under — the backfill passes it to `contacts.list`, so the candidate
pool is only contacts this app created. An account-wide read could otherwise
match a Clerk user to a contact from an import or another product sharing the
Resend account, and that match does not stay a reporting mistake: it is written
to `external_id` and the mirror, and `user.deleted` resolves through the mirror
and **deletes** what it finds. With the env unset the app creates unsegmented
contacts, so there is no segment to filter by and the read stays account-wide —
the same optionality `captureContact` has. The `user.updated` and `user.deleted`
lookups need no equivalent: they address one contact directly by id or address
via `contacts.get`, never a list.

### Operational order (Brandon, Clerk dashboard)

The production endpoint must be subscribed to `user.deleted` / `user.updated`
**only after this ships** — subscribing first means deliveries against a
handler that ignores them. Dev is already subscribed and no-ops harmlessly.

1. Deploy the webhook change.
2. Run the backfill dry run, read the plan, then re-run with `--apply`.
3. In the Clerk dashboard, add `user.deleted` and `user.updated` to the
   **production** endpoint's subscribed events.
4. Send a dashboard test delivery for each and confirm the log lines.

Note for step 4: a dashboard test delivery names a user id that was never
mirrored, so the expected result is the distinct `mirror: miss` no-op log line,
not a Resend call. A `mirror: unavailable` line instead means Upstash is not
configured for that environment — fix that before trusting the delete path.
