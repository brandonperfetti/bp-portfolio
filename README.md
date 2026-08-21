# BP Portfolio (brandonperfetti.com)

Personal portfolio and content platform — the v4 ground-up rebuild on **Next.js 16
(App Router) + Payload CMS 3** over Supabase Postgres. Every page on the site is
constructible from CMS blocks alone: layout grammar (containers → columns → 20+
blocks), a six-type hero system, carousels, and reader actions (Copy page / Share /
generated OG cards) are all editorial acts, not deploys. The site ships with
**Corvus**, a general-purpose AI assistant with server-enforced guardrails, and is
hardened for production: database-level RLS, Sentry monitoring, and server-side
auth gating throughout. Notion is a planning surface only — it has no runtime
integration.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack) · [React 19](https://react.dev/) · [TypeScript 5](https://www.typescriptlang.org/)
- [Payload CMS 3](https://payloadcms.com/) — the single content source (Postgres via Drizzle/node-postgres; Supabase in staging/prod, default-deny RLS)
- [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first) + [shadcn/ui](https://ui.shadcn.com/) · [GSAP](https://gsap.com/) motion · [Swiper](https://swiperjs.com/) carousels · [shaders.com](https://shaders.com) hero
- [Clerk](https://clerk.com/) end-user auth + server-side content gating · [Vercel AI SDK](https://sdk.vercel.ai/) (OpenAI `gpt-5-mini`; Anthropic optional) for Corvus
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

`DATABASE_URI` decides your database. Local dev works against any Postgres 16+
(the CI image is `pgvector/pgvector:pg16`); staging/production use Supabase's
transaction-mode pooler string. The app boots with only a database — Blob, Clerk,
AI, Resend, Sentry, and Turnstile are all env-gated and simply stay inert until
their keys exist.

## Scripts

`pnpm dev` / `pnpm build` / `pnpm start` — the Next lifecycle (Turbopack dev).
`pnpm typecheck` · `pnpm lint` · `pnpm format` / `format:check` — static gates.
`pnpm test` (unit) · `pnpm test:storybook` (browser-mode interaction + a11y) ·
`pnpm test:e2e` (Playwright, runs under reduced motion) · `pnpm eval` /
`pnpm eval:ci` (Corvus behavior against a threshold).
`pnpm migrate` / `migrate:create` — Payload migrations (committed, the schema
source of truth; dev push is opt-in via `PAYLOAD_DB_PUSH`).
`pnpm generate:types` / `generate:importmap` — regenerate the committed Payload
artifacts after any schema/plugin change (CI fails on drift).
`pnpm storybook` — component workbench. `pnpm payload` — Payload CLI.

## How content works

Payload → typed repo modules (`src/lib/cms/*Repo.ts`) → React Server Components.
Editors compose pages from a block library (containers with backgrounds/full-bleed,
columns with sticky rails, prose, media, carousels with five effects, testimonials,
stats, FAQs, …) plus a hero group (`blank | none | standard | shader | image |
carousel`). Collection hooks pair `revalidateTag` with `revalidatePath`, so admin
edits go live in seconds without a redeploy. Articles carry reader actions —
Copy page (Markdown), Share targets, and branded/generated OG cards — all
CMS-configurable.

## Corvus

`/corvus` is a general-purpose assistant (Brandon's work as home base, not a
fence) on the Vercel AI SDK. The system prompt is **server-enforced**; anonymous
visitors get a few free messages (Upstash-backed, per-IP) before a Clerk sign-in
gate; signed-in users get higher ceilings keyed by user id. Voice dictation ships
as progressive enhancement via the Web Speech API (Chrome/Edge/Safari; graceful
notes elsewhere). Behavior is eval-gated in CI (`pnpm eval:ci`).

## Branches & deployment

GitFlow: `master` → production ([brandonperfetti.com](https://brandonperfetti.com));
`develop` → integration; the active QA branch serves
[staging.brandonperfetti.com](https://staging.brandonperfetti.com). Vercel builds
with corepack-pinned pnpm; migrations run on deploy (`pnpm migrate && pnpm build` —
the committed chain is idempotent and tracked in `payload_migrations`, so re-runs
no-op). CI runs the quality job (lint/types/unit) on every branch push; Build·E2E
and Evalite run on pushes to `develop`/`master`/`rebuild/**` and on PRs targeting
`develop`/`master`. The staging database gets nightly encrypted `pg_dump`
backups via GitHub Actions.

## Documentation map

`AGENTS.md` / `CLAUDE.md` symlink to `.github/copilot-instructions.md` — the thin
top layer (invariants + index) for AI agents and humans alike. Depth lives in
`docs/`: `ARCHITECTURE`, `PAYLOAD` (collections/blocks/migrations/MCP), `FEATURES`,
`NAVIGATION`, `STATE`, `STYLING`, `DESIGN`, `AI` (Corvus/guardrails/evals), `AUTH`,
`CONTENT_WORKFLOW` + `CONTENT_STYLE`, `SEO`, `DEPENDENCIES`, `WORKFLOW`,
`ACCESSIBILITY`, `TESTING`, `MAINTENANCE` (upkeep + watchpoints + the production
promotion checklist), and `DOCUMENTATION` (these standards).

## Troubleshooting

- **Admin misbehaves (empty SEO tab, dead editor)** — stale generated artifacts:
  `pnpm generate:types && pnpm generate:importmap` (CI gates both).
- **Pre-push fails on `.next` types after a route rename** — stale dev-server
  output: `rm -rf .next` and retry.
- **pnpm "ignored builds" error** — a new dep's postinstall needs an
  `allowBuilds` entry in `pnpm-workspace.yaml`.
- **Lexical error #17 on an article** — an editor feature for a migrated node
  type was removed; see `docs/PAYLOAD.md`.
- More in `docs/MAINTENANCE.md` (incl. the >2MB list-cache watchpoint and the
  cacheComponents migration that retires it).
