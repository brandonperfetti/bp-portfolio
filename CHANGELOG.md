# Changelog

What each production release of brandonperfetti.com changed, newest first.
Each entry is written for someone deciding whether the release affects them:
a visitor, the CMS admin, an external MCP client, or a developer on this
repository. An audience a release does not reach is left out of its entry.

Versions are dates: `vYYYY.MM.DD`, the Pacific-time date the release PR was
merged into `master`; a later release on the same day adds `.1`, then `.2`.
Each version is an annotated tag on that release's merge commit.
`package.json` stays at `4.0.0`. Releases before `v2026.11.17` are not listed
here; each one's release PR body is its record. How an entry is written and
when the tag is made: [`docs/WORKFLOW.md` § Releases](docs/WORKFLOW.md#releases).

## v2026.11.27

Automatic Analytics grants now stay in memory, and the site improves
CMS reads, article navigation and Corvus context.
Release PR [#486](https://github.com/brandonperfetti/bp-portfolio/pull/486) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.27).

**Visitors**

- Automatic Analytics grants in regions that do not ask are now held in
  memory. Explicit cookie choices still persist. The release removes older
  stored automatic grants that match the recorded marker and grant shape
  (#375, #478, #484).
- Forms load Turnstile on first focus. The cookie dialog names the services
  that load independently of Analytics. The lead article cover loads
  eagerly, prose measures at most 65ch, and lighter-theme link and badge
  colours use updated contrast tokens (#477, #479, #469, #482, #466).
- Explorer filters follow links to the current URL. Corvus can name its
  host page and retrieve published page text and owner-written summaries
  of private repositories (#453, #460, #463, #465).

**CMS operators and MCP users**

- Full-list reads return all matching CMS rows. Publish-state changes
  refresh dependent cached reads, and non-moving drafts can be saved
  without tripping the unpublish guard (#441, #450, #467).
- The cover pilot uses the approved imagery profile. Cover history
  records the GPT Image 2 cover used for post 62 (#439, #474).
- Operators can run the REST and MCP publish-to-sitemap freshness probe.
  Both modes passed on staging. Production execution remains a separate
  owner decision (#473, #485).

**Developers**

- pnpm is pinned to 12.16.1 and local servers use ports 6000–6029.
  Syntax highlighting now uses refractor 5, and Partial Prefetching is
  explicitly disabled while the current behavior is retained
  (#472, #447, #471, #440).
- The Corvus OpenAI fallback is now `gpt-5.6-luna` when
  `AI_CHAT_MODEL` is unset (#457).
- The cut adds the read-only CMS Domain Agent and tightens several
  consent, explorer and integration test fixtures (#459, #442, #444,
  #445, #448, #449).

**Known limits.** A prefetched link can use the old region until a request
reaches the server. The owner accepted that window in #484. Browser Sentry
redaction, the shared Blob risk, freshness-probe refinements and private
repo metadata remain tracked in #480, #452, #485 and #470.
Production has an `AI_CHAT_MODEL` setting. The effective model still
needs confirmation after deploy (#238).

**Consent verification before release.** Checks 4 and 6 passed on staging
at `e7dc8e3d`. Check 6 used a simulated old browser record. Checks 1, 2, 3
and 5 passed on the same runtime in a local production build with simulated
regions and the real Google tag. The browser intercepted measurement requests.
Brandon accepted the combined evidence. Google Analytics is configured only
for production, so live staging Analytics remains unverified. Production
smoke checks follow the merge.

## v2026.11.24.1

This release ships the GitHub authentication code behind its server flag and
adds the BP release runbook.
Release PR [#437](https://github.com/brandonperfetti/bp-portfolio/pull/437) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.24.1) ·
carries #433 and #435.

**Visitors**

- Buttons honor reduced motion by disabling transitions when requested.
- The sign-in and sign-up forms support GitHub in environments where the
  connection and server flag are enabled. Production continues to offer
  Google and email at this cut (#431, #433).

**Developers**

- After Brandon merges a qualified release PR, the designated release lane
  can verify the merge, push its annotated tag and publish the GitHub Release
  under the documented standing grant (#432, #435).

**What this release leaves.** The production GitHub connection and flag stay
off. Partial Prefetching is a separate follow-up (#436).

**Not proven before release:** Fresh GitHub sign-up, continuity of the original
Clerk user ID, cancellation and recovery, sign-in that transfers to sign-up,
and live mailing-list consent. Brandon completed GitHub sign-in and returned
to the staging home page signed in on `0b10ac86`. Production smoke checks
follow the merge.

## v2026.11.24

Readers can sign in through the site's own form, and the cover workflow now
documents how to check for an existing upload and recover after an uncertain
response.
Release PR [#434](https://github.com/brandonperfetti/bp-portfolio/pull/434) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.24) ·
carries #428, #429 and #430.

**Visitors**

- **Sign in with password, an email code, or Google.** The new form matches
  sign-up and handles password reset and new-device verification on the site
  (#379, #428).

**Content operators and developers**

- Check the full Cloudinary public ID with the authenticated single-resource
  lookup while holding the writer assignment. The writer keeps that
  assignment through reconciliation. If the outcome remains unresolved,
  stop uploads to the folder and escalate to Brandon without retrying (#427, #429).
- The imagery guide now includes draft machine-readable settings for cover
  recipes (#430).

**What this release leaves.**

- The imagery guide remains draft and post 61's A2-1 candidate remains on hold.
  The cover rotation follow-up stays open (#423).

**Not proven before release:** Google sign-up from `/sign-up`, the
Google sign-in transfer to sign-up for a new address, and delivery of
the Device Trust code to Brandon's first test address. Device Trust
was exercised after password sign-in. The live Google callback did
not present a separate Device Trust challenge. Brandon completed email sign-up on staging from his phone after
receiving the verification code. Production sign-in and sign-up smoke
checks follow the merge.

## v2026.11.23

A subscriber whose address has a `#`, `?` or `/` in it now reaches their own
list entry, a sign-up that also wants a phone verified says at once that it
can't finish instead of after the code, and the CMS refuses a page saved
under `/account`, `/sign-in` or `/sign-up`, where it could never render.
Release PR [#426](https://github.com/brandonperfetti/bp-portfolio/pull/426) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.23) ·
carries #420, #422, #424 and #425.

**Visitors**

- **An address with `#`, `?` or `/` before the `@` reaches its own list
  entry.** Before this release, `reader#tag@example.test` was looked up as
  `reader`, so confirming the newsletter from the emailed link, ticking the
  contact form's subscribe box, or opting in at account sign-up could
  reach another reader's entry or none. Each now finds the address as
  given. A plain or `+` address behaves as before (#418, #422).
- **A sign-up that also needs a phone verified says so at once.** Where a
  sign-up asks for both the email and a phone number to be verified, the
  form used to show the email-code step anyway, and after the code it
  discarded the attempt; a Google visitor was then told to sign up with
  Google, the route that had just failed. Now the code step is shown only
  when the email is the one thing left to verify. Otherwise the email route
  says it couldn't finish before any code is sent, and a Google sign-up gets
  the message that points to email and a password. Phone is off on
  production, so no visitor can reach this today (#386, #425).

**CMS admin**

- **A page saved at or under `/account`, `/sign-in` or `/sign-up` is
  refused.** Each of those is an app route that serves every path beneath
  it, so a Pages document there used to publish, could be sitemapped, and
  never rendered. The save now fails with "“/account” is owned by the
  application, so a document saved under it could never be served. Pick a
  different first segment." The same check covers a post placed under a
  parent page. Other paths, such as `/tech/ai`, save as before (#400, #424).

**MCP clients**

- A page created or updated through the MCP server at or under the same three
  segments is refused with the same message, since it runs the same save
  check (#400, #424).

**What this release leaves.**

- **Draft-only pages under the three segments were not checked.** No
  published page sits there on production or staging (the public pages API,
  15 documents each), but a public read cannot see drafts or versions. A
  draft there would now fail on its next save (#424).
- **The cover guide is a draft.** `docs/CONTENT_IMAGERY.md` is
  `status: draft`, so it tells agents to generate no cover until Brandon
  approves it; #415 stays open until then, and posts 40, 46 and 52 over the
  rotation cap are #423 (#420).

**Not proven before release:** a live Resend request with an encoded
address; what is proven is the real SDK against a stubbed `fetch`, asserting
each exact path, and that Resend decodes the path is inferred from standard
routing and from the removal command that already relies on it. The sign-up
form against a Clerk instance that verifies phones; what is proven is the
form against a fake of Clerk's fields. The page refusal on a deployed admin.

**Developers**

- New `contactSelector(email)` in `src/lib/email/contactSelector.ts` is the
  one helper for every Resend call that addresses a contact by email, since
  `resend@6.18.1` puts the address into the request path unencoded:
  `captureContact`'s lookup, resubscribe update, read-back and segment calls,
  `findContactIdByEmail`, and `removeContactByEmail`, which drops #419's
  inline form. It encodes the address as one path segment and puts back
  only `+` and the last `@`, which Sentry's `redactEmailAddresses` matches,
  so the address in a breadcrumb or span path is still redacted whole;
  `sentryConfig.test.ts` checks that over every printable ASCII character. The create still sends the address raw in
  its JSON body. The removal path now sends `+` literally where #419 sent
  `%2B` (#418, #422).
- `SignUpForm`'s `needsEmailCode()` is true only when `email_address` is the
  only unverified field and nothing is missing, and `onVerify`'s fallback
  picks its message by route through `unfinishedMessage()`. `docs/AUTH.md`
  and the `docs/JOURNEYS.md` Sign up row say so (#386, #425).
- `CODE_OWNED_FIRST_SEGMENTS` (`src/fields/slug/documentPath.ts`) gains
  `account`, `sign-in` and `sign-up`; `RESERVED_PAGE_SLUGS` is unchanged but
  for its TSDoc. `docs/NAVIGATION.md` says the save is refused (#400, #424).
- Cover work has its own route: `docs/CONTENT_IMAGERY.md` (photographic
  covers; agents generate with GPT Image, never Midjourney; an exact-id
  pre-check before any Cloudinary upload, because `sign-upload` overwrites;
  Brandon approves every attach) and `docs/cover-history.json`, the 53 live
  covers with their final prompts; `AGENTS.md` routes cover work there. The
  code-rendered cover tooling moved from `tools/covers/` to
  `archive/code-rendered-covers/`, with an archive note in its README and
  the old §9 spec kept in its `HISTORY.md`, and `CONTENT_STYLE.md` §9 and
  `CONTENT_WORKFLOW.md` point to the new guide (#415, #420).
- No Payload schema change, no migration and no new env var.

## v2026.11.22

A form submitted before the spam check has loaded now waits for it instead
of failing, Corvus answers "Do you store messages?" from the retention
policy, a subscriber with no account can be taken off the list with one
command, and a plain `git add` no longer picks up a real env file. Release PR
[#421](https://github.com/brandonperfetti/bp-portfolio/pull/421) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.22) ·
carries #414, #416, #417 and #419.

**Visitors**

- **An early submit no longer gets a 403.** Before this release, pressing
  Send on the contact form or the "Stay up to date" form before the
  Turnstile widget had loaded sent the request without a token, and the
  server refused it where Turnstile is enforced. The form now waits for the
  widget, up to 5 seconds, and the whole check is bounded at 15 seconds from
  the press. If the check really does time out, the form sends nothing,
  keeps what was typed, and says "The spam check is taking longer than
  usual. Please try again in a moment." A blocked or failed script still
  sends without a token and the server decides, as before. Where chat
  protection is on, Corvus chat also waits for the widget; on a timeout it
  still sends without a token (#405, #417).
- **The contact form's messages are announced to screen readers.** Its
  feedback is now a polite live region that is always on the page, so the
  success, error and timeout messages are read out as they appear (#417).
- **Corvus answers "Do you store messages?" from the published retention
  policy.** That question, and others like it ("Does Corvus keep any
  data?", "How long do you keep…?"), now bring in the retention passage, so
  Corvus answers with what it keeps and for how long and cites `/privacy`.
  Before, the question reached Corvus with no policy passage at all (#410,
  #416).

**What this release leaves.**

- **There is still no unsubscribe page on the site.** A subscriber leaves
  through the unsubscribe link in each Resend broadcast, or by asking
  Brandon, who removes them with the new command below. Nothing has been
  sent to the list yet, so no delivered email has been checked for the link;
  `docs/AUTH.md` § Leaving the list says to test it before the first send
  (#365, #419).
- **Other Resend contact calls still put the address in the URL
  unencoded**: the contact lookup the Clerk webhook uses, and
  `captureContact`'s lookup, update and segment calls. An address with `#`,
  `?` or `/` in it can miss its contact there. That is #418; this release
  fixes only the new removal lookup (#419).
- **Corvus's retention routing is a pattern list**, so wordings it doesn't
  cover still miss the passage; `docs/AI.md` § What Corvus keeps names the
  rules and their accepted false positives (#416).

**Not proven before release:** the Turnstile wait on a deployed build with
the real widget; what is proven is the hook and both forms by component and
hook tests, with Cloudflare's timeout codes injected. A live removal against
Resend with the production key. Corvus's retention answer in production;
what is proven is the keyed eval against the production model (`eval:ci` 89%
before and after, against the 80% floor).

**Developers**

- `.gitignore` ignores `.env*` at any depth and in any case, re-including
  only the root `.env.example`. `scripts/env-files-ignored.test.ts` (unit
  tier) checks sample names with `core.ignorecase=false`, as on CI, and fails
  if any tracked file other than the root example starts with `.env`, which
  catches a `git add -f`. `docs/SECURITY.md` § Secret handling says what the
  rule does not cover: a deeper `.gitignore` can re-include a name, and
  `prod.env` is outside it (#261, #414).
- `useTurnstileToken` has a new `requestToken()` returning `token`,
  `inactive`, `unavailable` or `timeout` (Cloudflare's 1106xx codes count as
  `timeout`). Calls run one at a time, since tokens are single-use, and a
  timeout resets the widget. `getToken()` keeps its shape. The ten-second
  load timer that marked a slow script failed for the whole page is gone
  (#405, #417).
- New admin command for a "please remove me":
  `pnpm exec payload run scripts/remove-contact.ts -- <address>`, with that
  environment's `RESEND_API_KEY`. It prints `removed`, `absent` or
  `unconfirmed` (exit 1) and keeps the address out of its logs. Use
  `pnpm exec`, not `pnpm payload`, which prints the address. It calls the
  new `removeContactByEmail` in `src/lib/email/resendContacts.ts`. The
  existing `removeContact`, which the Clerk webhook uses, now returns true
  only on Resend's `deleted: true` and logs an error's name and status, not
  its message, which can echo the address. `docs/AUTH.md` § Leaving the list
  is the runbook (#365, #419).
- `isCorvusRetentionQuestion` gains three patterns (`src/lib/ai/aboutCorvus.ts`).
  The pattern check that #401's non-answer was scored by is replaced by an
  AI-graded check, `neverDeniesThePublishedPolicy` in
  `evals/graded-scorers.ts`, on Brandon's decision. It keeps the reported
  name `never-disclaims-the-published-policy`, and
  `evals/graded-scorers.test.ts` pins its question and score map without a
  model call. The what-Corvus-keeps block gains "Do you store messages?". No
  eval floor changed (#410, #416).
- No Payload schema change, no migration and no new env var.

## v2026.11.21.1

The newsletter form asks the reader to confirm by email before anything is
added, a reader who unsubscribed can rejoin that way, and a failed Resend write
no longer reads as subscribed. Release PR
[#413](https://github.com/brandonperfetti/bp-portfolio/pull/413) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.21.1) ·
carries #411.

**Visitors**

- **The "Stay up to date" form is double opt-in.** Submitting it adds
  nothing to the list. It sends one email to the address, with a link to
  `/newsletter/confirm`, and answers "Thanks. Check your inbox for a link to
  confirm." Opening the link changes nothing either, because mail scanners
  open links; the address joins only when its owner presses **Confirm** on
  that page. Each link works once and stops working after 3 days. Brandon
  chose double opt-in for every Newsletter Signup sign-up, new or returning,
  on #411, replacing the single opt-in of v2026.11.21 (#411).
- **A reader who unsubscribed can rejoin.** Confirming from the emailed link
  clears an earlier unsubscribe, and the site reads the contact back before
  saying "You're subscribed." Only the confirmation does this; an old link
  confirmed again after an unsubscribe answers "This link has already been
  used." and changes nothing (#407, #411).
- **A failed write says so.** When Resend refuses or cannot be reached, the
  form answers "Couldn't sign you up right now. Please try again later.", and
  the confirm page says it couldn't confirm, instead of a success. Every
  address still gets the same answer, so no reply shows who is on the list
  (#409, #411).
- **Signing up, the contact form's opt-in and the newsletter all add an
  existing contact to the list's segment.** Before this release only a new
  contact got the segment (#406, #411).
- **No capture path creates an existing contact blind.** On v2026.11.21
  the newsletter form, Clerk sign-up and the contact form's opt-in all
  created the contact without looking it up. A live Resend test after #411
  merged found that creating a contact that already exists returns the same
  contact and flipped an unsubscribed one back to subscribed; the connector
  used may have sent `unsubscribed: false` by default, so a plain create may
  not do that. If it does, anyone could put an unsubscribed address back on
  the list through the newsletter form, which asked for no proof of owning
  the address, and sign-up or the contact form could override a past
  unsubscribe without a confirmation. The newsletter form now only sends a
  confirmation email; sign-up and the contact form look the contact up
  first, create only an absent one, and never re-subscribe anyone (#406,
  #411).
- **Sentry no longer records email addresses from requests.** Resend puts
  the address in its URL path and Sentry records request paths and bodies,
  so error and performance reports from the forms could carry it. The server
  and edge configs now redact addresses from the request on error and
  transaction events, and from breadcrumbs and spans, for every route. An
  exception message or log line is not redacted (#411).

**What this release leaves.**

- **`/privacy` still describes the single opt-in form.** Its "Stay up to
  date" paragraph says the address is added on submit. The replacement text
  is on #407 and #411; Brandon replaces it in the CMS after the merge. This
  release does not edit the page.
- **Someone can still send one confirmation email to an address that isn't
  theirs.** Only the owner can confirm it. The submit route's per-IP rate
  limit, and Turnstile where its key is set, bound how often; there is no
  per-recipient cooldown (#411).
- **Two links for one address.** An address that signs up twice within 3
  days holds two links, each usable once, so the second can still re-subscribe
  after an unsubscribe until it expires (#411).
- **Each capture makes 2 to 5 Resend calls where it made 1** (more when a
  contact has many pages of segments), so a burst is likelier to hit
  Resend's rate limit, which the form answers with the 503 above (#411).
- **A submit made before the Turnstile widget has loaded** can still get a
  403 where Turnstile is enforced (#405).

**Not proven before release:** a real submit, email and confirmation through
the site on a deployed build; Resend is never configured in CI. What is proven
is the routes, the token, the capture helper and the confirm page by unit and
component tests, and Resend's behavior by the live test on #407 (2026-11-21,
through the Resend connector, not the site's code): `unsubscribed: false`
re-subscribes a contact. Segment adds were not tested live.

**Developers**

- New `/api/newsletter/confirm` and the `noindex` page `/newsletter/confirm`.
  `/api/newsletter` now sends the confirmation email (`emails.send` from
  `CONTACT_FROM_EMAIL`) and makes no contact call. The confirm route has its
  own limiter bucket, `newsletter-confirm:<digest>`, and no Turnstile; the
  token is the proof. `guardPublicForm` takes `{ turnstile: false }` (#411).
- New `src/lib/email/newsletterConfirmToken.ts`: a stateless token holding the
  address and a 3-day expiry, sealed with AES-256-GCM under a key
  HKDF-derived from `PAYLOAD_SECRET`. **No env var is added**, and rotating
  `PAYLOAD_SECRET` voids unconfirmed links (`.env.example`). Only the
  canonical base64url spelling verifies (#411).
- New `src/lib/email/newsletterTokenUse.ts`: each link is claimed once in
  Upstash (`SET NX` on a digest of the token). **In production without
  Upstash the confirm route answers 503**, with no per-instance fallback;
  staging and preview run as production, so they need Upstash too. A join
  that fails before the list could change frees the claim for a retry; a
  later failure keeps the link used (#411).
- `captureContact` looks the address up, creates only an absent contact,
  adds an existing one to the segment if missing (every page of segments is
  read), and with `rejoin` updates and reads back an unsubscribed contact. It
  returns an outcome and never throws. The two newsletter routes report a
  failure as `NewsletterCaptureError`, tagged by stage, with no address; the
  webhook and the contact form ignore the outcome (#406, #407, #409, #411).
- `src/lib/observability/sentryConfig.ts` holds the address redaction for
  `beforeSend` and `beforeSendTransaction` (the event's `request`),
  `beforeBreadcrumb` and `beforeSendSpan`, including JSON bodies, addresses
  written with unicode escapes and internationalized addresses
  (`reader@bücher.de`, plain or percent-encoded). The pattern scans in linear
  time; before this release's review it was quadratic on a long run with no
  `@` (#411, #413).
- No Payload schema change and no migration. `docs/AUTH.md`,
  `docs/FEATURES.md`, `docs/SECURITY.md`, `docs/JOURNEYS.md`,
  `docs/ARCHITECTURE.md` and `docs/NAVIGATION.md` describe the two-step path
  (#411).

## v2026.11.21

The Newsletter Signup form subscribes again, Corvus answers what it keeps of
a conversation and cites `/privacy`, and the contact form's rate limiter no
longer stores a visitor's raw IP. Release PR
[#408](https://github.com/brandonperfetti/bp-portfolio/pull/408) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.21) ·
carries #402, #403 and #404.

**Visitors**

- **The "Stay up to date" form works.** The Newsletter Signup block's form
  posted to `/api/mailinglist`, a route that no longer existed, so every
  submit failed. It now posts to `/api/newsletter`, which adds the address
  to the same Resend list as the sign-up and contact-form opt-ins.
  Submitting the form is the opt-in; there is no confirmation email. Every
  valid address gets the same answer, whether it was new or already on the
  list. The form runs the same invisible Turnstile check as the contact
  form, its submit button is named "Subscribe" for screen readers, and its
  result is announced as a polite status (#367, #404).
- **Corvus says what it keeps of a conversation.** Asked "Does it store my
  conversation?" or "What do you keep?", Corvus now answers from the
  privacy page and links `/privacy`: messages go to OpenAI and are not saved
  to a database, OpenAI may keep them for a limited time to check for abuse,
  and a message count is kept against a scrambled IP for 30 days, or against
  the account when signed in. Before this release it said it had no verified
  retention policy (#401, #403).
- **The contact form's rate limit stores no raw IP.** Its Redis key is now
  the same HMAC digest of the IP that chat already uses. The limit itself is
  unchanged; each visitor's one-minute window starts over once, on deploy
  (#364, #402).

**What this release leaves.**

- **`/privacy` does not mention the newsletter form yet.** Its Turnstile
  sentence names only the contact form. #404's PR body has suggested text
  for the CMS; the page is not edited by this release.
- **Single opt-in, by Brandon's choice** (2026-11-21, #404). Like the contact
  form's box, the newsletter form does not prove the visitor owns the
  address, so someone could subscribe an address that isn't theirs.
- **A failed Resend write still reads as subscribed.** The form gives one
  answer for every valid address so it never reveals who is on the list,
  and that answer is also given when Resend refuses the write or cannot be
  reached; the address is then not captured (#409).
- **A reader who unsubscribed may stay off the list** after submitting the
  form again: the route never asks Resend to clear an earlier opt-out, and
  how Resend treats that create is not verified. Brandon decided such a
  reader should be able to rejoin; that is #407. An address already
  in Resend is not added to the segment (#406), and a submit made before the
  Turnstile widget has loaded can get a 403 where Turnstile is enforced
  (#405).
- **Corvus's retention passage is a copy of the privacy page**, kept in step
  by hand: a change to the page's "Corvus, the AI assistant" section needs
  the same change to `ABOUT_CORVUS_PRIVACY_PASSAGE`. Questions that name no
  object, such as "Is this private?", still miss it (#403), and so does "Do
  you store messages?", whose object has no "my" (#410).

**Not proven before release:** a newsletter submit from a published page
reaching the real Resend list; what is proven is the route and the form, by
route and component tests and a `next dev` server with a fake key, which
Resend refused. Corvus's retention answer on a deployed build; what is proven
is the keyed eval against the production model
(`eval:ci` 88% against the 80% floor). The contact limiter against a real
Upstash store; its key and rate were proven against the real limiter module
with the Upstash client faked.

**Developers**

- New `src/lib/security/publicFormGuard.ts`: `guardPublicForm` holds the
  public-form guards in `/api/contact`'s order: same-origin, a per-IP limit
  at `mailingListRatePerMinute` keyed on `anonIpKeyDigest(ip)`, a fail-closed
  503 with a redacted Sentry report when the limiter store fails, and
  Turnstile when `TURNSTILE_SECRET_KEY` is set. `/api/contact` and the new
  `/api/newsletter` both call it, with keys `contact:<digest>` and
  `newsletter:<digest>`; `LimiterSurface` gains `newsletter` (#402, #404).
- `/api/newsletter` answers 503 when `RESEND_API_KEY` is unset, and 200 with
  one constant message for every valid address. `CORVUS_MAILINGLIST_RATE_LIMIT_PER_MINUTE`
  now sets the rate for both forms, one bucket each, and `.env.example` says
  to set the Turnstile keys as a pair. No env var is added (#404).
- New `ABOUT_CORVUS_PRIVACY_PASSAGE` (collection `about-corvus-privacy`,
  source `/privacy`) and `isCorvusRetentionQuestion`, wired into
  `withAboutCorvusSnippet`; when both passages apply, this one goes first.
  `docs/AI.md` § What Corvus keeps records the hand-sync duty, and a new eval
  block in `evals/corvus-subjects.eval.ts` grades the facts and the `/privacy`
  citation. No eval floor changed (#403).
- `docs/SECURITY.md` gets a "Redis keeps no raw IP" rule naming every
  IP-derived key (#402, #404).

## v2026.11.20

Account sub-pages load directly, the cookie dialog's Analytics sentence is
served as the CMS stores it, and Corvus learns whether Clerk is on from the
page it renders in. Release PR
[#399](https://github.com/brandonperfetti/bp-portfolio/pull/399) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.20) ·
carries #396, #397 and #398.

**Visitors**

- **Account pages open from a link.** A signed-in reader can reload,
  bookmark or follow a link to an account sub-page such as
  `/account/security` and get the page. Before this release only a click
  inside the profile reached it; a direct load was a 404. The URLs are
  unchanged (#391, #397).

**CMS admin**

- **The cookie dialog's Analytics sentence is shown as saved.** The site no
  longer swaps the sentence shipped before #361 ("Google still receives an
  anonymous, cookieless signal") for the current default; a non-blank
  sentence stored in the `cookie-consent` global is served as written, and a
  blank one falls back to the default, like every other consent string.
  Staging and production were edited before this release, so the dialog
  does not change. The Analytics subtitle field's default is
  now the current sentence, and its note about the swap is gone (#372, #396).

**What this release leaves.**

- **A CMS page saved under `/account/…` is now hidden by the account
  route.** Before this release the CMS catch-all served one; `/sign-in/…` and
  `/sign-up/…` already worked this way. Saving such a page, from the admin or
  an MCP client, is not refused, and the sitemap would still list it. None is
  known to exist; `docs/NAVIGATION.md` notes the shadowing (#397).

**Not proven before release:** the signed-in profile and its sub-pages on a
served page, since no spec signs in; a signed-out direct load of `/account`
and `/account/security` is proven in CI. The signed-in Corvus greeting on a
served page, for the same reason; it has a story. The cookie dialog was not
checked in a browser: that it shows the stored sentence is proven by unit
tests, and that both environments store the current one by their public API
on 2026-11-19. The migration's down step was run on a scratch database only.

**Developers**

- `/account` is now `src/app/(frontend)/account/[[...account]]/page.tsx`,
  an optional catch-all like `[[...sign-in]]` and `[[...sign-up]]`, and
  `<UserProfile>` is pinned to `path="/account" routing="path"`. Gating is
  unchanged. `e2e/account-routes.spec.ts` loads both URLs signed out (#397).
- `SUPERSEDED_ANALYTICS_SUBTITLE` is removed. The migration
  `20261119_211457_issue_372_analytics_subtitle_default` moves the column
  default of `cookie_consent.categories_analytics_subtitle` to the current
  sentence; its `down` restores the old one. It touches no stored row and
  creates no table (#396).
- New `src/components/auth/ViewerFirstName.tsx`: `ClerkViewerFirstName`,
  mounted inside `<ClerkProvider>`, fills a first-name context, and
  `CorvusChat` reads it with `useViewerFirstName()`. It no longer reads
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or calls Clerk's `useUser()`, so
  a deploy with the publishable key but not the secret key no longer throws
  where Corvus renders. Stories supply a name with `ViewerFirstNameProvider`
  (`AI/CorvusChat` › `SignedInGreeting`) (#381, #398).
- `pnpm test:storybook` passes with the publishable key in the
  environment, locally and in CI, whose Storybook interaction-test step now
  gets it; the secret key stays on the Build and E2E steps only. A test that
  mounts `ClerkClientProvider` with `@clerk/nextjs` mocked now mocks
  `useUser` too (#398).

## v2026.11.19.1

Corvus stops asking OpenAI to keep conversations, chat and the contact form
refuse cleanly when their rate limiter is down, and the mailing-list backfill
follows the sign-up opt-in. Release PR
[#395](https://github.com/brandonperfetti/bp-portfolio/pull/395) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.19.1) ·
carries #388, #389 and #392.

**Visitors**

- **OpenAI is no longer asked to keep what you type to Corvus.** Every
  chat request Corvus sends to OpenAI now sets `store: false`; before this
  release OpenAI logged each chat by default. The site itself keeps no copy,
  as before. A follow-up question now resends Corvus's earlier replies as
  text instead of pointing at OpenAI's stored copy, so a conversation keeps
  its context (#366, #389).
- **When the rate limiter is down, Corvus says so.** If the store that
  counts messages fails or stalls, chat refuses the message and shows
  "Corvus is temporarily unavailable. Please try again in a few minutes."
  Before this release it answered with an error the page showed as
  "Something went wrong reaching Corvus" (#392).
- **The contact form does the same.** With the limiter down it does not
  send, and says "The contact form is temporarily unavailable. Please try
  again later — or email me directly." It fails closed on purpose: an open
  form during an outage would be an unlimited sender into Brandon's inbox
  (#392).

**What this release leaves.**

- **A Corvus tab opened before this release** holds replies whose reasoning
  has no encrypted copy. On that tab's next question the reasoning is dropped
  with a server warning and the reply text still goes, so nothing breaks
  (#389).
- **The privacy page's Corvus wording** ("OpenAI may keep it for a limited
  time for abuse monitoring") is CMS content and is left to the privacy-page
  work (#366).

**Not proven before release:** the 503 on a real deployment against a
failing limiter; it is proven by route, fetch and component tests with the
limiter faked. Corvus with `store: false` was checked by hand over three
turns on #389's preview, with no OpenAI error; not yet on production.

**Developers**

- `corvusProviderOptions` (`src/lib/ai/corvus.ts`) always returns
  `openai.store: false`, and adds `reasoningEffort` only for a reasoning
  model; the chat route and the eval harness both build their options
  through it. `docs/AI.md` has a section on what the provider is sent and
  asked to keep, including the retrieval query that goes to OpenAI
  embeddings, which have no `store` option (#389).
- New `src/lib/security/limiterOutage.ts`: `reportLimiterOutage` sends one
  Sentry event per refused request, grouped into one issue per surface and
  tagged by surface and operation, with a redacted
  copy of the upstream error (client IP, anon digest, limiter key and any
  IPv4 address removed). The chat route returns 503 with
  `code: 'chat_unavailable'` when `checkChatLimits` or either chatGate call
  fails; a failed increment refuses rather than streams, since an uncounted
  message is an unlimited one. `checkChatLimits` treats an
  `@upstash/ratelimit` `reason: 'timeout'` as an outage. `corvusChatFetch`
  turns the 503 into a code `CorvusChat` matches (#392).
- The Clerk↔Resend backfill (`scripts/backfill-clerk-resend-mapping.ts`)
  maps an unmapped account only when its sign-up recorded the opt-in
  (`unsafeMetadata.mailingListOptIn === true`), the rule the webhook has
  applied since #362. Others are reported `not-opted-in` and left unlinked;
  already-mapped accounts keep their link and mirror repair. The backfill
  no longer re-links an unmapped pre-#362 account. Linking one is now a
  manual `external_id` edit in the Clerk dashboard and then a backfill run,
  which writes the Redis mirror that `user.deleted` reads first; the edit
  alone does not write it (`docs/AUTH.md`). No backfill was run for this
  release; Brandon decided no legacy run is needed (#374, #388).
- `docs/JOURNEYS.md`'s "Contact Brandon" row now names the contact route's
  test; `docs/SECURITY.md` says a configured but failing store makes the
  limited routes fail closed.

## v2026.11.19

Three privacy fixes and a sign-up form of the site's own, so the site does
what its consent banner and its sign-up screen say. Release PR
[#382](https://github.com/brandonperfetti/bp-portfolio/pull/382) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.19) ·
carries #373, #378, #380, #385 and #387.

**Visitors**

- **Google Analytics loads only after you allow Analytics.** In a region that
  asks for consent, or one the site cannot place, nothing is requested from
  or sent to Google until you accept (one exception, for a visitor granted
  automatically elsewhere, is below). Before this release Google's tag loaded
  for every visitor and sent one cookieless page view before any choice. If
  you later refuse, the page reloads and loads nothing from Google (#361).
- **Unchanged where consent is not required:** Analytics is still granted
  automatically there and the tag loads on the first page.
- **The cookie dialog's Analytics sentence says what now happens:** Google
  Analytics loads only while Analytics is allowed. The banner sentence
  ("Google Analytics only with your consent") is unchanged.
- **Signing up no longer adds you to the mailing list unless you tick the
  box.** The box is the contact form's opt-in, unticked, inside the sign-up
  form and above both ways of signing up, so you pass it before "Continue
  with Google" as well as before the email fields. Your answer is read when
  you press the button, and the form locks until Clerk replies, so a box
  changed after the click cannot change what was sent. An account made
  without passing that box (a social sign-in started on `/sign-in`, an
  account made in the Clerk dashboard, a Google sign-up that turns out to be
  an existing member) is not added. People already on the list stay on it
  and nothing is sent to anyone (#362, #377).
- **`/sign-up` is the site's own form.** Email and password with an emailed
  code, or Google, in one card; Clerk still owns passwords, the code,
  sessions and the bot check. A `redirect_url` is followed only to a page on
  this site. Sign-in and the account page are still Clerk's own screens; a
  matching sign-in form is
  [#379](https://github.com/brandonperfetti/bp-portfolio/issues/379) (#377).
- **The form says where you stand** (#384):
  - Already signed in, `/sign-up` sends you on instead of showing the form:
    to the on-site path in the link's `redirect_url` when it has one,
    otherwise to the home page.
  - If a Google sign-up still needs something the form has no field for,
    the form says it could not finish with Google and offers email and a
    password, where it used to show the first step again with no message.
    You see this once you are back on the form; the page Google returns to
    may first say it is taking longer than expected and offer "Start
    again".
  - The code step says "Enter the code we sent" only when this page sent
    one. If the send failed it says so, and if the page cannot know (a
    reload, a return from Google) it asks for the code and points to "Send
    a new code".
- **The footer can carry extra links** after the navigation items and before
  "Manage Cookies". None is set today, so the footer looks the same (#363).

**What this release leaves, all in
[#375](https://github.com/brandonperfetti/bp-portfolio/issues/375).** Every
case concerns a visitor whose Analytics was granted automatically, in a region
that does not ask, who then meets a region that does. A visitor who has made a
choice is not affected.

- **A returning visitor's first page.** Loading the site from a region that
  asks, with an automatic grant stored from one that does not, gets Google's
  tag on that first page before the existing region check revokes the grant
  and the page reloads. Later pages load nothing.
- **The same visitor where the region cannot be read at all** (the geo
  cookie is absent or malformed). The stored automatic grant is restored and
  the tag loads, and here nothing revokes it: the region check does nothing
  until it knows the region is one that asks, so there is no reload, the
  banner stays hidden, and the tag keeps loading while the region stays
  unknown.
- **A region change in the middle of a visit.** Unchanged from before:
  Analytics goes off, a denial is recorded for the visitor, and the banner
  does not come back, so they are never asked. The tag that was already
  loaded can report the one route they land on before it is stopped.
- **Two rare races in that mid-visit path,** both needing the region to
  change within milliseconds of the automatic grant, both present before this
  release and neither widened by it: an automatic grant still being saved can
  finish after the denial and win; and a denial saved between a grant's two
  storage writes can be overwritten in storage, so a later fresh load could
  restore the grant for one page.

**Two limits recorded while this release was built do not ship.** The opt-in
first sat above Clerk's own sign-up card, outside its frame, and a tick
changed in the moment after Continue could have been sent as it was at the
click, adding someone whose box read unticked. That version (#373) never
reached production; the site's own form (#380) replaces it, with the box
inside the form and locked from the click. The lock is proven in a browser
and in component tests, for the email route and the Google route.

**Not proven before release:** anything on production. The form, the bot
check, and what a ticked and an unticked sign-up each do to the mailing list
were run by hand by Brandon on staging, whose Clerk instance is a
development one, before the #384 fixes were added. Of those fixes, the
signed-in redirect is proven by tests with the session mocked, not on a
served page, and a real return from Google with a missing field has never
been seen: it needs a sign-up field switched on in the Clerk dashboard,
which was not done.

**The CMS admin**

- **Footer → Links is live.** A link saved there shows in the footer without
  a deploy. Links are added to the row, never substituted for the navigation;
  one whose address is already in the row is not repeated. An address must be
  a site path, an `http(s)` URL or a `mailto:` address, or the link is not
  rendered.
- **Cookie Consent → the Analytics subtitle field keeps showing the old
  sentence** until it is edited by hand
  ([#372](https://github.com/brandonperfetti/bp-portfolio/issues/372)). The
  site serves the new sentence whenever the stored value is exactly the old
  one; any other stored text is served as written. The field's description
  says so.
- **Accounts created in the Clerk dashboard are not added to the mailing
  list.**
- **Turning on a sign-up field in the Clerk dashboard can outrun the form,**
  which has fields for email and password only. With names, phone or legal
  consent required and still missing, the form says it could not finish:
  at once on the email route, and on the Google route when the visitor is
  back on the form, by "Start again" on the page Google returns to or by
  the address. The field has to be built first.
- No collection, global or field changes shape; there is no migration.

**MCP clients**

- Nothing changes: no tool, parameter or schema description differs.

**Developers**

- `/sign-up` is `SignUpForm` and `SignUpFormView` on Clerk's `useSignUp()`
  hooks, with `/sign-up/sso-callback` for the return from Google.
  `safeRedirectPath` (`src/lib/auth/safeRedirect.ts`) is now what checks
  `redirect_url` on those two pages (`docs/SECURITY.md`). The password hint
  is a constant, `PASSWORD_MIN_LENGTH`, to keep equal to the Clerk
  dashboard's minimum.
- The sign-up page redirects a signed-in visitor on the server, through
  `getViewer()` and `safeRedirectPath` with no origin, so there an absolute
  `redirect_url` goes to the home page even when it is this site's.
  `SignUpFormView` takes `codeDelivery` (`sent`, `failed` or `unknown`) for
  the code step's line (#384).
- `@clerk/nextjs` 7.5.22 to 7.10.2, which brings `@clerk/backend` 3.30.0 at
  runtime. From 3.28.0 a session token must carry a `cat` header field or
  the visitor reads as signed out; production's token carries it.
- **Clerk's provider mounts from a client module** (`ClerkClientProvider`,
  #387). On a cold start the first request for a prerendered page could
  fail React's resume check: the shell recorded Clerk's provider under one
  name and the fresh server rendered it under another, so React dropped the
  shell and rendered the whole page in the browser (Sentry BP-PORTFOLIO-S,
  seen once on staging at `c5e86f2`; whether production does it today is
  not known). The provider now has the same name in the build's shell and
  on a cold server, which is what the resume check compares; that is proven
  by a test over React's real prerender and resume, not on a deployment.
  Nothing a visitor sees or can do is meant to change. The cause is
  `@clerk/nextjs` renaming the provider as one of its modules loads, still
  so in 7.10.4; `ClerkClientProvider.resume.test.tsx`
  fails when a release drops the rename and the wrapper can go. It was not
  reproduced end to end locally and no resume has been watched on staging
  since the fix.
- Two new shadcn primitives, `ui/input` and `ui/label`. `--destructive` is
  now a rendered text colour and is contrast-pinned in both themes.
- CI's Build · E2E job builds with `NEXT_PUBLIC_VERCEL_ENV=production` and a
  placeholder `NEXT_PUBLIC_GA_MEASUREMENT_ID`, so the build under test
  registers Google Analytics. Every browser the Playwright suite launches
  cannot resolve Google's tag and measurement hosts
  (`e2e/support/google-hosts.ts`); no hit leaves CI.
- The same job builds with Clerk on, from two repository secrets holding the
  Clerk development instance's keys, set on the Build and E2E steps only.
  `e2e/sign-up-opt-in.spec.ts` fails without them, and intercepts every
  write to Clerk. The Storybook interaction-test step runs with Clerk off
  until [#381](https://github.com/brandonperfetti/bp-portfolio/issues/381)
  (`docs/TESTING.md`).
- New e2e spec `consent-google-analytics.spec.ts`, with a hand-run mode
  against the real tag (`GA_E2E_LIVE=1`, `docs/ANALYTICS.md`).
- New reader `getCmsFooterLinks` under the `global_footer` cache tag, purged
  by the Footer global's `afterChange` hook.
- The `user.created` webhook captures a contact only when the opt-in in the
  user's `unsafe_metadata` is a literal `true`
  (`src/lib/email/mailingListOptIn.ts`), and acknowledges a signed
  delivery whose `data` is not an object. `docs/AUTH.md` no longer says a
  replayed `user.created` repairs a legacy mapping; the backfill does.
- This changelog, the release procedure in `docs/WORKFLOW.md`, and a pre-push
  hook that skips a push of tags only (#369).

## v2026.11.17

Access control in the three CMS global readers, cached reads that follow a
page's publish state, and developer hygiene. Release PR
[#357](https://github.com/brandonperfetti/bp-portfolio/pull/357) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.17) ·
carries #349, #351, #352, #354, #355 and #358.

**Visitors**

- **Security:** the navigation, site-settings and cookie-consent readers
  enforce access control. A privacy-policy relation that points at a
  never-published page is no longer populated, so the consent dialog shows no
  link to it (#262). On production nothing visible changed: no privacy
  relation was set.
- **Caching:** after a page is published, unpublished or deleted, the consent
  dialog's link to it, links to it inside an article's layout blocks, and
  redirects that target it follow within seconds instead of up to six hours
  (#358).

**The CMS admin**

- The Slug field's help text now says that only the admin form re-derives a
  slug before first publish; an API or MCP write that omits `slug` keeps the
  stored one (#263).
- Payload usage telemetry is off in every environment (#331).
- No collection, global or field changes shape; there is no migration.

**MCP clients**

- The `slug` property's description in the tool schema changes. Clients that
  cache tool schemas see new text only; no parameter changes.

**Developers**

- The dependency override rule and its table of four standing pin crossings
  (#349, #352).
- `@storybook/addon-mcp` 10.6.7, with the global `valibot` override dropped
  (#351).
- Postgres-tier fixtures scoped to their own rows (#354).
- `agentRules: false` for `next dev`, a pre-push hook that skips
  deletion-only pushes, hermetic Corvus unit tests, and docs corrections
  (#355).
