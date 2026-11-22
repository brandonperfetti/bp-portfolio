# Code-rendered covers: the 2026-08 design system (history)

**Archived 2026-11-22 (#415). Not current direction.** Current covers follow
[`docs/CONTENT_IMAGERY.md`](../../docs/CONTENT_IMAGERY.md). This file keeps
`docs/CONTENT_STYLE.md` §9 as it stood on `develop` at `0b21c184`, word for
word below the rule, so the shell spec and its gotchas stay findable. The
tooling it describes sits beside this file (moved from `tools/covers/`).

What changed and when:

- **2026-08:** the backfill gave all 47 then-published articles a
  code-rendered `cover-ds-A` cover built with this tooling.
- **2026-09-26/27:** every live cover was replaced by a Midjourney
  photograph in the `cover-mj-A` series: 9 on 2026-09-26, 44 on 2026-09-27
  (receipts on #415). Light mode was the reason: the zinc-950 ground read as
  a dark tile on the light card.
- **2026-11-22:** Brandon chose to archive this system (option (a) on #415)
  rather than keep it as an alternative or delete it.

The `cover-ds-A` assets and their Payload media rows still exist; nothing
was deleted. Paths inside the quoted text (`tools/covers/…`) are as they were
then; the files now live in `archive/code-rendered-covers/`.

---

## 9. Cover & media direction (code-rendered design system)

Covers are **designed, not generated**. Every article cover is a
code-rendered 16:9 vector composition (2048×1152) built from a shared
shell plus a per-post motif, assembled by the tooling in
`tools/covers/`. AI image generation is retired for covers as of
2026-08. The 2026-08 backfill replaced every AI-era cover: **all 47
published articles now carry design-system covers**, so the full
catalog — not just a reference set — defines the look.

**The shell (brand constants — never vary):** zinc-950 (`#09090b`)
ground; one or two radial accent glows in the post's hue; a 64px fine
grid (`rgba(255,255,255,0.035)`) with a radial mask fade; a vignette;
film grain via `feTurbulence` (baseFrequency 0.9, 2 octaves, 5% white
alpha); thin-stroke vector geometry; constellation accents (4px dots +
plus marks); **no text, ever** — words in covers break at thumbnail
size and localize poorly.

**Hue map (one accent hue per topic family — 8 hues, expanded during
the 2026-08 backfill):** emerald `#34d399`/`#0d806a` = databases &
infrastructure; violet `#a78bfa`/`#7c3aed` = AI & agents; sky
`#38bdf8`/`#0369a1` = React, Next.js & frontend architecture; cyan
`#2dd4bf`/`#0f766e` = CSS & design systems; fuchsia `#e879f9`/
`#a21caf` = JavaScript & TypeScript language topics; amber `#fbbf24`/
`#d97706` = Node.js, APIs & messaging; rose `#fb7185`/`#be123c` = CMS
& content engineering; indigo `#818cf8`/`#4338ca` = engineering
practice & architecture decisions. New topic family → claim a new
Tailwind-400/700 pair here before designing. One hue per cover;
neutral zinc/white carries everything that isn't the accent.

**Composition archetypes (the variety engine):** journey (dim legacy
left → bright destination right), central monolith (one structure
fills the frame), scatter-to-order (chaos funneled into structure),
orbit/radial (elements circling a core), vertical ascent, macro
close-up (one object, huge), cutaway/cross-section, symmetric
face-off. **No archetype may repeat within the last 4 covers.**
Reference set: 51 scatter-to-order, 52 central monolith, 53 journey,
54 journey-through-portal, 55 pipeline/journey.

**Distinctiveness gate (hard, pre-upload):** render the candidate into
a thumbnail contact sheet beside the 5 most recent covers at index-card
size. It must differ from every neighbor in silhouette or archetype —
hue difference alone does not pass. If it reads as "same image, new
color," redesign the motif before uploading.

**Pipeline:** author the motif in `tools/covers/cover-{postId}.html`
(inline SVG over the shared `base.css` shell) → `node render.mjs
cover-NN` for the review PNG → get human approval → `python3
assemble.py NN` to emit the standalone SVG (per-post glows live in its
`GLOWS` dict) → `python3 minify.py NN` for the minified + base64
payload → upload to Cloudinary as a data URI with `format: "png"`
(server-side rasterization; SVG must be well-formed XML — no duplicate
attributes) → verify the delivered PNG visually → ingest into Payload
→ set `heroImage` + `meta.image`. Cloudinary is the renderer of
record; Playwright renders are the review proxy.

**Pipeline gotchas (each cost a debugging round — don't relearn them):**

- **Degenerate bounding boxes.** A gradient or `filter` referenced by
  a perfectly horizontal/vertical line or flat path silently collapses
  (percentage-based filter regions and `objectBoundingBox` gradients
  need a 2-D bbox). Use `gradientUnits="userSpaceOnUse"` on gradients,
  and for flat strokes either add slight curvature or drop the filter.
  Bit covers 5, 14, 18, and 26 during the backfill.
- **Base64 transcription duplication.** When a long (~10K-char) base64
  payload is hand-carried into an upload call, whole attribute or
  motif-body blocks can end up duplicated in the sent payload —
  stacked geometry compounds the glows and over-brightens the render.
  After every upload of a long payload, scan what was actually sent
  for repeated distinctive substrings. PNG byte size is **not**
  diagnostic (grain noise dominates). Recovery: re-upload the same
  `public_id` with `overwrite: true, invalidate: true` and point the
  ingest at the **new version URL**.
- **Silent Cloudinary collisions.** `overwrite: false` against an
  already-occupied `public_id` returns the OLD asset with
  `existing: true` — no error. Always check the response for
  `existing: false` plus the expected 2048×1152 dimensions.
- **Vercel Authentication on every `*.vercel.app` host.** The project's
  protection mode is `prod_deployment_urls_and_all_previews` [measured
  2026-09-17], so every automated request to staging, to a preview, _or_
  to production's own deployment URL (including `/api/media/ingest`) must
  send the `x-vercel-protection-bypass` header with the "Protection Bypass
  for Automation" secret (`VERCEL_AUTOMATION_BYPASS_SECRET` in
  `.env.local`). Where the header may go: `docs/SECURITY.md` § Secrets and
  the server-only boundary (#252).
  Only the custom domain `brandonperfetti.com` is outside Standard
  Protection — target production by that domain and no header is needed.
  A missing header fails at the edge as a non-JSON
  `401 Protected deployment`, before the route runs.
- **One Blob store today (by configuration, not code), deterministic
  names, two environments.** Staging and production resolved to a single
  Blob store when last checked [measured 2026-09-23]; the code guarantees
  nothing of the kind. Each deployment derives its store from its own
  `BLOB_READ_WRITE_TOKEN` (`src/lib/storage/mediaBlobUrl.ts`,
  `src/payload.config.ts`), and Vercel holds that variable as three
  separate entries — production, the `staging` custom environment,
  preview [measured 2026-09-26, the project's env listing by name] — so
  pointing any one of them at a token for a different store ends the
  sharing silently (a rotated token for the same store keeps its store
  id). Before relying on the shared path, compare the store ids in the
  staging and production `BLOB_READ_WRITE_TOKEN` values — the id is the
  token's middle segment (`vercel_blob_rw_<storeId>_…`): parse and print
  only that segment, never the token, and never echo production's token
  into a shell history, a handoff, or a receipt. A media URL's
  `<storeId>.public.blob.vercel-storage.com` host shows the same id only
  while `STORAGE_VERCEL_BLOB_BASE_URL` is unset; that override replaces
  the host, so it does not identify the store. While they share a store,
  the ingest route names the stored file from the source URL's last two
  path segments (`<slug>-cover-ds-A.png`), so a staging ingest and a
  production ingest of the same Cloudinary URL target the _same_ Blob
  path; whether the second overwrites the first is unmeasured. Decide
  deliberately whether a run ingests to staging as a rehearsal and again
  to production, and never treat a staging rehearsal as having placed
  production's bytes.

**Folder map (Cloudinary, canonical):** articles →
`bp-portfolio/images/articles/{slug}/`; X posts →
`.../x-posts/{slug-or-id}/`; LinkedIn →
`.../linkedin-posts/{slug-or-id}/`; other long-form →
`.../long-form/{slug}/`. **Design-system covers use the `cover-ds-A`
series** (`cover-ds-B`, `-C` for future variants). The retired AI-era
covers still occupy the original `cover-a/b/c` slots in every article
folder, and because collisions are silent (see gotchas above), the
design-system era claims its own deterministic namespace instead of
reusing those letters. No ad-hoc paths.

**Alt text:** describes the motif _as the thesis_, not as decoration —
"an oversized mail machine narrows into a single glowing line," not
"abstract illustration."

**Inline images:** default zero. Add 1–3 only for architecture/data-flow
explanation, visual tool comparison, or screenshot-worthy tutorial
steps.
