# Content style & revision (the craft layer)

Distilled 2026-08 from the retired Notion SOP stack (Voice Fidelity SOP,
Technical Blog Post SOP, Content Revision SOP, Voice Pattern Gate — all
preserved in AgentMine → Archive / Legacy → Pre-Payload Content
Pipeline). The _pipeline_ those documents described is dead; the
_editorial judgment_ in them is not. This file is that judgment, kept
where the Content Run SOP (docs/CONTENT_WORKFLOW.md) and any future
content-writing skill can build on it.

Precedence when rules conflict: **accuracy → clarity → voice style**.

## 1. The BP voice

Core characteristics:

- **Educator + practitioner** — teaches clearly from real-world
  execution, like a mentor explaining a system.
- **Structured and practical** — clear sections, frameworks, checklists;
  tactical clarity over abstract theory.
- **Confident but grounded** — assertive guidance without hype,
  arrogance, or "end-all-be-all" positioning.
- **Audience-forward** — frequent "you", focused on reader outcomes.
- **Professional warmth** — direct, positive, motivating, approachable.

Avoid: academic abstraction detached from implementation; motivational
fluff; excessive hedging without a recommendation; slang/meme tone;
unsubstantiated claims of expertise or outcomes.

Default voice formula (most content): problem framing → why it matters →
practical framework → application (examples, pitfalls) → takeaway with a
clear next action.

Reusable prompt add-on: _"Write in Brandon Perfetti's voice: practical,
structured, educator-practitioner tone, confident but grounded,
audience-forward, actionable, minimal fluff, clear framework
progression, and a strong takeaway."_

Platform tuning: blog = long-form structured depth with trade-offs;
LinkedIn = narrative + practical lesson, end with a discussion prompt;
X = high-signal compression.

## 2. Grounding rule

Personal/professional claims must be grounded in the canonical identity
sources — today that means the Payload **Identity** global,
**WorkHistory** collection, and the current resume, not memory. Claim
precedence: canonical profile → primary technical docs → derived
artifacts. A draft that invents experience, projects, or outcomes fails
regardless of quality.

## 3. Article types (declare exactly one before drafting)

1. **Concept Explainer** — make an idea understandable and useful. Code
   optional and minimal.
