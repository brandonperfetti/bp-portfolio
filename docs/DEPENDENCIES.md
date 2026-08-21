# Dependencies (why each exists)

Majors are pinned; upgrade deliberately. `payload` + `@payloadcms/*` move as
one set, version-locked.

## Content & data

- `payload`, `@payloadcms/next` — CMS embedded in the app (admin + APIs).
- `@payloadcms/db-postgres` — Drizzle/Postgres adapter over node-postgres
  (Supabase; replaced the Neon-only `@payloadcms/db-vercel-postgres`).
- `@payloadcms/richtext-lexical` — editor; Posts registers list/quote/upload
  features the migration requires (see docs/PAYLOAD.md).
- `@payloadcms/storage-vercel-blob` — media storage.
- `@payloadcms/plugin-seo|redirects|search|mcp` — SEO fields, editorial
  redirects, search index, agent MCP endpoint.
- `@payloadcms/email-resend` — Resend transactional email (first-party
  adapter; replaced `@payloadcms/email-nodemailer` + SendGrid SMTP).
- `sharp` — Payload image processing.

## App framework

- `next` 16 (Turbopack), `react`/`react-dom` 19, `typescript` 5.
- `@clerk/nextjs` — visitor auth + gating identity (admin auth is Payload's).
- `svix` — Clerk webhook signature verification.

## AI

- `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` + `@ai-sdk/react` — Hermes
  chat, provider-switchable via env.
- `openai` — image/audio endpoints retained from v3.
- `streamdown`, `react-markdown`, `remark-gfm` — streaming markdown render.
- `zod` — request validation (chat, webhooks, forms).
- `@upstash/ratelimit` + `@upstash/redis` — global rate limiting.
- `evalite` + `autoevals` (dev) — Hermes behavior evals.

## UI

- `tailwindcss` v4 + `@tailwindcss/postcss` + `@tailwindcss/typography` —
  CSS-first styling; `typography.ts` config retained from v3.
- `radix-ui`, `class-variance-authority`, `tailwind-merge`, `clsx`,
  `tw-animate-css` — shadcn/ui stack (`src/components/ui`).
- `lucide-react` v1 — icons (no brand logos in v1).
- `cmdk` — command palette semantics; `okapibm25` — palette ranking.
- `gsap` — motion (tokens in `src/lib/motion/timing.ts`).
- `shaders` — shaders.com hero presets (client-only).
- `next-themes` — class-based theming.
- `@headlessui/react`, `@heroicons/react` — retained v3 UI (shrinking).
- `feed` — RSS. `cheerio` — HTML utilities for llms/feed surfaces.
- `resend` — contact-form delivery (`/api/contact`) + Clerk sign-up email
  capture (`/api/clerk/webhook`).
- `@vercel/analytics`, `@vercel/speed-insights` — telemetry.

## Dev/test

- `vitest` + Testing Library + `jsdom`; `@playwright/test`; Storybook 10
  (`@storybook/nextjs-vite`, addon-a11y, addon-mcp); `eslint` 9 +
  `eslint-config-next` + `eslint-plugin-tsdoc`; `prettier` +
  tailwind plugin; `husky` + lint-staged.

## Observability

- `@sentry/nextjs` — error monitoring + performance tracing (server, client,
  edge). Entirely env-gated on `NEXT_PUBLIC_SENTRY_DSN` (server/edge may use a
  separate `SENTRY_DSN`): with no DSN the SDK is never imported by
  `next.config.mjs` and every `Sentry.init` is skipped, so local dev and CI
  boot with zero Sentry activity. Source-map upload (via the Sentry Vercel
  integration) additionally needs `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` +
  `SENTRY_PROJECT` at build time; without them the build still succeeds and
  just skips the upload. Sentry Logs is enabled on server/client/edge,
  forwarding `console.warn` / `console.error` (not `log`/`info`/`debug`).
  Session replay, cron monitoring, and alerting rules are intentionally not
  wired — defaults first (#73).
