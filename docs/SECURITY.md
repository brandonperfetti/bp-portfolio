# Security

The security standard for this repo: the rules a change is held to, by its
author and by review. Each rule is true of the tree as measured on
2026-09-27 — re-measured that day on the whole wave-9 branch at `ee81049`,
first written against `ef07dbd` — unless it is marked **Intended**,
and each names the file or check that holds it. **Operational** rules govern
handling outside the repo — platform settings, credentials, data — so the
tree cannot show them; they are `[stated]` and held by whoever operates the
service.

The repo is **public**: code, docs, commits, CI logs and issue text are
readable by anyone.

**How this doc relates to the topic docs.** It states each security rule
once. The _mechanism_ behind a rule stays in the doc that owns its topic,
and the rule links there: `docs/AUTH.md` (gating, email capture),
`docs/ANALYTICS.md` (the consent runtime), `docs/AI.md` (Corvus guardrails
and retrieval), `docs/PAYLOAD.md` (access helpers, the RLS migration
procedure), `docs/DEPENDENCIES.md` (supply-chain policy). A security rule
another doc carried in passing lives here instead, and that doc points back.

## HTML injection through React escape hatches

- **No raw `__html`.** Every `dangerouslySetInnerHTML` takes its `__html`
  from `toSafeJsonLd()` in `src/lib/seo/jsonLd.ts`, imported under its own
  name from `@/lib/seo/jsonLd`, or from a single-assignment `const` that
  holds its result. `toSafeJsonLd` escapes `<`, `>`, U+2028 and U+2029, so
  the serialized JSON cannot close its `<script>` tag or break a legacy
  parser. `[measured 2026-09-27]` 21 sites across 9 files, all JSON-LD
  `<script>` tags: 20 call the helper inline and 1 reads a hoisted `const`
  (`scriptPayload` in `src/app/(frontend)/articles/page.tsx`).
