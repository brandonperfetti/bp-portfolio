# Brandon Perfetti's Portfolio

Personal portfolio and content platform built on Next.js App Router with a provider-switched CMS runtime (Notion primary, local fallback), migrated from [Tailwind Plus Spotlight](https://tailwindcss.com/plus/templates/spotlight) and customized with production features (article search/filtering, Hermes AI chat, contact workflow, SEO routes, and custom content pages).

## Table of Contents

1. Overview
2. Tech Stack
3. Quick Features
4. Environment Variables
5. Local Development
6. Build and Run
7. Testing
8. Documentation Map
9. Troubleshooting

## Overview

This project is the active codebase for [brandonperfetti.com](https://brandonperfetti.com) and includes:

- Content-driven article system with provider switch:
  - `local`: fallback mode (non-Notion providers + empty article-safe states)
  - `notion`: Notion CMS article projection + canonical Source Article page blocks
- Search in two places:
  - Header modal (`Cmd/Ctrl + K`) with title/description/full article body matching.
  - Articles page explorer with topic chips + query-string syncing.
- Dynamic article route at `/articles/[slug]` with `generateStaticParams`, `dynamicParams=true`, and route-level `generateMetadata()`.
- Hermes chat experience with streaming OpenAI responses and image generation.
- Contact form integration through SendGrid mail API.
- SEO endpoints: sitemap, robots, RSS feed metadata.

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [TypeScript 5](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [GSAP](https://gsap.com/) for motion primitives and choreography
- [Headless UI](https://headlessui.com/) (menu/popover primitives)
- [SendGrid](https://sendgrid.com/) for contact + marketing list APIs
- [OpenAI API](https://platform.openai.com/docs/api-reference) for Hermes chat + image generation
- [Heroicons](https://heroicons.com/) + project-local icon components

## Quick Features

- Home page with article highlights, contact card, and work/resume summary.
- Reusable motion system for headline, reveal, parallax, and hover animations.
- Articles route with full-text + topic filtering.
- Global header modal search (`Cmd/Ctrl + K`).
- Hermes AI chat with streaming text and image generation modes.
- Hermes input supports multiline prompts (`Enter` to send, `Shift+Enter` for newline).
- SendGrid-backed contact workflow (newsletter API is present; home-page newsletter UI is currently hidden).
- SEO routes: sitemap, robots, and feed endpoint metadata.

## Environment Variables

Start from `.env.example` and copy into `.env.local` (or `.env`) in project root.

```bash
cp .env.example .env.local
```

This file includes the minimal runtime env contract. Full Notion CMS setup and operational details live in `docs/NOTION_CMS.md`.

### Required

```bash
NEXT_PUBLIC_SITE_URL=...
OPENAI_API_KEY=...
SENDGRID_API_KEY=...
```

### Optional

```bash
# Newsletter list destination (either key supported)
SENDGRID_MAILING_ID=...
# or
SENDGRID_LIST_ID=...

# Regional SendGrid API base (optional)
# set to "eu" for EU residency account routing
SENDGRID_DATA_RESIDENCY=eu

# Contact form routing overrides
CONTACT_TO_EMAIL=you@example.com
CONTACT_FROM_EMAIL=no-reply@example.com
```

### CMS switch

```bash
# local = fallback mode (hard-coded providers + no local article corpus)
# notion = Notion CMS providers
CMS_PROVIDER=local
```

### Notion CMS automation/auth (when `CMS_PROVIDER=notion`)

```bash
# Manual sync endpoint auth
CMS_REVALIDATE_SECRET=...
# Cron endpoint auth
CRON_SECRET=...
# Webhook auth/verification
NOTION_WEBHOOK_VERIFICATION_TOKEN=...
NOTION_WEBHOOK_SECRET=...
```

For full Notion configuration (all `NOTION_*` env vars, webhook/revalidate secrets, projection sync, runbooks), see:

- `docs/NOTION_CMS.md`

### Tech Curation (Notion)

The `Portfolio CMS - Tech` database is maintained by the tech curation cron using GitHub signals.

- Recency is gated with `GITHUB_TECH_MAX_REPO_AGE_MONTHS` (default: `24`) so old repos do not dominate current stack telemetry.
- Auto-create remains catalog-driven (high-confidence technologies only), then rows are enriched with summary/reference/logo and Cloudinary-hosted `Logo URL`.
- Site visibility is controlled in Notion:
  - `Status = Published` to show on the site.
  - `Featured = true` only for highlighted tech sections.

## Local Development

Install dependencies:

```bash
npm install
```

Run standard dev server:

```bash
npm run dev
```

App default URL: [http://localhost:3000](http://localhost:3000)

## Build and Run

Production build:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

Lint:

```bash
npm run lint
```

Uses ESLint flat config in `eslint.config.mjs` (not legacy `.eslintrc*`).

Format:

```bash
npm run format
```

Format check (no writes):

```bash
npm run format:check
```

Type check:

```bash
npm run typecheck
```

## Testing

Unit/integration tests (Vitest):

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```

Coverage:

```bash
npm run test:coverage
```

E2E smoke (Playwright):

```bash
npm run test:e2e
```

## Git Hooks

This repo uses Husky hooks for local quality gates:

- `pre-commit`: `npm run format:check` and `npm run lint`
- `pre-push`: `npm run typecheck` and `npm run test`

Hooks are installed via:

```bash
npm run prepare
```

## Documentation Map

This repo uses progressive disclosure docs for coding agents and collaborators.

Primary instruction entrypoint:

- `.github/copilot-instructions.md`

Compatibility entry files (symlinked):

- `AGENTS.md`
- `CLAUDE.md`

Detailed topic docs live in `docs/`:

- `docs/ARCHITECTURE.md`
- `docs/FEATURES.md`
- `docs/STYLING.md`
- `docs/STATE.md`
- `docs/NAVIGATION.md`
- `docs/SEO.md`
- `docs/DEPENDENCIES.md`
- `docs/WORKFLOW.md`
- `docs/ACCESSIBILITY.md`
- `docs/TESTING.md`
- `docs/MAINTENANCE.md`
- `docs/DOCUMENTATION.md`
- `docs/NOTION_CMS.md`

If you need implementation internals first, start with:

- `docs/ARCHITECTURE.md`
- `docs/STATE.md`
- `docs/NAVIGATION.md`

## Troubleshooting

### SendGrid marketing API errors

If newsletter subscribe fails with access/scope errors, verify your SendGrid key has marketing contacts permissions and that `SENDGRID_MAILING_ID` / `SENDGRID_LIST_ID` is set.

### Hermes API failures

Confirm `OPENAI_API_KEY` is present and valid. Chat and image endpoints are server-side and return explicit JSON errors for missing keys.
If public Hermes routes start returning `429`/`403`, verify Hermes guardrail env settings (`HERMES_*`) and `TURNSTILE_SECRET_KEY` behavior.
If memory pressure is observed under high-cardinality traffic, tune optional in-memory guardrail controls: `HERMES_GUARDRAILS_MAX_BUCKETS` and `HERMES_GUARDRAILS_BUCKET_TTL_MS`.
