# BP Portfolio (brandonperfetti.com)

Personal portfolio and content platform — the v4 ground-up rebuild on **Next.js
16 (App Router) + Payload CMS 3** over Supabase Postgres. Every page on the site
is constructible from CMS blocks alone, the site ships with **Corvus** (a
general-purpose AI assistant with server-enforced guardrails), and the whole
thing is hardened for production: database-level RLS, Sentry monitoring, and
server-side auth gating throughout.

## Table of contents

1. [Overview](#overview)
2. [Tech stack](#tech-stack)
3. [Getting started](#getting-started)
4. [Environment variables](#environment-variables)
5. [Scripts](#scripts)
6. [How content works](#how-content-works)
7. [Corvus](#corvus)
8. [Testing](#testing)
9. [Branches & deployment](#branches--deployment)
10. [Documentation map](#documentation-map)
11. [Troubleshooting](#troubleshooting)

## Overview

The active codebase for [brandonperfetti.com](https://brandonperfetti.com):

- **Block-built pages** — a layout grammar (containers → columns → 20+ blocks),
  a six-type hero system (blank/none/standard/shader/image/carousel), carousels
  with five effects, testimonials, stats, FAQs, and more. New pages and section
  rearrangements are editorial acts, not deploys.
- **Article platform** at `/articles/[slug]` (slugs preserved from v3) with
  reader actions on every post: Copy page (Markdown), configurable Share
  targets, and branded or generated OG cards.
- **Corvus AI assistant** at `/corvus` — streaming chat with a server-enforced
  persona, anonymous free messages before a Clerk sign-in gate, Upstash-backed
  rate limits, and Web Speech voice dictation as progressive enhancement.
  Site-specific questions are answered from a pgvector retrieval index over
  published content, with citations back to the pages they came from — and the
  whole behavior is gated by live CI evals.
- **Consent-gated analytics** — GA4 loads only after explicit consent where
  consent is required (Consent Mode v2; jurisdiction detected at the Vercel
  edge, fail-closed), alongside an always-on cookieless Vercel Analytics
  baseline. Banner and dialog copy are CMS-editable via the CookieConsent
  global.
- **Server-side auth & gating** — Clerk end-user auth with content gating
  enforced in server code (`src/access/canAccess.ts`), never in UI components.
- **Instant publishing** — collection hooks pair `revalidateTag` with
  `revalidatePath`, so admin edits go live in seconds without a redeploy.
- **Production hardening** — default-deny RLS on every public table, Sentry
  error monitoring + logs across all three runtimes, Turnstile bot protection,
  and nightly encrypted database backups.
- **Motion with restraint** — GSAP choreography and a shaders.com animated
  hero, with `prefers-reduced-motion` honored by every animated surface.
- Notion is a **planning surface only** — it has no runtime integration.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack) · [React 19](https://react.dev/) · [TypeScript 5](https://www.typescriptlang.org/)
- [Payload CMS 3](https://payloadcms.com/) — the single content source (Postgres via Drizzle/node-postgres; Supabase in staging/prod, default-deny RLS)
- [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first) + [shadcn/ui](https://ui.shadcn.com/) · [GSAP](https://gsap.com/) motion · [Swiper](https://swiperjs.com/) carousels · [shaders.com](https://shaders.com) hero
- [Clerk](https://clerk.com/) end-user auth + server-side content gating · [Vercel AI SDK](https://sdk.vercel.ai/) (OpenAI `gpt-5-mini`; Anthropic optional) for Corvus, grounded by [pgvector](https://github.com/pgvector/pgvector) retrieval (`text-embedding-3-small`)
- [c15t](https://c15t.com/) headless consent management + GA4 (Consent Mode v2) · [Vercel Analytics](https://vercel.com/analytics) cookieless baseline
- [Upstash Redis](https://upstash.com/) rate limiting + chat quotas · [Resend](https://resend.com/) email · [Sentry](https://sentry.io/) monitoring · [Vercel Blob](https://vercel.com/storage/blob) media
- [Vitest](https://vitest.dev/) unit/component · [Storybook 10](https://storybook.js.org/) with interaction + a11y tests · [Playwright](https://playwright.dev/) e2e · [Evalite](https://evalite.dev/) AI evals
- **pnpm only** (`only-allow` + `packageManager` pin) · Node 24 (`.nvmrc`; engines `>=22 <25`)

## Getting started

```bash
nvm use                      # or fnm/asdf — .nvmrc pins Node 24
corepack enable              # honors the pnpm@11 packageManager pin
cp .env.example .env.local   # then fill in what you need (comments explain each var)
pnpm install
pnpm migrate                 # applies the committed migration chain to DATABASE_URI
pnpm dev                     # http://localhost:3000 · admin at /admin
```

The app boots with only a database — everything else stays inert until its keys
exist (see below).

Need a database, or real content to work against? `docker-compose.yml` starts a
local Postgres on the same image CI uses, and `pnpm db:local:refresh` restores
the newest nightly encrypted backup into it:

```bash
docker compose up -d --wait db   # pgvector/pgvector:pg16 on 127.0.0.1:5432
pnpm db:local:refresh            # newest PRODUCTION backup (--source staging for staging)
```

Prerequisites, the `.env.local` swap, and the port-conflict path are in
`docs/MAINTENANCE.md` § Local database from backups. The restored database
holds real content and the users table — keep it local.

## Environment variables

[`.env.example`](.env.example) is the annotated source of truth — every variable
carries a comment explaining what it does and where its value comes from. The
shape of the config:

- **Required**: `PAYLOAD_SECRET` and `DATABASE_URI`. Local dev works against
  any Postgres 16+ (the CI image is `pgvector/pgvector:pg16`); staging and
  production use Supabase's **transaction-mode** pooler string (port 6543) for
  the app, and the session-mode string (5432) only for `pg_dump`/restore.
- **Env-gated services** — Blob media, Clerk auth, Corvus AI (provider, model,
  quotas, and free-message knobs), Upstash rate limiting, Turnstile, Resend
  email, and Sentry are each activated by their key group and simply stay off
  without it. No service key is ever required to boot.
- **Removed in v4** (do not re-add): the Notion, Cloudinary, SendGrid, and Neon
  families — `.env.example` lists them explicitly as tombstones.

Real secrets live in Vercel (per-environment) and GitHub Actions — never in the
repo. Staging and production never share values.

## Scripts

`pnpm dev` / `pnpm build` / `pnpm start` — the Next lifecycle (Turbopack dev).
`pnpm typecheck` · `pnpm lint` · `pnpm format` / `format:check` — static gates.
`pnpm test` (unit) · `pnpm test:storybook` (browser-mode interaction + a11y) ·
`pnpm test:e2e` (Playwright, runs under reduced motion) · `pnpm eval` /
`pnpm eval:ci` / `pnpm eval:facts` (Corvus behavior against gating thresholds).
`pnpm corvus:backfill` — populate/repair the Corvus retrieval index (one run
per environment after the pgvector migration; hooks keep it current after
that).
`pnpm migrate` / `migrate:create` — Payload migrations (committed, the schema
source of truth; dev push is opt-in via `PAYLOAD_DB_PUSH`).
`pnpm db:local:refresh` — restore the newest nightly encrypted backup into the
local Docker Postgres (`--dry-run` checks the setup without touching anything).
`pnpm generate:types` / `generate:importmap` — regenerate the committed Payload
artifacts after any schema/plugin change (CI fails on drift).
`pnpm storybook` — component workbench. `pnpm payload` — Payload CLI.

## How content works

Payload → typed repo modules (`src/lib/cms/*Repo.ts`) → React Server
Components. Editors compose pages from the block library plus the hero group;
collection hooks revalidate tags and paths on save, so edits are live in
seconds. Articles carry the reader actions (Copy page, Share, OG cards), all
CMS-configurable per entry. The full block reference lives in
`docs/PAYLOAD.md`; the feature inventory in `docs/FEATURES.md`.

## Corvus

`/corvus` is a general-purpose assistant (Brandon's work as home base, not a
fence) on the Vercel AI SDK. The system prompt is **server-enforced**; client
messages are never trusted with it. Anonymous visitors get a few free messages
(Upstash-backed, per-IP) before a Clerk sign-in gate; signed-in users get
higher ceilings keyed by user id. Voice dictation ships as progressive
enhancement via the Web Speech API (Chrome/Edge/Safari; graceful notes
elsewhere). Site-specific questions are **grounded**: a pgvector index over
published content (refreshed by collection hooks; `pnpm corvus:backfill` for
population and repair) feeds retrieval, and answers cite the pages they came
from — or decline when the corpus lacks the answer. Behavior is eval-gated in
CI (`pnpm eval:ci` + `pnpm eval:facts`, thresholds that fail the build; empty
model outputs score zero by design). Full design in `docs/AI.md`.

## Testing

Four layers, each with its own command and CI gate:

- **Unit / component** (Vitest + Testing Library) — `pnpm test`; runs on every
  branch push and in the pre-push hook.
- **Storybook browser tests** — `pnpm test:storybook`; interaction + a11y
  checks per story (serious violations fail the story).
- **End-to-end** (Playwright) — `pnpm test:e2e`; boots the built app against a
  real Postgres, runs under reduced motion, and includes an axe WCAG-AA sweep
  of key routes in both themes. Locally, run it the way CI does
  (`pnpm seed:e2e` → `pnpm build` → `CI=1 pnpm test:e2e`) — dev-mode runs are
  flaky by construction; see `docs/TESTING.md`.
- **AI evals** (Evalite) — `pnpm eval:ci`; scores Corvus behavior against a
  threshold so persona regressions fail CI.

E2E and evals run on pushes to `develop`/`master`/`rebuild/**` and on PRs
targeting `develop`/`master`; feature-branch pushes run the quality job only
(lint/types/unit), so trunk and PRs are where the full gate lives.

## Branches & deployment

GitFlow: `master` → production ([brandonperfetti.com](https://brandonperfetti.com));
`develop` → integration; the active QA branch serves
[staging.brandonperfetti.com](https://staging.brandonperfetti.com). Vercel
builds with corepack-pinned pnpm; migrations run on deploy (`pnpm migrate &&
pnpm build` — the committed chain is idempotent and tracked in
`payload_migrations`, so re-runs no-op). The staging and production databases
each get nightly encrypted `pg_dump` backups via GitHub Actions.

## Documentation map

`AGENTS.md` / `CLAUDE.md` symlink to `.github/copilot-instructions.md` — the thin
top layer (invariants + index) for AI agents and humans alike. Depth lives in
`docs/`: `ARCHITECTURE`, `PAYLOAD` (collections/blocks/migrations/MCP), `FEATURES`,
`NAVIGATION`, `STATE`, `STYLING`, `DESIGN`, `AI` (Corvus/guardrails/retrieval/evals),
`ANALYTICS` (consent + GA4), `AUTH`, `CONTENT_WORKFLOW` + `CONTENT_STYLE`, `SEO`,
`DEPENDENCIES`, `WORKFLOW`, `ACCESSIBILITY`, `TESTING`, `MAINTENANCE` (upkeep +
watchpoints + the production promotion checklist), and `DOCUMENTATION` (these
standards).

## Troubleshooting

- **Admin misbehaves (empty SEO tab, dead editor)** — stale generated artifacts:
  `pnpm generate:types && pnpm generate:importmap` (CI gates both).
- **Pre-push fails on `.next` types after a route rename** — stale dev-server
  output: `rm -rf .next` and retry.
- **pnpm "ignored builds" error** — a new dep's postinstall needs an
  `allowBuilds` entry in `pnpm-workspace.yaml`.
- **Lexical error #17 on an article** — an editor feature for a migrated node
  type was removed; see `docs/PAYLOAD.md`.
- More in `docs/MAINTENANCE.md` (upkeep, watchpoints, and the production
  promotion checklist — the old >2MB list-cache watchpoint was retired by the
  cacheComponents migration).
