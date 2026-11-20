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
