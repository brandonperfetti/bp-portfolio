# Content workflow

## The split (locked decision)

- **Notion = planning only**: drafting ideas, outlines, editorial calendar.
  No runtime integration, no sync jobs, no webhooks. Never rebuild them.
- **Payload = the CMS**: writing, editing, publishing, SEO, media.

## Publishing flow

1. Draft in `/admin` → Posts (autosave + versions are on).
2. Fill SEO tab (plugin-seo checks) and Meta tab (categories/tags).
3. Publish (or schedule) — `revalidatePost` makes the article's detail
   page live at `/articles/[slug]` immediately. List surfaces converge on
   their TTLs, not instantly (measured 2026-08-10, docs/MAINTENANCE.md →
   Watchpoints): `/articles` and the search palette within ≤5 minutes.
   **Corrected 2026-09-10 (#209):** the sitemap is no longer one of them, and
   never did have "an hourly revalidate" — #76 removed `revalidate = 3600`, and
   `revalidatePost`/`revalidatePage` now purge `/sitemap.xml` on publish,
   unpublish and delete. See `docs/SEO.md` § Indexing surfaces.
4. Slugs lock after creation (`slugLock`). Changing a published slug breaks
   the URL contract — add a redirect via plugin-redirects if truly needed.
   A new draft created via MCP with an explicit `slug` must also pass
   `slugLock: false` — with the default `slugLock: true` the slug keeps
   following the title until first publish and the chosen slug is dropped
   [source: the Posts collection schema, first agent content run
   2026-09-10]. Send `slugLock: true` back in the publish write (or any
   write once the slug is final), and send `slug` in that same write — a
   write that carries `title` but no `slug` re-derives the slug from the
   title. A stored `slugLock: false` is a standing unlock:
   `enforceSlugFreeze` defers to it, so a later `updatePosts` that sends a
   new `title` without a `slug` re-derives the slug and moves the published
   URL (the old path redirects, but the URL contract is broken) [source:
   `src/fields/slug/enforceSlugFreeze.ts`, `src/fields/slug/formatSlug.ts`,
   `src/hooks/createPathRedirect.ts`].

## Draft preview

Admin Live Preview / Preview buttons hit `/next/preview` (secret:
`PREVIEW_SECRET`) and render draft content; `/next/exit-preview` clears.

## Migration provenance

The v3 archive was migrated from Notion by
`scripts/migrate-notion-to-payload.ts` (one-time): slugs preserved and
locked, bodies converted to Lexical, covers uploaded to Blob, everything
landed as drafts for review-then-publish. It stays for reference; it is not
part of any recurring workflow. The one-off `Posts.authors` backfill now
lives in the applied migration
`src/migrations/20260813_154606_authors_collection.ts` (the spent
`scripts/fix-migrated-posts.ts` audit script was removed in W5).

## Payload MCP

`/api/mcp` (plugin-mcp, API-key auth) lets agents CRUD content
programmatically — the supported automation path now that Notion sync is
gone.

See `docs/PAYLOAD.md` → **Operating via MCP** for the invariants agents
must respect (Lexical node set, locked slugs, live writes, home
`photoStrip`) and the bulk-edit recipes.

## The Content Run (agent SOP)

One agent session produces one article end to end. This replaces the
legacy Notion pipeline (Content Database + Image Jobs queue + three
workers) — a single session that can draft, generate, _look at_ its
candidates, and publish needs none of that coordination machinery. Every
step below was verified live on staging 2026-08-09; measured limits are
noted so future agents know what was tested, not just what was hoped.

### 0. Prerequisites

- Payload MCP connector (find/create/update/delete over content
  collections + createMedia/find/update).
- Cloudinary MCP connector (asset management) — the rasterizer of record
  and the archive for **code-rendered** covers: the assembled SVG is
  uploaded as a data URI with `format: "png"` and Cloudinary serves the
  PNG the ingest route then pulls (docs/CONTENT_STYLE.md §9). AI cover
  generation is retired as of 2026-08; do not reach for `generate-image`
  for a cover.
- `CMS_REVALIDATE_SECRET` — auths `/api/revalidate` AND
  `/api/media/ingest`. The **app** reads this bare name for whichever
  environment it is deployed to (Preview + the custom `staging`
  environment share one value; production has its own). A **script never
  reads the bare name** — that is the local dev server's gate and 401s
  against any remote route. It sources the target environment's value
  from the script-only pair in `.env.local`, `CMS_REVALIDATE_SECRET_STAGING`
  or `CMS_REVALIDATE_SECRET_PRODUCTION`, selected explicitly and paired
  with that environment's base URL (documented in `.env.example`; values
  live in 1Password). The value in Vercel and the script copy are separate
  stores — nothing copies one to the other — so rotating an environment's
  value is three steps: rotate it in Vercel, update the script copy in
  both places (1Password is the record; `.env.local` is what a script
  actually sends), then redeploy that environment (a running deployment
  keeps the value it was built with). Skip either later step and the route
  answers the script with its JSON 401 — the same response whichever side
  is stale; skip both and the pair stays matched only until the next deploy.
