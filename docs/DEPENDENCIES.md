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

- `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` + `@ai-sdk/react` — Corvus
  chat, provider-switchable via env.
- `openai` — image/audio endpoints retained from v3.
- `streamdown`, `react-markdown`, `remark-gfm` — streaming markdown render.
- `zod` — request validation (chat, webhooks, forms).
- `@upstash/ratelimit` + `@upstash/redis` — global rate limiting.
- `evalite` + `autoevals` (dev) — Corvus behavior evals.

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

## Analytics & consent (#83)

- `@c15t/react` — self-hostable, open-source (Apache-2.0) consent runtime:
  `ConsentManagerProvider` + `ConsentBanner`/`ConsentDialog`/`ConsentDialogLink`,
  themed from the site's own zinc/teal tokens. Runs in `mode: 'offline'` today
  (client-side, localStorage-backed). The runtime components are imported from
  `@c15t/react` rather than the `@c15t/nextjs` barrel, which pulls `next/script`
  (via `C15tPrefetch`) into the widely-imported `providers.tsx` and breaks the
  vitest unit resolver — offline mode needs none of that Next-only surface.
  Pairs GA4 with the always-on cookieless Vercel Analytics — GA4 is free and
  the c15t pattern ports across projects (the motivation in #83).
- `@c15t/nextjs` — the Next.js integration package (Apache-2.0): C15tPrefetch,
  server-side `fetchInitialData`, middleware, and the route-handler surface for
  the self-hosted `@c15t/backend`. Installed for the self-host fast-follow;
  offline mode imports its runtime from `@c15t/react` (which it re-exports).
- `@c15t/scripts` — prebuilt consent-gated script integrations. Only the GA4
  `gtag` (Google Consent Mode v2) integration is used; imported via the
  `@c15t/scripts/google-tag` subpath so the rest tree-shakes away. See
  `docs/ANALYTICS.md` for the architecture, the Consent Mode v2 cookieless-ping
  caveat, and the self-host decision.

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