- **The gate is lint (#248).** `pnpm lint` fails a violation, locally and
  in CI. Two rules from the local plugin `scripts/lib/eslint-safe-html.mjs`,
  registered in `eslint.config.mjs` and tested in
  `scripts/lib/eslint-safe-html.test.ts` (`RuleTester` cases, plus the
  ESLint Node API run against the repo's own config):
  - `local/no-unsanitized-html` — `__html` must come from an approved
    helper (the `sanitizers` option; today only `toSafeJsonLd` from
    `@/lib/seo/jsonLd`). A props object that is not an inline literal, or
    that spreads, is rejected because its value cannot be checked, and a
    **duplicate `__html` key** is reported on its own: the last key wins,
    so a raw value could silently override a sanitized one.
  - `local/no-unjustified-html-disable` — the escape hatch. A directive
    that silences the gate, by name or blanket, needs a written reason
    after `--`, with a space on each side, in this form:

    ```ts
    // eslint-disable-next-line local/no-unsanitized-html -- <why this HTML is safe>
    ```

- **An equivalent helper is the only other route.** HTML that is not
  JSON-LD gets its own named, tested sanitizer, added to the rule's
  `sanitizers` option so the gate recognizes it — not a disable comment.

## Secrets and the server-only boundary

- **Of the environment variables, only `NEXT_PUBLIC_*` reaches the browser,
  so nothing secret carries that prefix — and no secret goes in
  `next.config.mjs`'s `env` option or `compiler.define`, which Next.js
  inlines into client bundles whatever the name.** Next.js inlines
  `NEXT_PUBLIC_` variables into client bundles at build time.
  `[measured 2026-09-27]` the names in use are all public by design: the
  Clerk publishable key and sign-in/up paths, the GA4 measurement id, the
  Sentry DSN, environment and Spotlight flag, the site name and URL, the
  Turnstile site key and chat-protection flag, and Vercel's own
  `NEXT_PUBLIC_VERCEL_ENV`. `[measured 2026-09-27, at 9120247]` the repo's
  own config object (`next.config.mjs:4-111`) sets neither `env` nor
  `compiler`: its top-level keys are `allowedDevOrigins`, `cacheComponents`,
  `cacheLife`, `images` and `redirects` (the instrument: the file imported
  with `withPayload` stubbed to the identity, then `Object.keys` on the
  default export; an earlier line-grep for `key:` missed the `redirects()`
  method). The wrappers add non-secret entries only:
  `withPayload` sets `env.PAYLOAD_CACHE_COMPONENTS_ENABLED = 'true'`
  [source: `@payloadcms/next` 3.88.0 `dist/withPayload/withPayload.js:26-28`],
  the only `env` key in the resolved config when no Sentry DSN is set
  (measured by importing the config); with a DSN, `withSentryConfig` adds
  Sentry's build-time path and release variables
  [source: `@sentry/nextjs` 10.70.0
  `build/cjs/config/withSentryConfig/buildTime.js:12-48`].
- **A secret is read on the server only** — route handlers, server
  components, Payload hooks and config, scripts. `[measured 2026-10-29]`
  none of the 46 modules whose directive is `'use client'` reads a variable
  other than `NEXT_PUBLIC_*` or `NODE_ENV` (the count was 47 once wave 9 added
  `src/components/tech/HistoryWriteGuard.tsx`, which read none; #268 moved
  the guard to `src/lib/history/historyWriteGuard.ts`, which carries no
  directive and reads none, so the count is 46 again). The 46 was re-measured
  2026-10-29 with `git grep` for a leading `'use client'` directive under
  `src`, and the env reads in those files were listed the same day: only
  `NEXT_PUBLIC_*` names. Passing a secret to a client component as a prop
  sends it to the browser just the same; that half is held by review.
- **Shared-secret routes compare with `isValidSecret()`**
  (`src/lib/security/timingSafeSecret.ts`: SHA-256 of both sides, then
  `timingSafeEqual`), **and fail closed** — it returns `false` when the
  expected secret is unset or empty. `[measured 2026-09-27]` the
  shared-secret routes use it (`/api/revalidate`, `/api/media/ingest`;
  `/next/preview` was the third until #275 moved it to the admin's Payload
  session), and nothing in `src` or `scripts` compares a
  `*SECRET`/`*TOKEN`/`*KEY` variable with `===` or `!==`.
- **Inbound webhooks verify before they act.** `/api/clerk/webhook`
  verifies the svix signature over the raw body with
  `CLERK_WEBHOOK_SIGNING_SECRET` before reading the event: 503 when
  unconfigured, 400 on a bad signature
  [source: `src/app/api/clerk/webhook/route.ts`]. A new webhook route
  follows the same order. Mechanism: `docs/AUTH.md` § Email capture.
- **A credential goes only to the origin it is for** — never as a header
  set on every request a browser context or client makes. For the Vercel
  protection-bypass secret (#252): send it only to the deployment's own
  origin, including across redirects (each hop is judged on its own origin:
  a same-origin hop carries it, an off-site `Location` is followed without
  it), never as a browser-context-wide header, which hands it to every
  third-party origin the page loads — image CDNs, Blob storage, avatars.
  `routeWithBypass` in `scripts/lib/page-diff.mjs` is the worked shape; on
  every hop off the captured origin it also strips `cookie`,
  `authorization` and `proxy-authorization`
  [source: `scripts/lib/page-diff.mjs:72-77`, `hopHeaders` at `:89-96`].
  _Moved from `docs/CONTENT_STYLE.md` §9 (#247 addendum)._
  The Playwright config's context-wide `extraHTTPHeaders` carries only the
  non-secret `x-vercel-ip-country` geo header
  [source: `playwright.config.ts`].

## Secret handling

Rules another doc used to carry, moved here verbatim (#247). The first is
measured below; the second is held by review (and by GitGuardian on PRs,
`docs/WORKFLOW.md` § Review); the rest are **operational**.

- `.env*` never enters git; `.env.example` documents every variable.
  Brandon populates Vercel/GitHub secrets as features land. _Moved from
  `docs/WORKFLOW.md` § Secrets._ `[measured 2026-09-27]` `.env.example` is
  the only tracked env file. `.gitignore` ignores `.env` and `.env*.local`
  only, so any other name (a `.env.production`, say) is kept out by review,
  not by git.
- Only the NAMES appear anywhere in this repo. _Moved from
  `docs/MAINTENANCE.md` § Local database from backups, where it followed
  "Values live in the password manager"; `docs/ANALYTICS.md` § Sessions in
  Sentry restated it ("no DSN or id value belongs in this repo") and now
  points here._
- Real secret values live in Vercel (per environment) and GitHub Actions,
  and **staging and production never share values**. _Moved from
  `README.md` § Environment variables (#269)._ One known exception, not yet
  closed: staging and production use one Vercel Blob store, so a
  `BLOB_READ_WRITE_TOKEN` for it writes to production media from either
  (#328; `docs/WORKFLOW.md` § Local database).
- **MCP API keys** (an admin-equivalent secret, `docs/PAYLOAD.md`
  § Operating via MCP): Scope keys with the plugin's
  per-collection/per-operation permission checkboxes (adding a collection
  to the plugin config adds permission COLUMNS — a schema change requiring
  `migrate:create`, and new permissions default to unchecked). Store keys
  in project-scoped keychain entries, rotate on any suspicion, and never
  grant delete where find+update suffices. _Moved from `docs/PAYLOAD.md`
  § Operating via MCP, "Key posture (review m8)"._
  **Since Payload 3.90 (#257) a key is shown once, when it is generated**:
  the admin and Payload operations no longer return a stored key (the
  generated types gained `hasAPIKey` in its place). Copy a new key into the
  keychain entry at creation; a lost key is rotated, not recovered.
  `[source: Payload v3.90.0 release notes, "API keys are no longer readable
after initial generation"]`
- `SENTRY_AUTH_TOKEN` is a build-only secret (source-map upload); rotate it
  like Resend/Blob if exposed. _Moved from `docs/MAINTENANCE.md`
  § Recurring, the Sentry entry._

**Applied in place, not moved.** These procedure steps carry a secret rule
inside an operational step, where lifting it out would break the step; they
stay where they are:

- `docs/CONTENT_STYLE.md` §9 — a Blob store id is read from the token's
  middle segment without printing the token.
- `docs/CONTENT_WORKFLOW.md` §0 and §4 — how a script sources and rotates
  the revalidate secret, and never echoes it into output, handoffs or
  receipts.
- `docs/MAINTENANCE.md` § Promotion checklist — fresh production values for
  `CMS_REVALIDATE_SECRET`, never the staging ones. (`PREVIEW_SECRET` is no
  longer read, since #275. Delete it from each environment once that
  environment runs the fix; the checklist has the step. Retiring rather
  than rotating, and leaving pre-fix deployments as they are, is
  Brandon's decision of 2026-11-14.)

## Payload access control

- **Every collection and global declares `access` explicitly.**
  `[measured 2026-09-27]` all 11 collections in `src/collections/` and all
  5 globals in `src/globals/` do. The posture (helpers in `src/access/`):
  - **Writes** — `create`, `update`, `delete`, and a global's `update` —
    are `authenticated`: a signed-in Payload admin user. The one exception
    is Users: `update` and `delete` are restricted to the caller's own
    account (#255), so one staff account cannot change another's email or
    password, or delete it.
  - **Reads** are `anyone` for public reference content (Authors,
    Categories, Media, Projects, Tags, TechStack, Uses, WorkHistory, every
    global); `authenticatedOrPublished` for the drafts-enabled Posts and
    Pages, which gives an anonymous reader only `_status: 'published'`; and
    `authenticated` for Users, whose `unlock` is restricted to the user's
    own account.
  - **Plugin collections keep their plugins' defaults**: `redirects` and
    `search` read publicly, `search` refuses `create`, and the MCP
    plugin's API-key collection lets a user manage only their own keys
    [source, `node_modules/@payloadcms/*` 3.88.0:
    `plugin-redirects/dist/index.js:91-94`,
    `plugin-search/dist/Search/index.js:54-58`,
    `plugin-mcp/dist/collections/createApiKeysCollection.js:49-56`]. An
    operation a plugin leaves unset falls back to Payload's default, a
    signed-in user [source: `payload/dist/auth/defaultAccess.js:1`,
    `payload/dist/collections/config/defaults.js:6-9`].
- **Clerk identity never grants CMS access.** Payload Users are the only
  principals for `/admin`, REST, GraphQL and `/api/mcp`; Clerk guards none
  of them [source: `src/access/authenticated.ts`, `docs/AUTH.md` § Setup].
- **A gated body is hidden at the field, not only in the app.**
  `Posts.content` carries field-level `read` access that returns it only to
  a Payload user or when the post is not `gated`, so an anonymous REST,
  GraphQL or MCP read omits it
  [source: `src/collections/Posts/index.ts`, the `content` field]. A new
  field that holds gated text needs the same rule.
- **Visitor-facing reads of Posts and Pages pass `overrideAccess: false`**,
  through a repo module (`src/lib/cms/*Repo.ts`, `src/lib/content/`).
  Payload's Local API defaults `overrideAccess` to `true`
  [source: payload 3.88 `collections/operations/local/find.js`], so leaving
  it out is a bypass, not a default. `[measured 2026-09-27]` every
  published read in `articlesRepo`, `pagesRepo` and `content/posts` passes
  `false`. The deliberate `true` reads are Payload hooks and sync jobs that
  must see every row; the draft readers, reached only in Next draft mode,
  which `/next/preview` enables only for a signed-in Payload user (the
  admin's session; no URL secret since #275); and `getGatedPostContent()`, called only after
  `canAccess()` passes (next section).
- **Database: default-deny RLS on every table in `public`.** A migration
  that creates a table enables Row Level Security on it and on its `_v` /
  `_rels` companions in the same file; CI fails the build otherwise
  (`scripts/check-migrations-rls.mjs`, #117). Never set
  `FORCE ROW LEVEL SECURITY`. Procedure and the grant revocations behind
  it: `docs/PAYLOAD.md` § New-table RLS convention.

## Media uploads

- **A file enters Media only through an upload or `POST /api/media/ingest`.**
  A Media **create** with no uploaded file may not carry `url`, `filename`,
  `mimeType`, `filesize`, `width` or `height`, and a Media **update** with no
  uploaded file may not change `filename`, `mimeType`, `filesize`, `width`
  or `height` from the stored value (sending them back unchanged, and
  `alt` or focal-point edits, pass). `url` needs no such rule: a caller-sent
  `url` is never stored, because the `url` field's `beforeChange` recomputes
  it from `filename` on every write (`[measured, local disk, 2026-09-27]`,
  pinned on the pg tier; with Blob, `[source]` `plugin-cloud-storage`
  `hooks/beforeChange.js:7-13`). An update carrying an `uploadEdits`
  query (crop, resize or focal point) and no file may not send a `url` or
  `filename` that differs from the stored row's, and a `where` update under
  `uploadEdits` may not send either: Payload re-crops by re-fetching the file
  from those two body fields, from any public host or from another row's
  path on local disk, and the fetched bytes set `req.file`, which would pass
  the update guard. An update that sends the row's own `url` and `filename`
  as read passes: `[measured, local disk, 2026-09-27]` an admin-shaped crop
  and focal-point edit (the doc as `findByID` returns it, plus
  `uploadEdits`) pass and apply, and a crop sending neither field changes
  nothing. That the real admin form posts exactly that shape is
  `[inference]`, unmeasured: its edit view loads the doc with `findByID`
  and puts `uploadEdits` in the action URL `[source]`, and it must post the
  hidden `url`/`filename`, since Payload's crop cannot re-fetch without
  them. **Unmeasured on Blob.** All three refusals are a 400 naming the
  ingest route [source: `src/collections/Media.ts` — `beforeOperation` hook
  `refuseCreateWithoutUpload` at `:77-98` over the fields at `:25-32`;
  `beforeValidate` hook `refuseFilelessFileRewrite` at `:185-211` over the
  fields at `:119-125`, compared by `sameStoredValue` at `:132-135`;
  `beforeOperation` hook `refuseUploadEditsRefetch` at `:461-514` over the
  fields at `:399`; registered at `:556-566`; lane D, #242; #270; line
  numbers corrected 2026-11-15 with #339]. The
  update guard also passes the storage adapter's own metadata write-back,
  which runs with the server-only `context.skipCloudStorage`.
- **Media storage is flat: no write sets or changes `prefix` or
  `_objectKey` (#339).** Since Payload 3.90 (#334) the Blob adapter builds a
  file's object path and served URL as `prefix/_objectKey/filename`, and both
  fields are only `admin.hidden`/`readOnly`, with no field access
  [source: plugin-cloud-storage 3.90.2 `fields/getFields.js:15-31`]. The
  release review (2026-11-15, F1) measured with the real adapter hooks in
  memory that a privileged fileless update of either one alone passed the
  guard above and moved the row's URL to `/<value>/<filename>`. **Two layers,
  by trust path** (corrected 2026-11-15, independent re-review 4 on #340):
  with access enforced — REST, the MCP media tools, any Local API call
  with `overrideAccess: false` — Payload 3.90.2 (re-read 2026-11-15 at 3.93.0,
  #342: byte-identical) sanitizes upload data before any
  collection hook (`uploads/sanitizeUploadData.js`): it drops `_objectKey`
  always and `prefix` on update, keeping a submitted `prefix` only with a
  file or on create. A dropped coordinate is **ignored, not refused**: the
  write succeeds and the row stays flat. Everything that survives that step,
  and every coordinate on the privileged Local API (`overrideAccess: true`, the
  Local API's default:
  scripts, seeds, server code), reaches the app's hooks, where a create may not
  carry a non-empty value of either, file or no file; an update may not
  change either to a non-empty value and, without a file, may not change
  either at all; sending them back as stored, `alt` edits and a normal
  upload (`prefix: ''`, no `_objectKey`) pass. A 400, by id and per document
  in a `where` update. An update that carries a file, or an `uploadEdits`
  query, is checked one step earlier, because Payload deletes the stored file
  before `beforeValidate` runs: a refusal there would leave the row naming a
  deleted file on local disk (measured 2026-11-15, CodeRabbit round 1 on
  #340); a `where` update with a file is refused for any non-empty coordinate
  [source: `src/collections/Media.ts` — `beforeValidate` hook
  `refuseStorageCoordinateWrite` at `:295-320` and `beforeOperation` hook
  `refuseStorageCoordinateUpload` at `:347-393`, over the fields at `:219`;
  pinned on the pg tier, including with the adapter enabled,
  `evals/media-storage-coordinates-integration.test.ts`,
  `evals/media-storage-schema-integration.test.ts`]. The media backup relies
  on the same invariant and fails closed on a row that breaks it
  (`docs/MAINTENANCE.md` § Media backups).
  _Corrected 2026-09-27 (CodeRabbit round 1 on #271):_ this bullet named the
  `uploadEdits` path a "known gap, not a rule that holds … unmeasured"; do
  not rely on that text — the path is now measured and refused. `[measured, local disk, 2026-09-27]` without the
  new hook, a crop with a body `url` of `http://127.0.0.1:9/…` failed only
  because Payload's `safeFetch` refuses loopback addresses, and a crop whose
  body `filename` named another row's file overwrote that file's bytes on
  disk. A public-host fetch is `[source]` (`generateFileData.js:54-77`,
  `getExternalFile.js`), not measured.
- **Why.** Given a `filename` and a `url` and no file, Payload's create
  fetches the `url` server-side from any public host and stores the bytes
  under the caller's `filename` with overwriting forced on — a server-side
  fetch of an arbitrary URL written to a caller-chosen path, past every
  ingest rail. `[measured, local disk, 2026-09-27]` a fileless create wrote
  the fetched bytes at exactly that filename. On Vercel Blob the same is
  `[inference]` — read from source (`plugin-cloud-storage`
  `hooks/afterChange.js:10`), unmeasured, since a Blob write is a
  third-party write. `[measured, local disk, 2026-09-27]` a fileless update
  fetches nothing, but a new `filename` re-points the row at a path that is
  not its file; on Blob, what the re-pointed URL then shows is
  `[inference]`, unmeasured. The guard's TSDoc carries the full receipts; the
  measurements are in `docs/CONTENT_WORKFLOW.md` §4.
- **The ingest route's rails** [source: `src/app/api/media/ingest/route.ts`]:
  shared-secret auth through `isValidSecret`; the source must be `https:`
  on `res.cloudinary.com` only (`:10`, `:72-84`), fetched with
  `redirect: 'error'` so a 3xx cannot leave the allowlist (`:85-92`); a
  raster `image/*` type, SVG refused (`:106-118`); at most 12 MB, checked on
  the declared length and on the bytes (`:13`, `:126`, `:137`).
- SVG uploads through the admin stay allowed for legacy content, and SVG
  can carry scripts, so only trusted staff hold editor accounts
  [source: `src/collections/Media.ts:523-524`, the collection's TSDoc].
  **Operational.**

## End-user authorization (Clerk)

- **Gating is decided on the server, in one function.**
  `canAccess(isAuthenticated, doc)` (`src/access/canAccess.ts`) is the only
  check, fed by `getViewer()` (`src/lib/auth/getViewer.ts`), which reports
  unauthenticated whenever Clerk is unconfigured. The proxy
  (`src/proxy.ts`) only makes the session available and gates nothing;
  `<Protect>`-style client components are UX, never the check. Mechanism:
  `docs/AUTH.md` § Gating model.
- **A gated body leaves the server only after `canAccess` passes.**
  `toDetail` in `src/lib/cms/articlesRepo.ts` runs the check first and only
  then calls `getGatedPostContent()`, the one read that overrides the field
  gate [source].
- **Every surface that emits article text applies the same gate**, and a
  new surface must too. Today [source]: the article page (`toDetail`); the
  search index (`getCmsSearchArticles` calls `canAccess(false, post)`, so a
  gated post contributes only its excerpt); Corvus retrieval (the SQL
  predicate in `src/lib/ai/retrieval.ts`, `docs/AI.md` § What an anonymous
  visitor can retrieve); and `/llms-full.txt`, which emits each article's
  description, never its body (`src/app/(frontend)/llms-full.txt/route.ts`).
  For the LLM discovery endpoints the rule is: per-article metadata +
  summaries (deliberately NOT full bodies — full-corpus emission would leak
  gated content; keep it that way). _Moved from `docs/SEO.md` § Indexing
  surfaces (#247)._ And across every public surface: Never index gated
  bodies: teasers only in any public payload, feeds included. _Moved from
  `docs/SEO.md` § Rules (#247 addendum 3)._ A feed item carries the
  article's `description`, not its body
  [source: `src/app/(frontend)/feed.xml/route.ts:54`].
- **Identity is resolved server-side, never taken from the request body.**
  Rate limits, the anonymous free-message gate and retrieval grounding key
  on the Clerk session and the trusted IP [source:
  `src/app/api/ai/chat/route.ts:104-105` (IP and viewer resolved from the
  request headers and the Clerk session), `:115-117` (limiter key: Clerk
  `userId`, else the HMAC of the IP), `:163` (free-message count by IP),
  `:272` (retrieval gets `viewer.isAuthenticated`);
  `src/lib/security/guardrails.ts:272` (`getRequestClientIp`: `x-real-ip`,
  else the rightmost `x-forwarded-for` hop, never the leftmost)].
  Mechanism: `docs/AI.md` § Guardrails.
- **Redis keeps no raw IP.** Every IP-derived key in Upstash carries
  `anonIpKeyDigest(ip)`, an HMAC-SHA256 of the IP keyed by `PAYLOAD_SECRET`,
  never the address itself: chat's anonymous limiter key
  (`ip:<digest>`), the free-message counter (`chat:anon-free:<digest>`)
  and the two public forms' limiter keys, the contact form's
  (`contact:<digest>`, #364) and the newsletter form's
  (`newsletter:<digest>`, #367). An
  outage report redacts the IP, the digest and the key [source:
  `src/lib/security/chatGate.ts:57` (`anonIpKeyDigest`),
  `src/app/api/ai/chat/route.ts:115-117` (key), `:126` (redaction),
  `src/lib/security/publicFormGuard.ts:70` (both forms' key), `:82`
  (redaction); each key is pinned to the digest in its route's
  `route.test.ts` (`src/app/api/contact/`, `src/app/api/newsletter/`)]. Both
  forms still pass the raw IP to Cloudflare Turnstile as `remoteip`, which
  stores nothing in Redis. A new IP-keyed store follows the same rule.
- **`redirect_url` after sign-up is followed only to this site.** The custom
  sign-up form (#377) sends a new member on to `redirect_url` itself, where
  Clerk's prebuilt form used to. The value is parsed the way a browser parses
  it and accepted only as a path on this origin, on the form and again on the
  Google callback page; anything else (another origin, `//host`, `/\host`,
  `javascript:`, a same-origin URL whose path is `//host`) falls back to the
  home page [source: `safeRedirectPath`, `src/lib/auth/safeRedirect.ts`;
  cases pinned in `safeRedirect.test.ts`]. A new surface that follows a
  `redirect_url` uses the same function.
- Until Clerk Billing is enabled, `gated` means signed in and nothing more:
  `requiredPlan` and `requiredFeature` are dormant fields `canAccess`
  ignores [source: `src/access/canAccess.ts`].

## Corvus (AI chat)

Rules moved verbatim from `docs/AI.md` (#247 addendum 3); the mechanisms
stay there.

- Never trust or forward client roles other than user/assistant history.
  _Moved from § Server enforcement._ The route drops every `system` message
  before the model call, and the system prompt is built server-side
  [source: `src/app/api/ai/chat/route.ts:179-180`, `:241`].
- **Never a live tool call from the chat route.** _Moved from § Public
  GitHub repos as a collection._ `[measured 2026-09-27]` the route passes no
  `tools` to the model (`git grep -n tool` on the route: no hits).
- A repository made private or deleted must stop being retrievable.
  _Moved from § Never-leak_, which describes the three mechanisms that carry
  it (`assertIndexableRepo` in `src/lib/ai/githubRepos.ts:109`, among them).

## Consent and analytics data

- **Nothing that needs consent runs before it where consent is required.**
  GA4 is the only consent-gated vendor. It is registered only on production
  with a measurement id, through c15t's Google tag with its always-load flag
  turned off [source: `src/components/consent/consent-config.ts`]. Where the
  geo cookie says consent is required, or geo is unknown (fail-closed,
  `src/lib/consent/jurisdiction.ts`), `measurement` stays denied until the
  visitor grants it, and until then nothing is loaded from or sent to a
  Google host (#361; before it, the always-loaded tag sent a cookieless
  consent-mode ping). **One exception, open in #375:** a visitor whose
  `measurement` was granted automatically in a region that does not ask, and
  who then loads the site from one that does or from an unknown one, has that
  stored grant restored as the page starts, so the tag loads on that page
  (`docs/ANALYTICS.md`, "What is not covered"). Mechanism:
  `docs/ANALYTICS.md`; browser proof: `e2e/consent-google-analytics.spec.ts`.
- **No other script that sets non-essential cookies or identifies a visitor
  loads.** `[measured 2026-09-27]` the frontend's third-party scripts are
  Vercel Analytics and Speed Insights (cookieless), Cloudflare Turnstile
  (security, essential) and GA4 through c15t. A new analytics or marketing
  vendor ships as a consent-gated script in a consent category.
- **Error reports carry no identity.** No `sendDefaultPii`, no Clerk
  identity in `Sentry.setUser`; the one user field is the random per-tab id
  from `src/lib/observability/sessionId.ts`. `[measured 2026-09-27]` the
  only `Sentry.setUser` call is in `src/instrumentation-client.ts`, and
  `sendDefaultPii` appears nowhere in the tree. Changing that
  is a change to `isSessionIdAllowed()` and to `docs/ANALYTICS.md`
  § Sessions in Sentry. The client-side Sentry **Logs** calls carry no
  identity either `[measured 2026-09-27, at b4b596b]`:
  - `reportHistoryWriteRefusal` (`clientTelemetry.ts`), the logger for the
    history-write guard that `src/instrumentation-client.ts` installs on every
    route (#268; it was `/tech` only, as `tech.history.write_dropped`, before),
    logs `history.write_dropped` with `{ method, outcome, path }` only, where
    `path` is `window.location.pathname` (no query string, no user data) and
    `outcome` is `retrying`, `gave_up` or `retry_failed` (a refused replace
    is retried since #272, so `dropped` is no longer logged), once
    per method-and-outcome pair per page load.
  - The guard (`src/lib/history/historyWriteGuard.ts`) contains only the
    browser's history-throttle `SecurityError` (matched on name and message,
    so the cross-origin `SecurityError` is not mistaken for it)
    [source: `isHistoryThrottleError`]. Any other error from a call on the
    caller's stack is rethrown untouched; one from a timer retry has no caller
    to reach, so it is logged `retry_failed` and the retry stops, not
    rethrown [source: `installHistoryWriteGuard`'s `scheduleRetry`].
  - The server and edge runtimes redact email addresses from breadcrumbs
    and spans (`beforeBreadcrumb`, `beforeSendSpan`) and from the
    request an error or transaction event carries (`beforeSend`,
    `beforeSendTransaction`), because Resend's SDK puts a contact's
    address in its URL path, which Sentry's fetch instrumentation records,
    and Sentry's HTTP integration captures incoming request bodies, where
    the newsletter and contact forms post one (#409). Strings are redacted
    four levels deep, an `Error` keeps its name, message and stack, and a
    container nested deeper is replaced with `[redacted]` [source: `src/lib/observability/sentryConfig.ts`,
    `redactEmailAddresses`].
  - `clientTelemetry.ts` sends a speech-recognition error code and a
    boolean [source: `src/lib/observability/clientTelemetry.ts:36-39`].
- **A mailing-list contact is captured only with consent.** The contact
  form captures only when its unchecked-by-default opt-in is set and the
  message was delivered [source: `src/app/api/contact/route.ts`]; sign-up
  capture comes through the verified Clerk webhook, and only for an account
  whose sign-up ticked the same unchecked-by-default opt-in (#362) [source:
  `src/app/api/clerk/webhook/route.ts`, `hasMailingListOptIn`]. The
  Newsletter Signup block's form is **double opt-in** (#411): a submit only
  emails the address a signed, expiring link, and the address joins the
  list, or rejoins it after an unsubscribe (#407), only when its owner
  presses Confirm on the page the link opens. So no one can put another
  person on the list, or back on it; the form can still send a
  confirmation to someone else's address, which its rate limit bounds, and
  Turnstile too when `TURNSTILE_SECRET_KEY` is set. Every success reply is
  the same and every failure reply (503, when Resend fails) is the same
  (#409), so neither says whether the address was already on the list
  [source: `src/app/api/newsletter/route.ts`,
  `src/app/api/newsletter/confirm/route.ts`,
  `src/lib/email/newsletterConfirmToken.ts`]. Mechanism:
  `docs/AUTH.md` § Email capture.
- **Broadcasts:** Respect the marketing consent field, and honor
  per-contact unsubscribe state before any broadcast ever sends. _Moved from
  `docs/AUTH.md` § Email capture (#247 addendum 2)._

## Dependency advisories

- **The bar: a PR into `develop` does not introduce a runtime dependency
  with a high- or critical-severity advisory.**
  `.github/workflows/dependency-review.yml` fails such a PR
  (`fail-on-severity: high`, default `runtime` scope); moderates and
  dev-only paths are reported, not blocking. On `develop → master` the
  check is warn-only, because that diff re-evaluates the whole tree.
  `[measured 2026-09-27, GitHub rules API]` `dependency-review` is a
  required status check on `master`, where warn-only lets it pass; `develop`
  requires no checks, so a red run on a `develop` PR is held by review, not
  by branch protection. Rationale: `docs/DEPENDENCIES.md` § Supply-chain
  policy.
- **Residual advisories are tracked in #100**; `pnpm audit` and
  `pnpm audit --prod` are the check (`docs/DEPENDENCIES.md`). Fix one with an
  in-range bump where one exists. An override is the lever when none does.
- **An agent may add an override that crosses a declared range, without
  asking Brandon, when all of these hold** (Brandon, 2026-11-15, #347):
  - it clears a known advisory or a documented bug;
  - it is capped at the fixing version within the same major: an exact
    version, `~`, or a bounded range, never an open `^` that keeps floating;
  - the build and tests pass;
  - one row in the table below records it.
- **Brandon decides** an override that crosses a major version, one with no
  advisory or bug behind it, and anything the dependency-review check or
  `pnpm audit` flags.
- **An override is dropped once its parent catches up.** The Dependabot
  cleanup (the agent sweep of open Dependabot alerts, as in #345) checks
  each row's exit, and so does any bump of a row's parent package.

| Override                           | Advisory or bug                                                                                          | Parent and declared range                                                            | Crossed path                                                                                       | Exit                                                                                                                                                       | Decided                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `@modelcontextprotocol/sdk` 1.32.2 | GHSA-f897-62hf-6gxq, -6qxp-vccf-f47h, -46jr-4wx8-v453, -rvq5-wwqv-78pq, -6prh-2h8m-c8cw, -22jm-h49p-29qw | `@payloadcms/plugin-mcp` 3.93.0: exactly 1.30.0; `mcp-handler` 1.1.0: exactly 1.26.0 | prod                                                                                               | a Payload release pins ≥1.32 and the `mcp-handler` it resolves declares a range that admits ≥1.32.0 (evidence: `docs/DEPENDENCIES.md` § Known unmet peers) | Brandon, 2026-11-14 (#312) |
| `dompurify` `^3.4.17`              | Dependabot alerts #289, #371, #391, #392, #393                                                           | `monaco-editor` 0.56.0 (Payload's admin code field): exactly 3.4.8                   | prod (admin)                                                                                       | a `monaco-editor` release the tree resolves pins ≥3.4.17                                                                                                   | Brandon, 2026-11-15 (#345) |
| `prismjs` 1.30.0                   | GHSA-x7hr-w5r2-h6wg                                                                                      | `refractor` 3.6.0, via `@mapbox/rehype-prism` 0.9.0: `~1.27.0`                       | prod (client bundle)                                                                               | #350: a rehype plugin on `refractor` ≥4.7.0 (4.0–4.6 still depend on `prismjs` <1.30), and `pnpm why prismjs` shows nothing below 1.30.0                   | Brandon, 2026-11-15 (#347) |
| `better-sqlite3` `^13.0.3`         | v11 aborts the Evalite job at worker teardown (exit 134; `pnpm-workspace.yaml` comment)                  | `evalite` 0.19.0: `^11.6.0` (crosses a major)                                        | dev and CI; the prod graph also holds it as `drizzle-orm`'s optional peer, never loaded (Postgres) | an `evalite` release declares `^13`                                                                                                                        | Brandon, 2026-11-15 (#347) |

- **A mitigation does not clear an advisory.** Before #312's override, the
  MCP SDK's advisories stayed open behind a local mitigation, and the
  mitigation stays in place after it: 1.32's own tool-input limit
  (`maxToolInputElements`) cannot be turned on through the Payload plugin.
  `src/plugins/limitMcpRequests.ts` is a **partial** local mitigation for
  authenticated `POST /api/mcp` bodies: it bounds body size, batch size, JSON
  value count and nesting depth, refusing limit violations with a 413 before
  `mcp-handler` runs. The named constants and their rationale are linked from
  `docs/PAYLOAD.md` § Operating via MCP, "Request limits". It reads the body
  only inside the plugin's `overrideAuth`, after the plugin's own API-key
  check, apart from a `Content-Length` header check that reads nothing. It
  does **not** bound every request: Payload's method-override handling
  (`X-HTTP-Method-Override: GET` or `X-Payload-HTTP-Method-Override: GET` on
  a `POST`) reads the body with no limit before any endpoint or key check, on
  every `/api` route, and that remains open. Behaviour through the deployed
  Node adapter has not been measured.
- **New versions wait a day.** `minimumReleaseAge: 1440` in
  `pnpm-workspace.yaml` (#222); an exception in `minimumReleaseAgeExclude`
  needs a written reason beside it. Details: `docs/DEPENDENCIES.md`
  § Release-age gate.

## Operational data and infrastructure

**Operational** rules, moved here verbatim (#247) — from
`docs/MAINTENANCE.md` unless an entry says otherwise; the procedures around
them stay in the source doc.

- **Database backups** (`.github/workflows/db-backup.yml`): It is never an
  Actions artifact: this repo is PUBLIC, and a public repo's artifacts are
  downloadable by any logged-in GitHub user. The dump stays encrypted in the
  private bucket too — encryption is load-bearing, not optional. _Moved from
  § Recurring, the database-backups entry._
- **Restored data is real.** It holds live content and the users table.
  Never commit it, never attach it to an issue, never upload it anywhere.
  _Moved from § Local database from backups._
- **Local database container:** keep the loopback prefix — the container
  holds real content behind the well-known `postgres` password, so it must
  never listen beyond the machine. _Moved from § Local database from
  backups, the port-conflicts note._
- **Rate limiting (Upstash):** Without Upstash env, dev fails open (never
  ship that state to production). _Moved from `docs/AI.md` § Guardrails
  (#247 addendum 2)._ `[source: src/lib/security/limiter.ts:13-26]` a
  production build without it logs a loud error and degrades to
  per-instance memory limits. **When Upstash is configured but failing**
  (a plan cap, an outage, a malformed reply such as #390's
  `s.map is not a function`, or a stall past `@upstash/ratelimit`'s 5 s timeout, which it would otherwise answer as a success), chat and the two public forms (contact, newsletter; one shared guard, `src/lib/security/publicFormGuard.ts`) **fail closed**:
  one Sentry capture per request (`LimiterUnavailableError`, cause kept, IP
  and limiter key redacted) and a 503 — chat's carries
  `code: 'chat_unavailable'`, which the chat UI shows as "temporarily
  unavailable". Chat closes because every turn spends model tokens; the
  contact form closes because open, it would be an unlimited sender into
  Brandon's inbox and the Resend quota, and the newsletter form because it
  would be an unlimited writer into the mailing list. `[source:
src/lib/security/limiterOutage.ts]`
- **Supabase Data API:** Do NOT add `public` (or any schema containing real
  tables) to the exposed-schemas list, and do NOT create tables in `api`;
  re-check both on the production project at promotion. _Moved from
  § Recurring, the Supabase entry._