- `VERCEL_AUTOMATION_BYPASS_SECRET` (script-only, `.env.local`) — sent as
  the `x-vercel-protection-bypass` header. Vercel Authentication on this
  project is `prod_deployment_urls_and_all_previews` [measured
  2026-09-17], so the header is required against **any `*.vercel.app`
  URL** — staging, previews, _and_ production's own deployment URL — and
  unnecessary only against the custom domain `brandonperfetti.com`.
  Target production by its custom domain and the header question goes
  away; target staging (a `*.vercel.app` alias) and it is mandatory.
- **Runtime for the ingest step.** Only a shell that can load `.env.local`
  can run it — in practice a Claude Code session on the owner's machine.
  A Cowork session can do neither: its sandbox cannot reach the
  Vercel-protected hosts (egress proxy 403 on CONNECT) and it never holds
  the secrets [measured 2026-09-10/11]. When the agent runs in Cowork,
  the ingest is owner-run (or the human path in §4). Loading note: a bare
  `export NAME` does not read `.env.local` — load the file into the shell
  first; an empty bypass header shows up as Vercel's
  `401 Protected deployment`, not as the route's JSON error.

### 1. Pick

Select the next item from the Content Calendar (Notion, planning-only:
topic, angle, audience, publish date — nothing else lives there).

### 2. Draft

Write the article in-session per **docs/CONTENT_STYLE.md** (voice,
article types, quality gates, revision loop — distilled from the retired
Notion SOPs); create it as a **draft** Post via MCP
(`createPosts`, `draft: true`, `_status: "draft"`). Full bodies fit in
one call — a 35,495-byte, 64-node Lexical body round-tripped intact in a
single `createPosts` and read back node-for-node (measured 2026-09-10,
staging post 56). The earlier ~12 KB figure was a lower bound, not a
limit; the true limit is unknown, so do not split a body below that
measured size. (The historical ~2KB truncation applied to
JSON-in-a-string params only, not structured `content`.) Respect the
Lexical node registry (docs/PAYLOAD.md); ≥1500 words for technical
posts; never put image prompts in the body.

### 3. Covers

Covers are **designed, not generated** — follow **docs/CONTENT_STYLE.md
§9** in full; this section only places it in the run. Author the motif
in `tools/covers/cover-{postId}.html` over the shared shell, render the
review PNG (`node render.mjs cover-NN`), pass the distinctiveness gate
(thumbnail contact sheet beside the five most recent covers; no
archetype repeat within the last four), get human approval, then
`assemble.py` → `minify.py` → upload to Cloudinary as a data-URI PNG at
the canonical path:

    bp-portfolio/images/articles/{slug}/cover-ds-A.png

