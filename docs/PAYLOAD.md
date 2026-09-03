# Payload CMS

Payload is the single source of truth for site content. Admin at `/admin`
(Payload's own Users auth — Clerk never guards the admin).

## Collections

- **Pages** — layout-builder pages served by the `/[...segments]` catch-all,
  resolved on a computed, unique, indexed `path`. See "Slugs and paths" below
  and `docs/NAVIGATION.md` for the hierarchy, the root-page contract and the
  reserved-first-segment rule.
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

**Categories is labelled "Topics" in the admin — the slug stays `categories`
(#149).** The public surface has said "topics" for a long time: the chips on
`/articles`, the `?topic=` query param, `topics: string[]` on the read models.
Only the admin still said "Categories", and `labels: { singular: 'Topic',
plural: 'Topics' }` on the collection (plus `label: 'Topics'` on the Posts
relationship field) closes that gap with a presentation-only change. An actual
collection rename would cost a table migration with data-loss risk, a search
reindex, and renamed `categories` MCP tools that every agent calling them would
break on — and it would change no public string, because none of them say
"categories" today. So the standing rule is: **`categories` is the slug and the
field name; "Topic(s)" is what a human reads.** Code says `post.categories`;
admin, UI and prose say topics.

## Globals

`SiteSettings` (canonical URL, metadata defaults), `Navigation`, `Footer`,
`Identity` (author/JSON-LD identity + the uploaded CV: `getCmsIdentity`
feeds `buildPersonSchema` and the Resume card's Download CV button; empty
fields fall back to the `src/lib/identity.ts` constants and the static
`/assets` PDF).

## Slugs and paths

Pattern in `src/fields/slug/`: text field + `slugLock` checkbox + `formatSlug`
hook + `enforceSlugFreeze` hook + admin component.

**`publicPathFor(collectionSlug, doc)` in `src/fields/slug/slugPaths.ts` is the
single owner of "what is this document's public URL."** Sitemap, canonical,
JSON-LD, RSS, `llms.txt`, `/api/search`, `CMSLink`, the SEO plugin's
`generateURL`, the admin preview builder, the redirect writer/reader and the
revalidation hooks all resolve through it. Never hand-build a public URL; if a
surface needs one, call this. `publicPathForSlug(collection, slug)` is a thin
wrapper for callers holding only a slug — correct for a top-level page and for
an unplaced post, and necessarily wrong for a placed document of either kind.
The admin slug sidebar shows the resolved full public path ("Served at
/work/brytecore") so an editor can see what their edit will move (#120's
lesson, #148's fix).

**Pages carry a hierarchy** (#148): `parent` (self-referencing, optional,
top-level) and a computed, unique, indexed `path`. The root page is designated
by the reserved `home` slug (`ROOT_PAGE_SLUG`) and serves `/`.

**Posts carry an optional placement** (#153): the same two top-level fields,
`parent` (→ pages, single-valued, filtered to published non-root pages) and a
computed, unique, indexed `path`. Placement is **opt-in and defaults to unset**,
and that default is the whole design — M2 writes no backfill, so `path` is NULL
for every post that exists and `publicPathFor` answers `/articles/<slug>`
byte-for-byte. A post only leaves the archive when an editor picks a parent, and
`publicPathFor` then answers `/<path>`. Changing a published post's `parent`
needs **no slug unlock** (Brandon, D5) — it is a deliberate, visible act with an
obvious URL consequence, unlike the silent title-driven re-slug
`enforceSlugFreeze` exists for — and a placed post stays in `/articles`, the
feed and search, with every link pointing at the placed path (D6).

The rules Pages and Posts share — the depth cap, the code-owned first segments,
the parent-path composition and the cross-collection collision guard — live once
in `src/fields/slug/documentPath.ts`, because a page and a placed post compete
for the same URL namespace and a second copy of any of them is a second chance
for both to claim `/work/brytecore`.

The contract lives in the code: field shapes and hook order in
`src/collections/Pages/index.ts` and `src/collections/Posts/index.ts`, what a
save rejects and why in `validatePageHierarchy`'s and `validatePostPlacement`'s
TSDoc, and the root-designation reasoning on `ROOT_PAGE_SLUG`.
`docs/NAVIGATION.md` covers the routing half.

**`slugLock: true` means "I do not hand-edit this slug"**, and that resolves
differently either side of first publish (#120):

- **Before first publish** the slug is derived from the title on every edit.
  Convenient, and safe — no public URL exists yet.
- **Once published** the slug is frozen at its published value. Editing the
  title can no longer move the URL.

Correction (this sentence used to read "Migrated slugs are locked — unlock in
admin to change"): under the old semantics the stored `slugLock: true` was
exactly what made a title edit rename a live URL, which is the bug #120
measured. The lock now means what it says. Every migrated and seeded document
already stores `slugLock: true`, so all of them are frozen by rule — no data
migration, no schema change.

**For editors — renaming a published URL deliberately:**

1. Open the doc, click **Unlock** beside the Slug field. The sentence under the
   input always states what will happen on save.
2. Type the new slug (a published doc never auto-fills it — a rename is typed,
   never inferred from a title).
3. Save/publish. A `redirects` row is created automatically, so the old URL
   keeps working; visitors and search engines get a permanent redirect to the
   new one.

**Enforcement is server-side.** `enforceSlugFreeze` (a `beforeValidate` field
hook) reverts a frozen slug regardless of caller — admin form, REST `PATCH`, or
MCP. A write that intends a rename must send `slugLock: false` in the same
payload; omitting it is not consent. The admin component mirrors the rule (it
stops re-deriving once `hasPublishedDoc`) purely so the editor is never shown a
value the server is about to revert.

**Redirects point at the document, not at a path** (`to.type: 'reference'`), so
renaming `a → b → c` leaves both `/articles/a` and `/articles/b` resolving
straight to `/articles/c` — chains cannot form. `src/lib/cms/redirectsRepo.ts`
is the cached reader; `/articles/[slug]` and `/[...segments]` consult it on
their not-found branch only, so a live document always wins over a stale row.

**Passing state between hooks: write to `req.context`, never to the `context`
argument.** `createLocalReq` reassigns `req.context = getRequestContext(req,
context)` and `getRequestContext` returns a **new shallow-spread object**, so
every nested Local API call that forwards `req` — `payload.find({ req })` inside
a hook, for instance — swaps `req.context` and leaves the `context` argument
that hook was handed pointing at a detached copy. Writes to it vanish silently.
Write to `req.context` after your awaits, and read from `req.context` too. This
cost #120 a preview cycle: the hook worked for a one-shot rename (no nested
call) and did nothing on the admin path (nested `find`), which is very hard to
spot because the branching logic is identical.

**The old slug comes from the main table, never from `previousDoc`.** Posts and
Pages both run `autosave.interval: 100`, and Payload resolves the hook's
`originalDoc`/`previousDoc` from `getLatestCollectionVersion` — after any
autosave that is the DRAFT, which on a rename already holds the _new_ slug and
reports `_status: 'draft'`. A `beforeChange` hook
(`src/hooks/capturePublishedSlug.ts`) therefore reads the published main-table
row — which a draft save never touches — and stashes it on `req.context` for
`createSlugRedirect`. Anything added here that needs "the value the site is
currently serving" must do the same; `previousDoc` is not it.

Scope: only **Posts** and **Pages** are slug-routed (`slugPaths.ts`).
Categories, Tags, Projects and Authors carry a slug with no public URL behind
it and keep the plain derive-from-title behaviour.

**Who purges which path (#132).** Two hooks call `revalidatePath` on a rename
and the split between them is a cross-file contract, so it is stated here
rather than only in each hook's TSDoc:

> **Whoever writes a redirect row purges that row's `from`. The revalidation
> hooks purge the document's own paths.**

Concretely: `revalidatePost`/`revalidatePage` purge the document's current path
on publish and `previousDoc`'s path on unpublish; a published→published rename
purges only the NEW path there, and `createSlugRedirect` purges the old one —
inside the same `try` that wrote the row, from the same `from` string.

The original reason was that there were **two path vocabularies** that
disagreed about the home page — the revalidation hooks mapped it to `/` while
`publicPathForSlug` called it `/home` — so a purge could be spelled differently
from the row it was meant to uncover. **#148 closed that**: `publicPathFor` is
now the single owner of every public path and `revalidatePage` resolves through
it, so both sides spell the root identically. The ownership split above stays,
for the reason that outlives the conflict: the purge is conditional on the write
having succeeded (it sits inside the same `try`, after the row lands) rather
than on a transition that fires either way. The transition matrices in
`revalidatePost.test.ts` and `revalidatePage.test.ts` pin every case, and they
are unchanged across #148 — which is the evidence that routing the hook through
the seam moved no behaviour.

Known gap on the unpublish branch: unpublishing a document that has a pending
autosaved rename purges nothing, because `previousDoc` is the draft and the
served slug is absent from every `afterChange` argument. Measured 2026-09-02,
pinned by a `KNOWN GAP` test in both matrices, tracked in a follow-up to #132.

**Permanent vs temporary redirects (#130).** The plugin is configured with
`redirectTypes: ['301', '302']`, which is what makes it emit a permanence
field at all — without that option it emits none and every redirect served as
a 308. The admin form offers **301 – Permanent** (the default) and
**302 – Temporary**; `src/lib/cms/redirectsRepo.ts` flattens the stored code
and the two not-found branches call `permanentRedirect` (308) or `redirect`
(307) accordingly. Only two of the plugin's five codes are offered because the
reader collapses them to permanent-or-not, and five options that produce two
behaviours is a way to make an editor pick wrong.

Anything not `'302'` reads as permanent — an unset, legacy or unrecognised
value included. That is deliberately the pre-#130 behaviour, so a row written
before the field existed is unchanged, and the conservative direction for a
rename. The rename rows `createSlugRedirect` writes state `'301'` explicitly
rather than relying on the field default, because updating an existing row does
not re-apply a default and a row an editor had flipped to temporary would
otherwise stay temporary.

The migration is `20260902_205311_redirect_permanence`. It adds an enum type and
a `NOT NULL DEFAULT '301'` column to the **existing** `redirects` table, so the
new-table RLS rule below does not apply and no `ENABLE ROW LEVEL SECURITY`
statement belongs in it — `redirects` was swept by the #72 backfill and its RLS
is already on. `scripts/check-migrations-rls.mjs` agrees: the migration creates
no table, so it carries no obligation.

Known limits: the reader reads at most 500 rows.

## Plugins (`src/plugins/index.ts`)

- `plugin-seo` — meta title/description/image + previews; `generateTitle` is
  `{title} - Brandon Perfetti`; posts URL-prefix `/articles`.
- `plugin-redirects` — editorial redirects **plus** the rows
  `createSlugRedirect` writes when a published Post/Page is deliberately
  renamed; revalidated on change and served by `src/lib/cms/redirectsRepo.ts`
  (#120). Before that, nothing in `src/` read the collection, so a redirect row
  was inert. `redirectTypes: ['301', '302']` + a `defaultValue: '301'` override
  give each row a permanence the routes act on (#130).
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
- **Locked slugs.** A published document's slug is frozen server-side (#120):
  `enforceSlugFreeze` reverts it, so an `updatePosts` that changes `title` — or
  that sends a new `slug` without `slugLock` — leaves the URL byte-identical.
  That is the safe default, not an error you will see. To rename deliberately,
  send `slugLock: false` alongside the new `slug` in the same write; the old
  path then redirects automatically and needs no hand-written redirect row.
  Prefer not renaming at all: the v3 slugs are the ones carrying external
  links. A bulk `where` update must never touch `slug` or `slugLock`.
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

**`scripts/check-importmap.mjs` — the non-emptiness gate (#131).** Staleness is
not the only way an importMap goes wrong: `pnpm generate:importmap` can write an
**empty** map and exit 0 when component resolution fails, and staleness cannot
see that — an empty map regenerated as empty is not stale, so CI stays green
while every custom field component in the admin disappears at once. The gate
runs in the `quality` job between the regenerate and the diff, so it judges the
freshly generated content rather than what happens to be committed, and it
fails when either

- the map carries fewer than `MINIMUM_IMPORT_MAP_ENTRIES` entries — the floor is
  **25**, and the map carries **31** today — or
- a component this repo declares — any `'@/module#Export'` string in a non-test
  `src/` source, e.g. the slug field's — is missing from the map.

The expected components are derived from the config sources rather than frozen
in a list, so adding or removing one needs no second edit — but that scan is a
regex over single-quoted `@/`-rooted literals, not a parser, so a path spelled
any other way silently drops out of it. The entry floor is the backstop for
whatever the scan under-counts; neither check is complete alone. When the gate
fires, the fix is always to re-run the generator; if the map still comes back
short, that is the resolution failure #131 tracks and the result must not be
committed. Run it locally with `node scripts/check-importmap.mjs`.

**Diagnosis status: the empty-map failure is real but undiagnosed.** The
precondition that triggers it is not known. As of 2026-09-02 three independent
containers have each run `pnpm generate:importmap` on this tree and **failed to
reproduce** it: every one regenerated the map byte-identically to the committed
copy after `prettier --write` (97 lines, 7742 bytes, 31 entries, exit 0). The
issue's own inference — a workspace or `@payload-config` resolution difference
— is therefore neither confirmed nor refuted, and nobody should treat it as
settled. That non-reproduction is the argument for the shape of the gate rather
than against it: because we cannot yet detect the cause, the gate catches the
**outcome**, on freshly generated content, in the job that runs on every push.
If it ever fires in CI, the annotation names #131 and says not to commit the
result — that run is the next real datapoint anyone will get.

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

Function grants are revoke-by-default too, as of the
`20260831_005000_issue_87_function_acls` migration (#87): `anon`/`authenticated`
get no `EXECUTE` on functions created in `public`, so a deliberate RPC needs an
explicit `GRANT EXECUTE` on that function in its own migration.

`ALTER DEFAULT PRIVILEGES` already handles the grant side for new tables, but
it does **not** touch RLS state — that still needs the explicit `ENABLE` per
table. For a bulk sweep, reuse the `pg_tables` loop in
`20260820_221032_rls_lockdown.ts` rather than hand-listing tables. **Never** set
`FORCE ROW LEVEL SECURITY` — with no policies it would default-deny Payload's
own owner connection. RLS here is owner-transparent, not an app access layer
(Payload's gating is `src/access/*` + `getViewer()`).