2. **Tool Showcase** — help the reader decide whether/when to use a
   tool. Must include concrete decision guidance (who should and
   shouldn't use it). Code selective.
3. **Implementation Tutorial** — help the reader ship something. Code
   required and substantial. Must include: prerequisites (versions,
   accounts), setup commands for a clean environment, ordered build path
   with checkpoints, validation ("what should work"), and ≥3
   troubleshooting entries.
4. **Hybrid** — concept clarity first, one implementation path second.

A body that contradicts its declared type fails. Structure patterns:
problem → context → deep dive → implementation → takeaways; opinionated
thesis; or step-by-step tutorial. Length: ≥1500 words excluding code
(hard floor), ~2000 target, 3500 ceiling by topic depth.

## 4. Code rules

Decision matrix per block: is code the clearest way to teach _this_
point? Would prose + example be better? Does the block prove
implementation behavior rather than restate theory? Use code for setup,
wiring, API usage, architecture, debugging, tests. Never for defining
concepts, framing decisions, or the thesis. TypeScript by default. No
fictional APIs; no unverifiable version claims — verify against official
docs.

Human-first explanation: prose teaches the concept before code appears;
every major section gets at least one concrete scenario or analogy and a
plain-English restatement; a motivated early-career developer can follow
without losing rigor. If the prose can't stand without the code blocks,
rewrite.

## 5. Quality gates (run before any review pass)

**Value-spine:** one big idea ("the point is ___" in one sentence); the
first 150 words name a concrete pain the target reader feels; one story
anchor (before/after, failure/recovery, trade-off); a framework or
checklist the reader can apply immediately; an ending with an explicit
next action; jargon defined at first use.

**Semantic sanity:** thesis lock ("this article teaches X to Y so they
can Z"); every section justifies how it supports the thesis; every code
block states what claim it proves; per-section title-alignment score 1–5
with no section below 3 and average ≥4.0; concrete "after reading this,
you can now…" outcome. If any check fails, **regenerate from the brief —
don't patch** a low-substance draft.

**Voice pattern hard-fails:** openings that begin with stock lead-ins
("Most …", "In today's …", "In this guide …", "Let's dive …"); headings
that read as process-template labels ("Review checklist", "Quality
gate", "Before merge") instead of reader-facing language; any revision
notes or agent meta-text left in the body.

**Emoji:** signal, not decoration. 0–6 per technical post; allowed in
headings/callouts/checklists; never in code, commands, identifiers, or
as paragraph garnish. If removing it improves clarity, remove it.

**Links:** inline at the point of claim (same or adjacent sentence) —
never standalone "Inline docs:" citation lines; primary sources
(official docs → release notes → specs) over secondary; 3–8 high-value
links per long-form post; version-specific claims always linked; no dead
links at publish; a References section is optional and supplements, never
replaces, inline links.

## 6. The revision loop

Ordered passes, each with an explicit pass/fail:

1. **Copyedit** — grammar, clarity, concision, voice alignment.
2. **Logic review** — thesis coherence, section order, transitions,
   ordered-list continuity (numbering must render 1-2-3, not 1-1-1).
3. **Tutorial validation** (tutorials/hybrids only) — commands,
   sequence, prerequisites, and outcomes are internally consistent and
   reproducible.

Any fail loops back with concrete defects noted, then re-runs the failed
pass. Revision controls to specify per request: length, tone, audience,
structure, technical depth, examples, code, SEO, platform fit, CTA,
voice.

Output contract per revision: the revised draft + a **Change Summary**
(what changed and why) + **Open Questions** (uncertain claims) — kept in
notes, never left in the article body. Edits exceeding ~40% of the body
are a Substantial Revision and should be labeled as such. Hard
constraints: never invent facts; never change the thesis without
instruction; never alter technical claims unless correcting a clear
error.

**Scoring rubric** (1–5 each: practicality, clarity, authenticity,
authority, audience fit): average ≥4.0 to pass, any dimension <3 forces
revision.

**Publish ceiling:** AI takes a piece to _ready_; a human makes it
_published_. This carried over from the old system on purpose — final
publish is always Brandon's call.

## 7. For the future content-writing skill

This file is the rubric; docs/CONTENT_WORKFLOW.md → _The Content Run_ is
the pipeline. A skill that drafts for a declared audience, loops §6
until §5's gates and the rubric pass, generates covers, and publishes
via the Payload MCP needs no source of truth beyond those two documents
plus the identity sources in §2.

## 8. SEO metadata (editorial rules for the SEO tab)

The Payload SEO plugin provides the fields; these rules fill them well.
Start from user intent — what query should this article win? SEO title
45–65 characters with concrete nouns and the target technology near the
front; meta description 120–160 characters written as a compelling
summary, not a teaser; primary keyword naturally in both; benefit-led
wording over vague adjectives; no clickbait; one canonical topic per
article; never duplicate an SEO title across published articles. Re-run
this check whenever the headline, slug, intro/positioning, keyword
targeting, or audience changes after initial publish.

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
- **Vercel Authentication on staging.** Every automated request to
  staging (including `/api/media/ingest`) must send the
  `x-vercel-protection-bypass` header with the "Protection Bypass for
  Automation" secret. Custom production domains are not covered by
  Standard Protection, so production needs no header.

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

## 10. Content dating rule (credibility hard gate)

An article's publish date must be on or after the release date of every
technology it references — with multiple dependencies, the latest
release date is the floor. Timeless topics (language patterns,
fundamentals, testing, a11y, CSS architecture) carry no restriction.
Verify release dates fresh from primary sources at drafting time; do not
trust any cached table (the archived SOP #7 table was a point-in-time
snapshot). This matters most for backfill-dated content, where a single
anachronism destroys credibility.
