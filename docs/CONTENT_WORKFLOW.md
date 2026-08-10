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
   Watchpoints): `/articles` and the search palette within ≤5 minutes,
   the sitemap on its hourly revalidate.
4. Slugs lock after creation (`slugLock`). Changing a published slug breaks
   the URL contract — add a redirect via plugin-redirects if truly needed.

## Draft preview

Admin Live Preview / Preview buttons hit `/next/preview` (secret:
`PREVIEW_SECRET`) and render draft content; `/next/exit-preview` clears.

## Migration provenance

The v3 archive was migrated from Notion by
`scripts/migrate-notion-to-payload.ts` (one-time): slugs preserved and
locked, bodies converted to Lexical, covers uploaded to Blob, everything
landed as drafts for review-then-publish. `scripts/fix-migrated-posts.ts`
audited node counts and backfilled authors. Both stay for reference; they
are not part of any recurring workflow.

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
- Cloudinary MCP connector (generation + asset management) — generation
  lands directly in the account; default model `nano-banana-2`, `flux`
  family for photoreal covers, `recraft` for illustration.
- `CMS_REVALIDATE_SECRET` (Preview + staging env; production gets its
  own value at promotion) — auths `/api/revalidate` AND
  `/api/media/ingest`.

### 1. Pick

Select the next item from the Content Calendar (Notion, planning-only:
topic, angle, audience, publish date — nothing else lives there).

### 2. Draft

Write the article in-session per **docs/CONTENT_STYLE.md** (voice,
article types, quality gates, revision loop — distilled from the retired
Notion SOPs); create it as a **draft** Post via MCP
(`createPosts`, `draft: true`, `_status: "draft"`). Full bodies fit in
one call — a 16-paragraph/~12KB Lexical tree round-tripped byte-perfect
(measured 2026-08-09; the historical ~2KB truncation applied to
JSON-in-a-string params only, not structured `content`). Respect the
Lexical node registry (docs/PAYLOAD.md); ≥1500 words for technical
posts; never put image prompts in the body.

### 3. Covers

Generate 2–3 candidates via Cloudinary `generate-image` straight into
the canonical path (kept from the legacy flow — its best idea):

    bp-portfolio/images/articles/{slug}/cover-{A|B|C}

Review candidates visually in-session (thumbnail clarity, no rendered
text/artifacts, archetype variety across articles — the old scoring
rubric collapsed into judgment). Human picks or delegates. Non-winners
stay in Cloudinary as archive; nothing but the winner proceeds.

### 4. Ingest the winner

The MCP cannot upload files (`createMedia` requires multipart; admin
"Paste URL" is a client-side fetch — spiked 2026-08-09). Use the ingest
route instead:

    POST /api/media/ingest
    { "secret": CMS_REVALIDATE_SECRET, "url": <cloudinary URL>, "alt": <alt text> }
    → { ok, media: { id, url, filename } }

Server-side fetch → Media doc in Blob via the Local API (dimensions,
sizes, and the whole image pipeline apply). Guard rails: https +
`res.cloudinary.com` allowlist only, `image/*` only, 12MB cap.
Cloudinary = generation + archive; Blob = serving copy.

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
- Body size verified to ~12KB single-call; larger articles untested —
  re-measure before assuming.
