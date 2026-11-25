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
- `/api/revalidate` (secret `CMS_REVALIDATE_SECRET`) is the manual escape
  hatch.
- GitHub tech signals cache 6h under tag `tech-signals`
  (`src/lib/tech/githubSignals.ts`).

## Link prefetching

`next.config.mjs` sets `partialPrefetching: false` beside
`cacheComponents: true` (#436), decided 2026-11-25 on Next 16.4.6.

- **What it keeps.** Each `<Link>` that enters the viewport prefetches the
  cached render of its own URL, the behavior the site has had since Cache
  Components landed (#76). Leaving the option unset behaves the same but logs
  a warning on every build; `false` states the choice and removes the warning
  [source: next 16.4.6 `dist/server/config.js`; measured 2026-11-25 with
  Next's `loadConfig` on this config, warning absent, and on a control copy
  without the key, warning printed].
- **Why not `true` yet.** With Partial Prefetching, a default `<Link>`
  prefetches one App Shell per route: only the output that does not depend on
  the URL. `/articles/[slug]` and the `[...segments]` catch-all await `params`
  outside `<Suspense>` on purpose, so a 404, a #120/#130 redirect or the #153
  placed-article 308 keeps a real HTTP status (#172), and neither has a
  `loading.tsx`. Their App Shell would hold the layout and no body, so the
  article or page a reader clicks would render after the click instead of
  being prefetched before it [inference: verify by comparing the same
  client-side navigations in a production build with the flag off and on].
- **What it does not hold back.** No link in `src/` sets `prefetch={true}`
  [measured 2026-11-25, `grep -rn prefetch src`], so there is no legacy full
  prefetch to migrate; adoption is only the content-route question above.
- **Adoption work.** Pick one route at a time (`export const prefetch =
'partial'` lets a route adopt with the global flag off): either move the
  `params` read behind `<Suspense>` without losing #172's status codes, or
  keep the current shape and give the links to it `prefetch={true}`, which
  resolves the cached URL-specific render ahead of the click at the cost of a
  server invocation per visible link. Prove each with the same production
  navigation before and after, then set the flag to `true`. Next's next major
  turns Partial Prefetching on everywhere and removes the option, so this
  work is due before that upgrade [source: next 16.4.6
  `dist/docs/01-app/02-guides/adopting-partial-prefetching.md`].

## Environments

- GitFlow since the v4 cutover: `master` → production
  (brandonperfetti.com); `develop` → integration and staging (staging.brandonperfetti.com; Supabase Postgres + Blob store).
  Branching and release steps: `docs/WORKFLOW.md` § Branching & releases.
- Env vars are documented exhaustively in `.env.example`.
