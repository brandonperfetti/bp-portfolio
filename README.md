# Brandon Perfetti Portfolio (`bp-portfolio`)

Personal portfolio and content platform built on Next.js App Router with a provider-switched CMS runtime (Notion primary, local fallback), migrated from Tailwind Plus Spotlight and customized with production features (article search/filtering, Hermes AI chat, contact workflow, SEO routes, and custom content pages).

## Table of Contents

1. Overview
2. Tech Stack
3. Quick Features
4. Environment Variables
5. Local Development
6. Build and Run
7. Documentation Map
8. Troubleshooting

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
- [Headless UI](https://headlessui.com/) (menu/popover primitives)
- [SendGrid](https://sendgrid.com/) for contact + marketing list APIs
- [OpenAI API](https://platform.openai.com/docs/api-reference) for Hermes chat + image generation
- [Heroicons](https://heroicons.com/) + project-local icon components

## Quick Features

- Home page with article highlights, contact card, and work/resume summary.
- Articles route with full-text + topic filtering.
- Global header modal search (`Cmd/Ctrl + K`).
- Hermes AI chat with streaming text and image generation modes.
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
NEXT_PUBLIC_SITE_URL=https://brandonperfetti.com
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

For full Notion configuration (all `NOTION_*` env vars, webhook/revalidate secrets, projection sync, runbooks), see:
- `docs/NOTION_CMS.md`

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