(`cover-ds-B`, `-C` for later variants — the retired AI-era `cover-a/b/c`
slots still exist and Cloudinary collisions are silent; §9 has the
gotchas.) Verify the delivered PNG visually — 2048×1152, `existing:
false` — before anything proceeds. Only the approved cover goes on to
§4.

### 4. Ingest the winner

Two paths, one outcome: a Media row in Blob with real bytes behind it.

**Human path (simplest when a person is at the keyboard):** upload the
PNG in the admin Media collection, or straight from the post's Hero
Image field, then attach the resulting media id via MCP `updatePosts`
(§5). No secret, no curl.

**Agent path:** the MCP cannot upload files (`createMedia` requires
multipart; admin "Paste URL" is a client-side fetch — spiked
2026-08-09). Worse, the wrong shape does not fail: `createMedia` with
metadata-only fields (`filename`, `mimeType`, `width`, `height`,
`filesize`) is **accepted** but fetches nothing — it mints a row whose
Blob URL is derived from `filename` with no bytes behind it, a dead row
that only appears to render if some other upload already put a file at
that exact path (measured 2026-09-23, staging media 176; staging and
production share one Blob store). Never attach a cover with
`createMedia`. Use the ingest route — a **media-creation** route
(Cloudinary source → Media doc), not a cache-revalidation call; it only
reuses the secret's name:

    POST https://<host>/api/media/ingest
    Content-Type: application/json
    x-vercel-protection-bypass: <VERCEL_AUTOMATION_BYPASS_SECRET>   # any *.vercel.app host; omit on brandonperfetti.com
    { "secret": <that host's value: CMS_REVALIDATE_SECRET_STAGING or _PRODUCTION>,
      "url": <cloudinary PNG URL>, "alt": <alt text> }
    → { ok, media: { id, url, filename } }

Auth is the **JSON body** (`secret`), never an `Authorization` or custom
header [source: `src/app/api/media/ingest/route.ts`]. The route compares
it to its own `CMS_REVALIDATE_SECRET`; only the script's _source_ of the
value is environment-named (§0). Pick the environment once and derive
both the host and the secret variable from it — never mix. Fail fast if
the variable is unset, build the body with `jq --arg`, and never echo the
value into output, handoffs, or receipts. Tell the two failures apart: a
wrong or missing bypass header fails at the Vercel edge _before_ the
route runs (a non-JSON `401 Protected deployment`); a wrong secret
reaches the route and returns `{"ok":false,"error":"Unauthorized"}`.

Server-side fetch → Media doc in Blob via the Local API (dimensions,
sizes, and the whole image pipeline apply); the stored filename is the
source URL's last two path segments joined with `-`, i.e.
`<slug>-cover-ds-A.png`. Guard rails: https + `res.cloudinary.com`
allowlist only, raster `image/*` only, 12MB cap. Cloudinary =
rasterization + archive of the source; Blob = serving copy.

### 5. Attach, publish, verify

1. `updatePosts` → `heroImage: <media id>`, SEO meta, categories/tags.
2. Publish now (`_status: "published"`) or schedule (future
   `publishedAt` — scheduled publish is native; no hidden-until-date
   conventions needed).
3. Verify the live article at `/articles/[slug]` (revalidation hooks
   make it live in seconds — no deploy). Not verified = not done.

### Known limits (measured, dated)

- Media deletion is NOT exposed via MCP (deliberate) — test/orphan media
  cleanup is an admin action.
- Bulk `where`-updates on versioned collections can partially fail;
  retry failures individually (2026-08 bulk-publish lesson).
- Body size verified to ≥35 KB in a single call (2026-09-10, staging
  post 56); the true limit is unknown — re-measure before assuming
  anything larger.
- Staging and production Payload id sequences coincide (post 56 and
  media 175 exist in both) [measured 2026-09-17], and the two environments
  share one Blob store. Always name the environment alongside any id in
  a receipt, handoff, or ticket — a bare "media 175" is ambiguous.
