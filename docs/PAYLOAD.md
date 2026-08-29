# Payload CMS

Payload is the single source of truth for site content. Admin at `/admin`
(Payload's own Users auth — Clerk never guards the admin).

## Collections

- **Posts** — articles (`/articles/[slug]`). Drafts + versions + autosave
  (100ms) + scheduled publish. Tabs: Content (excerpt, heroImage, Lexical
  content), Meta (relatedPosts, categories, tags), SEO (plugin-seo fields).
  `access` group carries the gating model (`visibility`, dormant
  `requiredPlan`/`requiredFeature`). Hooks: `publishedAt` autofill,
  `populateAuthors`, `revalidatePost`.
  **Editor features must keep every node type the Notion migration emitted
  registered** — lists (ordered/unordered/check), blockquote, upload — plus
  blocks Banner/Code/MediaBlock. Removing one crashes every migrated article
  with minified Lexical error #17. Posts also carry an optional
  `layout` blocks field (the shared block library) rendered **below** the
  article body by `<CmsPostBlocks slug="…" />` — per-article CTAs, newsletter
  signups, FAQ sections. (Above-article is intentionally not offered: the
  hero/title own that space.)
- **Pages** — block-composed pages resolved by path. The block library lives
  in `src/blocks/library.ts` (`pageBuilderBlocks`) — one alphabetical list
  registered by every layout-capable surface (Pages + Posts), keeping the
  admin picker, `RenderBlocks`, and Storybook a 1:1 set. **Page builder:**
  any published page whose slug isn't owned by a dedicated route renders at
  `/[slug]` via `RenderHero` + `RenderBlocks` — compose new pages entirely
  in admin, no code or deploy. Reserved slugs live in
  `src/app/(frontend)/[slug]/page.tsx`. **Hybrid routes:** five code-owned
  content routes — `/articles`, `/tech`, `/projects`, `/corvus`, `/uses` —
  also render their Pages doc's layout via `<CmsPageBlocks slug="…" />`
  (spacer-only layouts are treated as empty), so admin-composed sections can
  be appended to bespoke pages too. (`/` and `/about` instead render their
  whole Pages doc through the shared `RenderRhythmPage` seam — see below —
  and so are not in this set.)
  **Home (`/`):** since #42 the home route renders its Pages doc through the
  shared page-builder seam `src/heros/RenderRhythmPage.tsx` — the same
  draft-aware renderer the `/[slug]` catch-all uses — so `photoStrip` is now a
  normal layout block rendered inline by `RenderBlocks`, editable in admin like
  any other. The old hybrid mechanism (`photoStripImagesFromLayout` in
  `pagesRepo`, `<CmsPageBlocks slug="home" exclude={['photoStrip']} />`) is
  retired: there is no hero-slot gallery extraction and no exclusion.
- **Projects**, **TechStack** (name/category/proficiency/logo/url/githubRepo),
  **Uses** (category-grouped tools), **Categories**, **Tags**, **Media**
  (Blob-backed), **Users** (admin operators).

## Globals

`SiteSettings` (canonical URL, metadata defaults), `Navigation`, `Footer`,
`Identity` (author/JSON-LD identity + the uploaded CV: `getCmsIdentity`
feeds `buildPersonSchema` and the Resume card's Download CV button; empty
fields fall back to the `src/lib/identity.ts` constants and the static
`/assets` PDF).

## Slugs

Classic pattern in `src/fields/slug/`: text field + `slugLock` checkbox +
`formatSlug` hook + admin component. Migrated slugs are locked — unlock in
admin to change (URL contract: never rename published article slugs).

## Plugins (`src/plugins/index.ts`)

- `plugin-seo` — meta title/description/image + previews; `generateTitle` is
  `{title} - Brandon Perfetti`; posts URL-prefix `/articles`.
- `plugin-redirects` — editorial redirects, revalidated on change.
- `plugin-search` — synced search index over posts feeding `/api/search`.
- `plugin-mcp` — Payload MCP endpoint at `/api/mcp` (API-key auth) so agents
  can operate the CMS. Collections opt in with `{ enabled: true }` objects.

## Operating via MCP (for agents)

`plugin-mcp` exposes find/create/update/delete over Posts, Pages, Projects,
TechStack, Uses, Categories, Tags, WorkHistory, Media at `/api/mcp`
(API-key Bearer auth;
on deployed envs it also sits behind Vercel deployment protection, so pass
`x-vercel-protection-bypass` alongside the Bearer token). Tool schemas are
self-describing — an agent discovers _how_ to call them for free. What it
cannot infer are the invariants below; encode those, not the mechanics.

**Guardrails (violating these breaks production):**

- **Lexical node set.** Post `content` is Lexical JSON. Authoring or
  round-tripping it must preserve every node type the migration emits (lists
  ordered/unordered/check, blockquote, upload) plus blocks Banner/Code/
  MediaBlock — an unknown or dropped node crashes every migrated article with
  minified Lexical #17. Prefer editing bodies in `/admin`; use `updatePosts`
  on `content` only with a known-valid tree.
- **Locked slugs.** Migrated/published slugs are locked (URL contract). Never
  change a published `slug` via MCP — add a plugin-redirects entry instead. A
  bulk `where` update must not touch `slug`.
- **Writes are live.** There is no dry-run; create/update/delete hit a real
  DB immediately. `find` (with a narrow `select`) to confirm state before any
  write.
- **Home `photoStrip`.** Since #42 the home doc's `photoStrip` is a plain
  layout block rendered inline through the shared page-builder seam — no
  hero-slot extraction, no exclusion. Reorder or edit it via `updatePages`
  like any other block (see the Home note under **Pages**).
- **Out of scope for MCP.** Globals (`SiteSettings`/`Navigation`/`Footer`/
  `Identity`) and `Users` are not exposed. Nav, footer, and identity edits are
  admin or code, never MCP.

**Recipes:**

- Bulk publish drafts: `updatePosts` with `where` `{"_status":{"equals":
"draft"}}` and `_status:"published"` (`revalidatePost` fires per doc → live
  immediately).
- Keep responses small: always `select` the fields you need and keep `depth`
  low (0–1); a naive `find` at high depth returns huge relationship trees.
- Drafts vs live: `draft:true` reads the versions table; `_status` sets
  published state on write.
- Safe backfills: `year` (Projects) and `proficiency` (TechStack) are null
  across the board today — targeted single-field updates.

**Key posture (review m8).** An MCP API key is an admin-equivalent
secret: `find` reads run as the key's principal (drafts and gated bodies
included) and write ops mutate live content. Scope keys with the plugin's
per-collection/per-operation permission checkboxes (adding a collection to
the plugin config adds permission COLUMNS — a schema change requiring
`migrate:create`, and new permissions default to unchecked). Store keys in
project-scoped keychain entries, rotate on any suspicion, and never grant
delete where find+update suffices.

