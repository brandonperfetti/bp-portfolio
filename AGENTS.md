# BP Portfolio v4 — AGENTS.md (canonical agent instructions)

This `AGENTS.md` is the canonical agent-instructions file for the repo — edit
it here and only here. `CLAUDE.md` imports it (`@AGENTS.md`), and
`.github/copilot-instructions.md` is a symlink to it.

**What this is:** brandonperfetti.com — Brandon Perfetti's personal portfolio
and content platform. Readers find and read articles, browse his work and
stack, and ask Corvus (the site's AI assistant); Brandon publishes and
rearranges everything from the CMS without a deploy. Intent, principles and
settled decisions: `docs/PRODUCT.md`.

Next.js 16 App Router with **Payload CMS** (Postgres/Drizzle) as the single
content source, Clerk auth + server-side gating, Corvus AI chat (Vercel AI
SDK), and a shaders.com animated hero. Notion is a **planning surface only** —
it is not a CMS and has no runtime integration.

## Essentials

- Package manager: **pnpm only** (`packageManager` pin + `only-allow`;
  lockfile is `pnpm-lock.yaml`). Never use npm/yarn.
- Primary commands: `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm test` ·
  `pnpm test:e2e` · `pnpm storybook` · `pnpm payload` · `pnpm migrate`
- Runtime baseline: Next.js 16 (Turbopack), React 19, TypeScript 5,
  Payload 3.x (all `@payloadcms/*` packages version-locked together),
  Tailwind v4 (CSS-first), Node `^22.23.4 || >=24.22.1 <25` (CI and
  `.nvmrc`: 24.22.3).

## CI gate

Run the local mirror of CI's `quality` job ("Lint · Types · Unit") — and only
that job — as a bash script before calling a change done:
[`docs/TESTING.md` § Local CI gate](docs/TESTING.md#local-ci-gate). The
"Build · E2E" and "Evalite (Corvus)" jobs are not mirrored; to exercise the two
reader discovery journeys, use the owned-instance recipe in
[`docs/TESTING.md` § Verifying a journey locally](docs/TESTING.md#verifying-a-journey-locally)
and the journey/proof map in `docs/JOURNEYS.md`.

## Invariants (do not regress)

These hold for every change, whatever the task. Hazards that bite only one kind
of work are named in **Before you…** below, at the point that work starts.

- **Payload is the only CMS.** Content flows Payload → repo modules
  (`src/lib/cms/*Repo.ts`) → RSC pages. Never reintroduce Notion runtime code.
- **Gating and the Corvus system prompt are server-enforced.** Access is
  decided in `src/access/canAccess.ts` + `getViewer()`; UI components like
  `<Protect>` are conveniences, never the enforcement point. Corvus's prompt
  lives in `src/lib/ai/corvus.ts`; client system messages are never trusted.
- **URLs:** `/articles/[slug]` shape and existing slugs are preserved from v3.
- **Reduced motion is honored by every animated surface** (static, functional
  DOM under `prefers-reduced-motion`), and **light/dark parity** is an
  acceptance criterion — audit both themes.

## Conventions

- Conventional commits with `Refs #n`; small, focused commits; one PR into
  `develop` per piece of work (`docs/WORKFLOW.md`). The PR template is
  `.github/pull_request_template.md`.
- TSDoc on every exported function/component/collection (enforced by
  `eslint-plugin-tsdoc`); document _why_, not _what_ (`docs/DOCUMENTATION.md`).
- New UI starts from shadcn/ui primitives (`src/components/ui`) and gets a
  Storybook story; serious a11y violations fail the story.
- Tests accompany behavior changes: Vitest unit/component, Playwright e2e,
  Evalite for Corvus behavior (`docs/TESTING.md`).

## Before you… (task routes)

Read the named doc before you start; the bold hazard is the one that has
already cost a session or broken production.

- **change a collection, global, field, block or plugin** → `docs/PAYLOAD.md`.
  **The same change must commit a migration** (`pnpm migrate:create`; CI fails
  without it), with `ENABLE ROW LEVEL SECURITY` for any new table and its
  `_v`/`_rels` companions in that same migration (§ Migrations) — call it out
  in the PR; then regenerate and commit `src/payload-types.ts` and
  `src/app/(payload)/admin/importMap.js` (§ Generated artifacts). **Never
  unregister a Posts rich-text node type** (lists, blockquote, upload): every
  migrated article breaks with Lexical error #17.
- **write Payload `find` or Local-API code (scripts, seeds, tests, MCP
  writes)** → `docs/PAYLOAD.md` § Local API gotchas: **`limit: N` still caps
  with `pagination: false`** (unlimited is `limit: 0`, or `pagination: false`
  with no `limit`), and
  **Local-API `draft: true` never reaches `req.query`**.
- **touch revalidation hooks or caching** → `docs/ARCHITECTURE.md` § Caching:
  **`revalidateTag(tag, { expire: 0 })`, never `'max'`** (#118).
- **touch Corvus, guardrails, retrieval or evals** → `docs/AI.md`. **The eval
  gates (`pnpm eval:ci`, `pnpm eval:facts`) fail the build: fix the behavior or
  the harness, never lower a floor.** Embeddings are their own provider axis
  (`AI_EMBEDDING_PROVIDER`, OpenAI-only) and the 1536 vector width is baked
  into DDL — a different width needs a migration.
- **add or upgrade a dependency** → `docs/DEPENDENCIES.md`. **Majors are
  pinned; `payload` + `@payloadcms/*` move as one set.**
- **touch auth, gating or email capture** → `docs/AUTH.md`; **secrets, HTML
  injection or access control** → `docs/SECURITY.md`.
- **touch analytics or consent** → `docs/ANALYTICS.md`.
- **change UI, tokens or motion** → `docs/STYLING.md`, `docs/DESIGN.md`,
  `docs/ACCESSIBILITY.md`. **shadcn primitives are themed at the token layer,
  never repainted per call site**, and every text/fill-edge token pair is
  AA-pinned by test (documented exceptions in `docs/STYLING.md` § shadcn
  primitives are themed at the token layer).
- **change routes, redirects or SEO surfaces** → `docs/NAVIGATION.md`,
  `docs/SEO.md`.
- **write or run tests** → `docs/TESTING.md`; which journeys are proven where,
  and what is not → `docs/JOURNEYS.md`.
  **Own the instance before claiming browser proof:** use the reader-lab
  entry in TESTING for the two discovery journeys; a skipped case is not proof.
- **decide whether a change fits the product** → `docs/PRODUCT.md`.
- **write or publish content** → `docs/CONTENT_WORKFLOW.md`,
  `docs/CONTENT_STYLE.md`.
- **make or replace a cover** → `docs/CONTENT_IMAGERY.md` (history:
  `docs/cover-history.json`). **Cloudinary's `sign-upload` forces
  overwrite, so every upload follows an exact-id pre-check with a control
  query; GPT Image 2 comes first; Midjourney is a recorded fallback only after
  two failed tuned rounds (two images each), and Brandon approves each attach
  and each publish.** The code-rendered covers under `archive/` are
  history, not a tool.
- **branch, hook, review or release** → `docs/WORKFLOW.md`. **The release
  lane writes the `CHANGELOG.md` section at the cut; only Brandon merges the
  release PR** (§ Releases).
- **tag a release or publish its GitHub Release** →
  `docs/RELEASE_RUNBOOK.md` and **§ Release authority** below. **Tag push
  stays tag-only; outside the grant an agent acts on a tag only on Brandon's
  explicit word for that tag.**
- **find where code lives** → `docs/ARCHITECTURE.md` (capability map),
  `docs/FEATURES.md` (behavior), `docs/STATE.md` (data flow).
- **upkeep or production promotion** → `docs/MAINTENANCE.md`.
- **edit these docs** → `docs/DOCUMENTATION.md`.

## Release authority

Brandon approved this standing grant on 2026-11-24 (#432), under the shared
procedure
[`post-merge-release.md`](https://github.com/brandonperfetti/agent-working-agreements/blob/v2026.11.24/procedures/post-merge-release.md).
It takes effect when the PR that records it merges into `develop`. The
commands and checks are in [`docs/RELEASE_RUNBOOK.md`](docs/RELEASE_RUNBOOK.md).

**Designated role:** the release lane, the session that opened the release PR
(`docs/WORKFLOW.md` § Releases), acting as a B0-qualified autonomous delivery;
in attended mode, B1's batch approval and owner-push rules apply.
**Repository and branch:** `brandonperfetti/bp-portfolio`, release branch
`master`. **Eligible:** a `develop` → `master` release PR that Brandon merged
himself, as a merge commit, after the review and checks in
`docs/RELEASE_RUNBOOK.md` § Verify the merge. **Allowed operations:**
fast-forward the local `master` only; create one annotated tag on that merge
commit; push only that tag; create or verify its GitHub Release from the
changelog section; read back the remote tag, Release and Production
deployment. **Identity:** the tagger is `brandon@brandonperfetti.com`; the
`Agent:` line names the agent; the Release is published through the authorized
`gh` session. **Downstream outcome:** the GitHub `Production` deployment for
the merge commit has state `success`. **Not granted:** merging any PR, pushing
a branch, moving, deleting or recreating a tag, editing a published Release,
Releases for tags that predate the grant, and `v2026.11.23`. Each of those
needs Brandon's explicit word for it.

## Agent skills

Per-repo config the engineering skills (`to-tickets`, `to-spec`, `triage`,
`wayfinder`, `code-review`) read instead of asking.

### Issue tracker

GitHub Issues on `brandonperfetti/bp-portfolio`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, kept as their own names. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.
