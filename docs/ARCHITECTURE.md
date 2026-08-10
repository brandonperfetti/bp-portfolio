# Architecture

## Runtime model

- Next.js 16 App Router (`src/app`), Turbopack builds, React 19 RSC-first.
- Payload CMS 3 runs **inside** the Next app (`@payloadcms/next`): the admin
  UI at `/admin` and the Payload REST/GraphQL APIs live in
  `src/app/(payload)/`; server code queries content through the **Local API**
  (`getPayload()`), never over HTTP.
- Postgres via `@payloadcms/db-vercel-postgres` (Drizzle). Schema changes ship
  as committed migrations (`pnpm migrate`); `PAYLOAD_DB_PUSH=true` enables dev
  push mode locally only.
- Media uploads live in Vercel Blob (`@payloadcms/storage-vercel-blob`),
  enabled only when `BLOB_READ_WRITE_TOKEN` is set.
- Clerk middleware runs from `src/proxy.ts` (Next 16 proxy convention), gated
  on `isClerkEnabled()` so the app boots without Clerk keys.

## Layers

- `src/app/(frontend)/` — public pages (RSC). Dynamic article route:
  `src/app/(frontend)/articles/[slug]/page.tsx` (v3 URL shape preserved).
- `src/app/(payload)/` — Payload admin + generated API routes. Do not edit
  `admin/importMap.js` by hand (generated; CI-gated).
- `src/app/api/` — custom route handlers: `ai/chat` (Hermes), `search`
  (palette index), `contact` (contact form via Resend), `clerk/webhook` (email
  capture), `revalidate` (secret-gated ISR).
- `src/collections/`, `src/globals/`, `src/blocks/`, `src/fields/`,
  `src/access/` — Payload schema. `src/payload.config.ts` is the single
  config entry.
- `src/lib/cms/*Repo.ts` — the content access layer. Each repo wraps the
  Local API in `unstable_cache` with revalidation tags and maps Payload docs
  to the stable Cms* shapes consumed by pages (`src/lib/cms/types.ts`).
- `src/lib/content/lexicalToBlocks.ts` — converts Payload Lexical JSON into
  the block shape the article renderer (`src/components/cms/ArticleBody.tsx`)
  consumes.
- `src/components/` — UI. `ui/` is shadcn primitives; `motion/` wraps GSAP;
  `heros/` is the shader hero; `tech/`, `articles/`, `search/`, `cms/` are
  feature components.

## Caching & revalidation

- Repos cache by tag (`posts`, `pages`, `tech-stack`, `uses`, …).
- Collection hooks (`revalidatePost`, `revalidateRedirects`) revalidate paths
  and tags on publish/change — publishing in admin is live on the site
  immediately.
- `/api/revalidate` (secret `CMS_REVALIDATE_SECRET`) is the manual escape
  hatch.
- GitHub tech signals cache 6h under tag `tech-signals`
  (`src/lib/tech/githubSignals.ts`).

## Environments

- `master` = v3 production (do not touch until launch sign-off).
- `rebuild/v4` = active branch → Vercel custom environment `staging`
  (staging.brandonperfetti.com; Neon Postgres + Blob store).
- Env vars are documented exhaustively in `.env.example`.
