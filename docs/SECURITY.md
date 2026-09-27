# Security

The security standard for this repo: the rules a change is held to, by its
author and by review. Each rule is true of the tree as measured on
2026-09-27 (wave 9, based on `ef07dbd`) unless it is marked **Intended**,
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

- **Only `NEXT_PUBLIC_*` reaches the browser, so nothing secret carries that
  prefix.** Next.js inlines `NEXT_PUBLIC_` variables into client bundles at
  build time. `[measured 2026-09-27]` the names in use are all public by
  design: the Clerk publishable key and sign-in/up paths, the GA4
  measurement id, the Sentry DSN, environment and Spotlight flag, the site
  name and URL, the Turnstile site key and chat-protection flag, and
  Vercel's own `NEXT_PUBLIC_VERCEL_ENV`.
- **A secret is read on the server only** — route handlers, server
  components, Payload hooks and config, scripts. `[measured 2026-09-27]`
  none of the 46 modules whose directive is `'use client'` reads a variable
  other than `NEXT_PUBLIC_*` or `NODE_ENV`. Passing a secret to a client
  component as a prop sends it to the browser just the same; that half is
  held by review.
- **Shared-secret routes compare with `isValidSecret()`**
  (`src/lib/security/timingSafeSecret.ts`: SHA-256 of both sides, then
  `timingSafeEqual`), **and fail closed** — it returns `false` when the
  expected secret is unset or empty. `[measured 2026-09-27]` the three
  shared-secret routes use it (`/api/revalidate`, `/api/media/ingest`,
  `/next/preview`), and nothing in `src` or `scripts` compares a
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
  `routeWithBypass` in `scripts/lib/page-diff.mjs` is the worked shape.
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
- **MCP API keys** (an admin-equivalent secret, `docs/PAYLOAD.md`
  § Operating via MCP): Scope keys with the plugin's
  per-collection/per-operation permission checkboxes (adding a collection
  to the plugin config adds permission COLUMNS — a schema change requiring
  `migrate:create`, and new permissions default to unchecked). Store keys
  in project-scoped keychain entries, rotate on any suspicion, and never
  grant delete where find+update suffices. _Moved from `docs/PAYLOAD.md`
  § Operating via MCP, "Key posture (review m8)"._
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
  `CMS_REVALIDATE_SECRET` and `PREVIEW_SECRET`, never the staging ones.

## Payload access control

- **Every collection and global declares `access` explicitly.**
  `[measured 2026-09-27]` all 11 collections in `src/collections/` and all
  5 globals in `src/globals/` do. The posture (helpers in `src/access/`):
  - **Writes** — `create`, `update`, `delete`, and a global's `update` —
    are `authenticated`: a signed-in Payload admin user.
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
  which `/next/preview` enables only after `PREVIEW_SECRET` **and** a
  Payload user check; and `getGatedPostContent()`, called only after
  `canAccess()` passes (next section).
- **Database: default-deny RLS on every table in `public`.** A migration
  that creates a table enables Row Level Security on it and on its `_v` /
  `_rels` companions in the same file; CI fails the build otherwise
  (`scripts/check-migrations-rls.mjs`, #117). Never set
  `FORCE ROW LEVEL SECURITY`. Procedure and the grant revocations behind
  it: `docs/PAYLOAD.md` § New-table RLS convention.

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
  surfaces (#247)._
- **Identity is resolved server-side, never taken from the request body.**
  Rate limits, the anonymous free-message gate and retrieval grounding key
  on the Clerk session and the trusted IP [source:
  `src/app/api/ai/chat/route.ts:74-75` (IP and viewer resolved from the
  request headers and the Clerk session), `:85-87` (limiter key: Clerk
  `userId`, else the HMAC of the IP), `:127` (free-message count by IP),
  `:227` (retrieval gets `viewer.isAuthenticated`);
  `src/lib/security/guardrails.ts:272` (`getRequestClientIp`: `x-real-ip`,
  else the rightmost `x-forwarded-for` hop, never the leftmost)].
  Mechanism: `docs/AI.md` § Guardrails.
- Until Clerk Billing is enabled, `gated` means signed in and nothing more:
  `requiredPlan` and `requiredFeature` are dormant fields `canAccess`
  ignores [source: `src/access/canAccess.ts`].

## Consent and analytics data

- **Nothing that needs consent runs before it where consent is required.**
  GA4 is the only consent-gated vendor. It loads only on production with a
  measurement id, through c15t's Google tag with Consent Mode v2 defaults
  denied [source: `src/components/consent/consent-config.ts`]. Where the
  geo cookie says consent is required, or geo is unknown (fail-closed,
  `src/lib/consent/jurisdiction.ts`), `measurement` stays denied until the
  visitor grants it: GA4 sets no cookies, and Google receives only the
  cookieless consent-mode ping disclosed in the dialog. Mechanism:
  `docs/ANALYTICS.md`.
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
  § Sessions in Sentry.
- **A mailing-list contact is captured only with consent.** The contact
  form captures only when its unchecked-by-default opt-in is set and the
  message was delivered [source: `src/app/api/contact/route.ts`]; sign-up
  capture comes through the verified Clerk webhook. Mechanism:
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
- **Residual advisories are tracked, never force-overridden** — #100 holds
  them; `pnpm audit` and `pnpm audit --prod` are the check
  (`docs/DEPENDENCIES.md`).
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
  per-instance memory limits.
- **Supabase Data API:** Do NOT add `public` (or any schema containing real
  tables) to the exposed-schemas list, and do NOT create tables in `api`;
  re-check both on the production project at promotion. _Moved from
  § Recurring, the Supabase entry._