**Connector-only agents.** An agent driving the MCP without a repo checkout
never reads this file — the only channel that travels with the tools is the
schema itself. Mirror the load-bearing guardrails into collection/field
`admin.description` so every agent sees them. Highest-value targets: Posts
`content` (Lexical node set) and the slug field (`src/fields/slug/`, lock
contract) in `src/collections/*`.

## Generated artifacts (committed + CI-gated)

- `src/payload-types.ts` ← `pnpm generate:types`
- `src/app/(payload)/admin/importMap.js` ← `pnpm generate:importmap`

Run both after any schema/field/plugin change; CI diffs them and fails on
staleness. A stale importMap manifests as missing admin UI (empty SEO tab,
unrenderable editor).

## Migrations

- `pnpm migrate:create` after schema changes → commit the migration.
- Vercel build runs `pnpm migrate && pnpm build` (`vercel.json`).
- `scripts/migrate-notion-to-payload.ts` was the one-time Notion→Payload
  content migration (upsert-by-slug, drafts, covers→Blob). Keep for
  reference; DRY_RUN/ONLY_SLUG knobs. Note: `payload run` kills floating
  promises at module-eval end — scripts must top-level `await`.
- `scripts/set-admin-password.ts` — Local API admin bootstrap/password reset.
- `scripts/backfill-corvus-embeddings.ts` (`pnpm corvus:backfill`) — populates
  and repairs the `corvus_embeddings` pgvector index the content hooks keep
  fresh. Not a Payload collection, deliberately; see `docs/AI.md`
  §"Retrieval grounding" for the table, the `access.visibility` filter that
  keeps gated bodies out of anonymous chat answers, and when to re-run it.

### New-table RLS convention (#72)

Every table in `public` has Row Level Security enabled with **no policies**
(default-deny) as of the `20260820_221032_rls_lockdown` migration, and
`ALTER DEFAULT PRIVILEGES` strips `anon`/`authenticated` table+sequence grants
from tables created afterward. Payload connects as the table **owner**, and
owners bypass RLS — so this is invisible to the app and to `payload migrate`.
It exists solely to keep Supabase's `anon`/`authenticated` Data API roles
locked out of `public`, independent of the Data API's exposed-schema config.

When you add a collection or global (a new table via `pnpm migrate:create`),
add a one-line follow-up in the **same** migration enabling RLS on the new
table and any paired `_v` / `_rels` table Payload generates:

```ts
await db.execute(sql`ALTER TABLE "new_table" ENABLE ROW LEVEL SECURITY;`)
```

CI enforces this (#117): `scripts/check-migrations-rls.mjs` runs in the
`quality` job and fails the build when a migration created **after** the
`20260820_221032_rls_lockdown` backfill has a `CREATE TABLE "x"` with no
`ALTER TABLE "x" ENABLE ROW LEVEL SECURITY` in the same file — companions
included, because Payload emits `_v` / `_rels` as their own `CREATE TABLE`
statements. Migrations at or before that backfill are grandfathered: it enabled
RLS through a dynamic `pg_tables` loop, so no table name appears as literal
text for a matcher to find. The script's header documents that audit.

`ALTER DEFAULT PRIVILEGES` already handles the grant side for new tables, but
it does **not** touch RLS state — that still needs the explicit `ENABLE` per
table. For a bulk sweep, reuse the `pg_tables` loop in
`20260820_221032_rls_lockdown.ts` rather than hand-listing tables. **Never** set
`FORCE ROW LEVEL SECURITY` — with no policies it would default-deny Payload's
own owner connection. RLS here is owner-transparent, not an app access layer
(Payload's gating is `src/access/*` + `getViewer()`).
