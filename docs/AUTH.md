# Auth, gating & email capture (Clerk)

## Setup

- `@clerk/nextjs`; middleware lives in `src/proxy.ts` (Next 16 proxy
  convention), wrapped by `isClerkEnabled()` so missing keys never break
  boot. `<ClerkProvider>` mounts in the frontend layout under the same gate,
  **from a client module** (`ClerkClientProvider`), never as `@clerk/nextjs`'s
  server `ClerkProvider` rendered from the layout directly. Loading
  `@clerk/nextjs` in client code renames Clerk's provider as a side effect, so
  rendered from the layout its name depended on what that server process had
  already loaded. A cold server then resumed the prerendered shell with a
  different name from the one the build recorded, and React rendered the
  whole page on the client instead (BP-PORTFOLIO-S;
  `ClerkClientProvider.resume.test.tsx` pins both halves).
- Routes: `/sign-in` (Clerk's prebuilt `<SignIn>`, catch-all), `/sign-up`
  (the site's own form on Clerk's `useSignUp()` hooks, #377, below),
  `/sign-up/sso-callback` (where Google returns to), `/account` (Clerk's
  `<UserProfile>`, catch-all, so a sub-page such as `/account/security`
  loads directly, #391).
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
    sign-in prompt renders instead. What client components may and may not
    do: `docs/SECURITY.md` § End-user authorization (Clerk).
- `getViewer()` returns `{ isAuthenticated, userId }` (`userId` added #74). The
  Corvus chat route is the first consumer keying a rate limit by Clerk `userId`
  — anonymous visitors hit an IP-keyed free-taste gate + abuse limit, signed-in
  users a `userId`-keyed higher ceiling (see `docs/AI.md`).
- **Billing flip (do not build until asked):** enable Clerk Billing, replace
  the `canAccess` internals with plan/feature checks (`has({ plan })`), and
  the field seams light up. `// TODO(brandon): enable Clerk Billing` marks
  the seam.

## Email capture

- Three capture paths, one shared helper (`src/lib/email/captureContact.ts`,
  which never throws and returns an outcome only the newsletter route reads;
  capture is never the other two callers' primary job, so they ignore it).
  It looks the address up by email first, because Resend documents no
  answer for a create on an existing contact (its OpenAPI spec lists only a
  201; one user report says it returns a plain success, resend-node#494),
  and a lookup of an absent one answers `404 not_found` (measured
  2026-11-21). A new address is created in the segment. An existing contact
  is added to `RESEND_CONTACT_SEGMENT_ID` when it is not already in it, on
  every path (#406), an unsubscribed one included: segment membership does
  not subscribe it, because a broadcast skips globally unsubscribed
  contacts. Its names and its opt-out are left as they are, except on the
  newsletter path below:
  1. Sign-up → explicit opt-in checkbox (unchecked by default) inside the
     sign-up form, then the Clerk webhook `POST /api/clerk/webhook` (svix
     signature verified with `CLERK_WEBHOOK_SIGNING_SECRET`), which captures
     only a sign-up that ticked it (#362, below).
  2. Contact form → explicit opt-in checkbox (unchecked by default) on
     the Messenger form; `/api/contact` captures only when the flag is
     set AND the message delivered.
  3. Newsletter Signup block → `/api/newsletter` (#367). The form is one
     email field whose only job is subscribing, so submitting it is the
     opt-in; there is no checkbox. Single opt-in, like the contact form's
     box: no confirmation email, so nothing proves the visitor owns the
     address, which sign-up does (Clerk's email code, or Google).
     **A reader who unsubscribed may rejoin here** (Brandon, on #404; #407):
     an existing contact with `unsubscribed: true` is updated to
     `unsubscribed: false` and read back (Resend's docs never say a `false`
     re-subscribes, so a contact still unsubscribed counts as a failure, not
     a subscription), then put in the segment. If Resend ever accepted the
     update without applying it, every once-unsubscribed address would get
     the 503 while a new one gets the success, so the failure would show
     which addresses had left; Sentry's `resubscribe` stage is where that
     would first appear. Only this path does it;
     the webhook honours the sign-up's `mailingListOptIn` choice and the
     contact form its box, and neither clears an opt-out. **The consent gap
     is wider for it:** with no confirmation email, anyone can submit an
     address, and now that includes putting back on the list someone who
     chose to leave. The rate limit and Turnstile on this route are what
     bound that. Its success answer is the same for a new address and an
     existing one, subscribed or not. When Resend refuses a write or cannot
     be reached it answers 503 "Couldn't subscribe you right now. Please try
     again later.", the same for every address, and reports the failed stage
     to Sentry with no address (#409). Guards
     shared with `/api/contact` (`src/lib/security/publicFormGuard.ts`).
     The capture rule:
     `docs/SECURITY.md` § Consent and analytics data.
     All three land in the Resend contact list, segmented via
     `RESEND_CONTACT_SEGMENT_ID`. What a broadcast must honour:
     `docs/SECURITY.md` § Consent and analytics data.
     (Migrated from the SendGrid marketing list 2026-08-10 — SendGrid walls
     contact storage behind a separate paid Marketing Campaigns plan.)
- Payload transactional email (forgot-password etc.) rides the
  `@payloadcms/email-resend` adapter configured in `payload.config.ts`
  (active when `RESEND_API_KEY` is set).

### The sign-up opt-in (#362)

Until #362 every new account was added to the list. Now only a ticked box
joins, with the same wording as the contact form
(`MAILING_LIST_OPT_IN_LABEL`, `src/lib/email/mailingListOptIn.ts`).

- **Where the box is.** Inside the sign-up form
  (`src/components/auth/SignUpFormView.tsx`), under the heading and before
  both ways of signing up, so someone using Google meets it before the
  Google button. The form reads it at the moment of submit and sends it as
  `unsafeMetadata: { mailingListOptIn: <boolean> }` on the request that
  starts the sign-up; Clerk copies it onto the created user. **No Clerk
  dashboard setting is involved**, on any instance. How the form does that:
  "The custom sign-up form" below.
- **Where it is read.** `user.created` arrives with `unsafe_metadata`, and
  `hasMailingListOptIn` accepts only a literal `true`. Without it, and with no
  `external_id` mapping in the payload, the handler returns before any Resend,
  Clerk or Redis call: no contact, no `external_id`, no mirror key, on the
  first delivery and on a redelivery. (With a mapping and no opt-in it writes
  the Redis mirror only; see "Existing members" below.)
- **Fail-closed by construction.** A sign-up that never passes the box is not
  opted in: a social sign-in started on `/sign-in` that creates the account,
  an account made in the Clerk dashboard, a client that sends no metadata.
  A Google sign-up on `/sign-up` that turns out to be an existing account is
  signed in, and the list is not touched for it.
  The box shows on the first step only, because the metadata goes out with
  the request that starts the sign-up; on the email-code step it could be
  ticked to no effect.
- **Why `unsafe_metadata` is acceptable here.** The signed-in user can write
  it from the browser, so it must never carry an entitlement. For this flag
  that is the point: the only thing a visitor can do with it is opt
  themselves in or out. A later change to it does nothing by itself, because
  `user.updated` acts only on accounts that already have a mapping.
- **Existing members are untouched.** Nothing in #362 removes or re-asks
  anyone. An account already on the list is recognised by its `external_id`
  mapping, not by a flag it predates, so its `user.updated` and
  `user.deleted` behave as before, and a `user.created` delivery whose payload
  carries its `external_id` reconciles the mirror without capturing again.
- **A replayed pre-#362 `user.created` no longer repairs anything.** A webhook
  replay resends the original payload, which for an account created before
  the opt-in has neither the flag nor an `external_id`, so it is a no-op: the
  handler cannot tell it from a new sign-up that declined, and it must not
  infer consent from an address. The same goes for a member whose
  `external_id` was written after the event fired (by the handler itself, or
  by the backfill): the id is on the live Clerk user, not in the replayed
  payload, so replaying does not repair their mirror. **The backfill repairs
  the second case** (`scripts/backfill-clerk-resend-mapping.ts`, below): it
  reads each user's `external_id` from Clerk when it plans and rewrites the
  mirror from that plan (so run it when no primary email is changing mid-run).
  It maps an unmapped user to the one Resend contact at their current primary
  address **only when that account's sign-up recorded the opt-in** (#374), so
  it does not repair the first: an unmapped pre-#362 account has no flag and
  is reported `not-opted-in`. Linking one by hand means setting its
  `external_id` to the contact's id in the Clerk dashboard, as in the repair
  below. Brandon
  decided no legacy run was needed (2026-11-18, #374).
- **What the backfill cannot repair.** It matches on the account's current
  primary email. A legacy member captured at address A whose mapping writes
  both failed, and who has since changed to address B, has a contact at A the
  backfill reports as `no-match` and leaves alone. Before #362 a replay of
  the original event (which carried A) could re-link it. Now it is a manual
  repair: find the contact at A in Resend, confirm it is that person's (the
  Clerk user's previous address), then set the Clerk user's `external_id` to
  the contact id in the Clerk dashboard. That edit fires `user.updated`, and
  the webhook then does its own sync: it finds the contact at A, sees the
  account's address is B, creates the contact at B, removes the one at A, and
  writes the new id to `external_id` and the mirror. Each of those steps is
  best-effort: a failure is logged (`[clerk-webhook]`, `[captureContact]` or
  `[resend-contacts]`) and the handler carries on or returns early, so any of
  them may not have happened. Do not assume the result; work towards this end
  state, in this order:

  **End state:** exactly one contact for this person in Resend, at B; the
  Clerk user's `external_id` is that contact's id; the Redis key
  `clerk:resend-contact:<clerk user id>` is that same id.

  1. **Wait for the `user.updated` delivery to finish.** Do nothing below, and
     do not run the backfill, while it is in flight.
  2. **Confirm the contact at B exists in Resend, and note its id.** If it
     does not, or you cannot tell (creating it was not attempted or failed,
     and the handler returned without touching anything else), **leave the
     contact at A alone**: it is the only
     one, and the mapping still points at it. Get B created first, by saving
     the Clerk user again so `user.updated` re-runs, and start again from
     step 1.
  3. **Only once B exists, check A.** If the contact at A is still in Resend
     (its removal was not attempted or failed), remove it by hand.
  4. **Make `external_id` B's id.** Whatever it holds now, and whether or not
     it agrees with the Redis key: both can hold A's deleted id if both writes
     failed. If it is not B's id, set it in the Clerk dashboard and confirm
     the edit took. That edit fires `user.updated` once more; the contact's
     address now matches the account's, so the handler changes nothing.
  5. **Make the Redis key B's id.** If it is not, run the backfill now, after
     step 4 and not before: it writes the mirror from the `external_id` it
     reads when it plans, so run on a stale `external_id` it would copy a
     deleted contact's id over the mirror. Then read the key again and
     confirm it is B's id.

  Skipping the order has a cost in each direction: removing A before B
  exists deletes the person's only contact, and a mirror left on A's id
  means a later account deletion removes nothing and leaves B in the
  audience.

- **Proven where.** Unit tests pin what the form hands to Clerk's hooks for
  each state of the box, and the webhook tests pin what each payload does.
  The hop between them, clerk-js putting the value in the request, is
  observed in a browser by `e2e/sign-up-opt-in.spec.ts`, which intercepts the
  request and creates no account. **Not proven by any test:** that Clerk
  stores the value across the trip to Google and delivers it on a real
  `user.created` (`docs/JOURNEYS.md`, "Sign up").

### The custom sign-up form (#377)

`/sign-up` is the site's own markup on Clerk's hooks, so the opt-in is a
field of the form and not a box beside Clerk's card. Clerk still owns the
password, the email code, the session and the bot check.

- **Pieces.** `SignUpFormView` is the markup, free of Clerk (so every state
  has a Storybook story, `Auth/SignUpForm`). `SignUpForm` drives it from
  `useSignUp()`. `SignUpSsoCallback` is the page Google returns to and mounts
  Clerk's `<HandleSSOCallback />`.
- **Email and password.** `signUp.password({ emailAddress, password,
unsafeMetadata })`, then `signUp.verifications.sendEmailCode()`, the
  six-digit code step in the same card, `verifyEmailCode()`, `finalize()`.
- **Google.** `signUp.sso({ strategy: 'oauth_google', unsafeMetadata, … })`
  with `/sign-up/sso-callback` as the return page.
- **The tick is read at submit, and the form locks.** The view reads the
  checkbox from the form's own data in the click or submit event and hands
  it up as a boolean; the same event disables the whole `<fieldset>`, the box
  included, until Clerk answers, and a second request cannot start beside the
  first. On an error the form unlocks and the next submit reads the box
  again. This closes the limit #373 recorded for Clerk's prebuilt form, which
  reported no submit event. "Use a different email" calls `signUp.reset()`,
  so an abandoned attempt's tick does not carry into the next one.
- **A second submit updates the same attempt.** When a sign-up attempt
  already exists in the browser (an earlier submit that Clerk accepted but
  that was not finished), clerk-js sends `signUp.password()` as an update to
  it, not a new attempt [source: clerk-js `SignUp.ts`, read 2026-11-18;
  Clerk's docs do not say]. The update carries `unsafeMetadata` too, so the
  box as it is at the latest submit is what clerk-js sends. That Clerk's
  server then replaces the earlier answer with it is not observed by any
  test. If Clerk refuses such an update, or it leaves the attempt somewhere
  the form cannot take it, the form discards the attempt (`signUp.reset()`)
  and keeps the reason on screen, so the next submit is a new attempt and not
  another update to a stuck one.
- **The card holds its step while a request is in flight.** Clerk's sign-up
  passes through other states on the way (it needs a code while the code is
  still being sent; it is complete a moment before the page changes), and the
  card does not follow them until the request settles. After a successful
  sign-in, and after Clerk accepts a Google sign-up, the form stays locked
  for the navigation; if the page is still there ten seconds later it unlocks
  and says it is taking longer than expected (nothing is known to have
  failed).
- **No state is a dead end.** The form unlocks on every Clerk error. If Clerk
  has created the account but the visitor is not signed in yet (the sign-in
  failed, or never navigated, or the page was reloaded in between), the card
  says "Your account is ready" and offers "Continue" (which calls the sign-in
  only) and the sign-in page; it does not show the first step, which would
  start a second sign-up for an address that now has an account. If the visitor
  comes back from Google and Clerk's callback handler sends them nowhere
  (it calls none of its handlers for a sign-up that still needs a field this
  form does not have), the callback page says after ten seconds that it is
  taking longer than expected and offers "Start again" and "Sign in" (Clerk
  may still be finishing a bot check or a transfer, so it neither claims
  failure nor redirects); it logs
  `[sign-up] sso callback unresolved` with the missing field names. "Start
  again" then lands on a form that says why ("A dashboard change can outrun
  the form", below).
- **The code step says so when the first code could not be sent** (#384).
  The card moves to the code step because Clerk's sign-up calls for a code,
  whether or not the email went out. It says "Enter the code we sent to …"
  only when this page sent one and Clerk accepted the send. If the send
  failed, it reads "We couldn't send a code to …" with Clerk's reason, until
  "Send a new code" succeeds. If the page did not see a send at all (a
  reload on the code step, or a return from Google with only the email left
  to verify), it claims neither: "Enter the verification code for …. If you
  don't have one, choose 'Send a new code'."
- **A signed-in visitor never sees the form** (#384). The page redirects
  them on the server to the `redirect_url` target when it is a path on this
  site, else the home page: where a finished sign-up lands, and what Clerk's
  prebuilt `<SignUp />` did before #377. Only a path is followed there: the
  server is given no origin to compare with, so an absolute `redirect_url`
  goes to the home page even when it is this site's (the form, in the
  browser, accepts one at the page's own origin). `/sign-up/sso-callback` does not redirect: a visitor Google
  has just signed in must reach Clerk's handler there.
- **`redirect_url` is ours to honour now.** Gated articles and Corvus link to
  `/sign-in?redirect_url=…`, and the target follows the visitor to
  `/sign-up`. Clerk's prebuilt form checked it; this form does, with
  `safeRedirectPath` (`src/lib/auth/safeRedirect.ts`): a path on this site,
  or a same-origin URL reduced to its path, and the home page for anything
  else. The callback page checks it again.
- **Bot check.** The form carries Clerk's `<div id="clerk-captcha" />` slot;
  clerk-js runs the check inside `signUp.password()` and `signUp.sso()`.
  `<HandleSSOCallback />` shows a challenge raised on the way back from
  Google. **Do not press "update" to "Challenge suspicious sign-ups" in the
  Clerk dashboard without re-testing both sign-up paths; Clerk says that
  update cannot be reversed.**
- **The password hint is a constant.** "At least 15 characters" comes from
  `PASSWORD_MIN_LENGTH` in `SignUpForm.tsx`, because Clerk's hooks expose no
  instance settings. 15 is production's value (measured 2026-11-18). If the
  dashboard value changes, change the constant; a too-short password is
  refused by Clerk either way, and its message shows under the field.
- **A dashboard change can outrun the form.** It has fields for email and
  password only. If a sign-up requirement is switched on in the Clerk
  dashboard (names, phone, legal consent), the form says it could not finish
  and logs `[sign-up] unsupported requirement` with the missing fields; the
  field has to be built before the setting goes live. That holds for both
  routes (#384). By email, the form sees it in the answer to its own request.
  By Google, the visitor comes back with the Google account verified and the
  field still missing; the form recognises that state when it loads, says it
  could not finish with Google, and discards the attempt, so the next choice
  starts a new one. An attempt missing only the email or the password is
  kept, since the first step collects those. A trip to Google the visitor abandoned is not treated
  this way: Google verified nothing, and the first step shows as before.
- **Sign-in is still Clerk's prebuilt `<SignIn>`** by Brandon's decision
  (2026-11-18); making it custom is its own issue. The optional catch-all
  under `/sign-up` stays so the prebuilt sign-in's links into `/sign-up/…`
  land on the form.
- **`@clerk/nextjs` must stay at 7.9.13 or later**: that is the first release
  exporting `<HandleSSOCallback />`.

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

| Event          | Behavior                                                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.created` | Only for a sign-up that opted in (#362): `captureContact`, then write the contact id to `external_id` **and** the mirror. The `external_id` write is skipped when one is already set; the mirror write is not (it reconciles, opt-in or not). No opt-in and no mapping → 2xx no-op. |
| `user.deleted` | Resolve the contact from the **mirror** by `data.id`, remove it, then drop the mirror key. Payload `external_id` is a documented fallback. Unresolvable → 2xx no-op, distinct log.                                                                                                  |
| `user.updated` | If the primary email changed, create the new contact, then remove the old, then write the new id back to `external_id` **and** the mirror.                                                                                                                                          |

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

`scripts/backfill-clerk-resend-mapping.ts` repairs the mapping the webhook
writes at sign-up. An opted-in user with no `external_id` is matched to the
existing Resend contact at their primary email. It writes **both** stores:
`external_id` for newly-matched users, and a mirror key for every user with a
known contact id — including users who are _already_ mapped, who by
definition have an `external_id` and no mirror. Mirroring them is safe where
rewriting their `external_id` would not be: it only restates a link Clerk
already asserts.

```bash
payload run scripts/backfill-clerk-resend-mapping.ts              # dry run
payload run scripts/backfill-clerk-resend-mapping.ts -- --apply   # write
```

The `--` in the second form is load-bearing — a bare `--apply` never reaches the
script; the script's docblock explains why.

**Dry run by default** — it prints a per-user plan and writes nothing without
`--apply`. It has no destructive mode: it never deletes a contact, never clears
an `external_id`, and never overwrites a mapping the webhook already made.

**It maps opted-in accounts only** (Brandon, 2026-11-18, #374): an unmapped
account is matched only when its `unsafeMetadata.mailingListOptIn` is `true`,
the same fail-closed rule the webhook applies at `user.created`. Any other
unmapped account — the box left unticked, or no field at all because it never
saw the box — is reported `not-opted-in` before any matching, and a Resend
contact at its address is left as it is: still on the list, with no account
owning it, so that account's deletion or email change never touches it. An
_already-mapped_ account is not re-checked; its link predates the question and
its mirror is still rewritten.

The rules (`scripts/lib/clerk-resend-mapping.mjs`) skip rather than guess
whenever a user has no primary email, no matching contact, an address two
contacts share, or a contact another Clerk user already claims — that last one because
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
