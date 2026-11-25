# Architecture

## Runtime model

- Next.js 16 App Router (`src/app`), Turbopack builds, React 19 RSC-first.
- Payload CMS 3 runs **inside** the Next app (`@payloadcms/next`): the admin
  UI at `/admin` and the Payload REST/GraphQL APIs live in
  `src/app/(payload)/`; server code queries content through the **Local API**
  (`getPayload()`), never over HTTP.
- Postgres via `@payloadcms/db-postgres` (Drizzle/node-postgres; Supabase
  in staging/prod). Schema changes ship
  as committed migrations (`pnpm migrate`); `PAYLOAD_DB_PUSH=true` enables dev
  push mode locally only.
- Media uploads live in Vercel Blob (`@payloadcms/storage-vercel-blob`),
  enabled only when `BLOB_READ_WRITE_TOKEN` is set. Local work runs without
  it: on local disk, or read-only from the store's public origin when only
  `STORAGE_VERCEL_BLOB_BASE_URL` is set (`src/lib/storage/readOnlyMedia.ts`,
  #328).
- Clerk middleware runs from `src/proxy.ts` (Next 16 proxy convention), gated
  on `isClerkEnabled()` so the app boots without Clerk keys.

## Layers

This is the capability map: where each part of the system lives in code.
What a reader or editor can do with it, and which tests prove it, is
`docs/JOURNEYS.md`.

- `src/app/(frontend)/` — public pages (RSC). Dynamic article route:
  `src/app/(frontend)/articles/[slug]/page.tsx` (v3 URL shape preserved).
- `src/app/(payload)/` — Payload admin + generated API routes. Do not edit
  `admin/importMap.js` by hand (generated; CI-gated).
- `src/app/api/` — custom route handlers: `ai/chat` (Corvus), `search`
  (palette index), `contact` (contact form via Resend), `newsletter`
  and `newsletter/confirm` (Newsletter Signup block → confirmation email →
  Resend list, double opt-in), `clerk/webhook` (email capture),
  `revalidate` (secret-gated ISR).
- `src/collections/`, `src/globals/`, `src/blocks/`, `src/fields/`,
  `src/access/` — Payload schema. `src/payload.config.ts` is the single
  config entry.
- `src/lib/cms/*Repo.ts` — the content access layer. Each repo wraps the
  Local API in a `'use cache'` scope (`cacheComponents: true` in
  `next.config.mjs`) with revalidation tags and maps Payload docs
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
- Every purge is `revalidateTag(tag, { expire: 0 })` — immediate
  expiration — never `'max'`. Under `cacheComponents`, `'max'` is
  stale-while-revalidate with a one-year stale window, which silently breaks
  "admin edits are live in seconds" (#118; pinned by
  `src/app/api/revalidate/route.test.ts`).
- **A reader that populates another collection's document subscribes to that
  collection's tag too** (#359, option A; Brandon). Repo reads run with access
  control enforced, so a relation to a draft comes back as a bare id and
  `resolveCmsHref` renders it as `'#'`; the target's publish, unpublish or
  delete purges only its own tag (`revalidatePage` purges `pages`,
  `revalidatePost` purges `posts`). The cached page readers
  (`getCmsPageByPath`, `getPageByPathDraftAware`, `getPageLayoutBySlug`)
  therefore carry `posts`; the cached post readers (`getPostBySlug`,
  `getPostByPath`, `getPostLayoutBySlug`) carry `pages`; the consent reader
  carries `pages` and `getCmsRedirects` both (#262). A reader that selects only
  its own scalar columns (`getPublishedPagePaths`, `getAncestorPages`, the post
  summary, slug and path lists) populates nothing and stays on its own tag. The
  cost is one re-read of each such entry after any write to the other
  collection; a shared "publish state" tag (option B) is the alternative if
  that ever shows up as load. `src/lib/cms/cacheTags.test.ts` pins both sides,
  so a new cross-collection reader gets added there.
- `/api/revalidate` (secret `CMS_REVALIDATE_SECRET`) is the manual escape
  hatch.
- GitHub tech signals cache 6h under tag `tech-signals`
  (`src/lib/tech/githubSignals.ts`).

## Environments

- GitFlow since the v4 cutover: `master` → production
  (brandonperfetti.com); `develop` → integration and staging (staging.brandonperfetti.com; Supabase Postgres + Blob store).
  Branching and release steps: `docs/WORKFLOW.md` § Branching & releases.
- Env vars are documented exhaustively in `.env.example`.
