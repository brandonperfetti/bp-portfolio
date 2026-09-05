# AI (Corvus)

## Surface

`/corvus` renders `CorvusChat` (Vercel AI SDK `useChat`) streaming from
`POST /api/ai/chat`. Markdown rendering via streamdown/react-markdown, with
its link component **replaced** rather than configured, so an internal
citation is a real same-tab anchor (see "Links in a reply" below).

## Server enforcement (`src/lib/ai/corvus.ts` + route)

- `CORVUS_SYSTEM_PROMPT` is applied **server-side on every request**; client
  system messages are ignored. Never trust or forward client roles other
  than user/assistant history.
- Request bodies are Zod-validated; oversize/malformed input is rejected.
- Provider/model are env-selected: `AI_CHAT_PROVIDER` (`openai|anthropic`) +
  `AI_CHAT_MODEL`; `AI_MAX_COMPLETION_TOKENS` caps output.

## Guardrails (`src/lib/security/`)

- `limiter.ts`: Upstash Redis rate limits — per-minute and daily quota,
  keyed by (HMAC-hashed) IP for anonymous requests and by Clerk `userId`
  for signed-in ones (the route builds the key; see the chatGate bullet).
  Without Upstash env, dev fails open (never ship that state to
  production).
- `guardrails.ts`: shared quota/limit application; kill switches
  `CORVUS_DISABLE_CHAT` / `CORVUS_DISABLE_IMAGE` (renamed from `HERMES_*`,
  #77). The in-memory `applyRateLimit`/`applyDailyQuota` here are
  the DEV-ONLY fallback for `limiter.ts` — not a prod path.
- `chatGate.ts` (#74, folds #18): anonymous free-message soft-gate — a
  CUMULATIVE per-IP count in Upstash (default 3, `CORVUS_ANON_FREE_MESSAGES`),
  distinct from
  `limiter.ts`'s per-minute/daily RATE. The (N+1)th anonymous chat request
  returns `{ code: 'sign_in_required' }` (HTTP 401) BEFORE the model runs;
  the client (`CorvusChat.tsx`) renders a Clerk sign-in prompt, not an
  error. Signed-in users skip the free-gate and are keyed by `userId` (not
  IP) in `limiter.ts` at a higher ceiling
  (`CORVUS_CHAT_RATE_LIMIT_PER_MINUTE_AUTHED` / `CORVUS_CHAT_DAILY_QUOTA_AUTHED`).
  Every decision is server-resolved (Clerk session + trusted IP), never the
  request body.
- Turnstile (wired 2026-08-10, env-gated): the contact form enforces
  whenever `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  exist; chat is armed separately via the `TURNSTILE_PROTECT_CHAT` /
  `NEXT_PUBLIC_TURNSTILE_PROTECT_CHAT` pair (both `'true'`, in lockstep).
  Chat ships disarmed by design — its worst case is already bounded by
  limits/quotas, and Turnstile's script is blocked by some privacy
  blockers, which would break the signature feature. Arm on observed
  abuse; soak-test armed on staging first. Client flow:
  `useTurnstileToken` (invisible, fresh single-use token per request,
  degrades to `null` when blocked so the server stays the decider).
- Responses degrade with friendly copy when limited/disabled — keep that UX.

## Links in a reply (#144)

streamdown `^2.5.0` defaults to `linkSafety = { enabled: true }`, which guards
**every** link with a confirmation modal whose copy is hard-coded external
framing ("Open external link?" / "You're about to visit an external
website."). Uncontested, that means the `/tech` citation grounding exists to
produce warns the visitor they are leaving the site — to go to the site.

#144 configured that guard with `linkSafety={{ enabled: true, onLinkCheck }}`,
which removed the modal from internal links and left everything else. **#158
replaced the link component instead**, and that is the shape today.

**Brandon's rule (#158, 2026-09-04): internal links navigate in the same tab;
only external links open a new tab, and only they keep the confirmation.**

`CorvusChat.tsx` passes `components={{ a: CorvusReplyLink }}` and **no
`linkSafety` at all**. That is the only seam that can produce a real anchor:
streamdown 2.5.0's `linkSafety` branch renders a `<button>` unconditionally
and `renderModal` replaces the dialog, never the trigger
(`dist/chunk-BO2N2NFS.js`, verified 2026-09-04), while a user `components`
entry wins outright over the default map (`{...defaults, ...user}`, same
file). With `CorvusReplyLink` mounted, `Lo` never renders, so keeping
`linkSafety` would be configuration for a component that does not exist.

The cost of owning the anchor is owning the confirmation, which streamdown
does not export. `CorvusReplyLink` renders its own, and being ours it meets
`docs/ACCESSIBILITY.md`'s overlay rule — "overlays trap and restore focus":

- a real `role="dialog"` with `aria-modal="true"` and an accessible name
  (streamdown's had `role="button"` on the backdrop, `role="presentation"` on
  the panel, and no accessible name at all);
- focus moved to the confirming action on open and **returned to the trigger**
  on close (all four close paths — Escape, Cancel, Confirm, backdrop — share
  one `close()`); Escape dismisses;
- **Tab and Shift+Tab cycle within the dialog**, and the chat surface behind it
  carries `inert` while it is open, so the composer, the mic and every other
  citation are out of reach for the keyboard _and_ for a screen reader's
  virtual cursor — a Tab trap alone closes only the first of those doors.

Three implementation notes that are decisions rather than details. The dialog
is **portalled to `document.body`**: it sits inside the chat card in the React
tree, and marking its own ancestor `inert` would otherwise make the dialog
inert too. `inert` is set imperatively on a node React renders without an
`inert` prop, so a re-render cannot clobber it — React only reconciles
attributes it was given.

And **the focus restore happens in the effect cleanup that removes `inert`,
after the attribute comes off** — never synchronously in `close()`. React
batches the state update, so at `close()` time the surface is still inert, and
`.focus()` inside an inert subtree is a **no-op** in a real browser:
`activeElement` stays on `<body>`. That shipped briefly and was caught in
Chromium, not in jsdom — **jsdom does not implement inert focusability**, so
the unit test asserting the restore passed green throughout
`[measured, 2026-09-04]`. The unit test is kept (it catches a restore deleted
outright) but the `ExternalLinkConfirmation` story is the proof: it closes by
Escape and by Cancel and asserts focus returns in a real browser. Reverting the
fix turns that story red and leaves the jsdom suite green — which is the whole
reason the story exists.

The trap is hand-rolled, and that is a **deferral worth naming**: `CLAUDE.md`
says new UI starts from a shadcn/ui primitive, but there is no dialog primitive
in `src/components/ui` and `@radix-ui/react-dialog` is not a dependency, so
satisfying that half of the rule means editing `package.json` — out of scope
for #158. The story below is what gates the accessibility in the meantime;
moving this dialog onto a real primitive is a follow-up.

`CorvusChat.stories.tsx` carries an `ExternalLinkConfirmation` story that opens
the dialog through the real `useChat` transport (a hand-built AI SDK v1
UI-message-stream response, so the reply is genuinely streamed and genuinely
rendered by streamdown), so the Storybook a11y addon gates it and the focus,
trap and `inert` behaviour — open **and close** — is asserted in a real browser
rather than only in jsdom.

| Kind                | Renders    | Plain click                              |
| ------------------- | ---------- | ---------------------------------------- |
| internal            | `<a href>` | `router.push` — same tab, in-app         |
| external `http(s)`  | `<button>` | confirm, then `window.open(…, '_blank')` |
| `mailto:` / `tel:`  | `<button>` | confirm, then `window.open(…, '_self')`  |
| mid-stream sentinel | `<span>`   | nothing                                  |

The internal `href` is **real**, not decorative, and modified clicks
(⌘/Ctrl/Shift/Alt, or any non-primary button) are left to the browser — which
is what makes hover-preview, middle-click, "copy link address" and
open-in-new-tab all mean what a visitor expects.

`mailto:`/`tel:` get honest copy now ("Open your email app?" / "Start a phone
call?"). #144 sent both through the "external website" modal and this document
recorded that as a deliberate, conservative lie; owning the dialog is what
made telling the truth free. They hand off with `_self` rather than `_blank`
so the browsers that do not close a hand-off tab do not strand an empty one.

**Internal** (`src/lib/ai/linkSafety.ts`) = path-relative (`/…`, `#…`, `?…`),
**or** an `http(s)` URL whose host is the currently-served host
(`window.location.host`, which is what makes preview and staging deploys
correct without naming them) or passes the shared `isInternalHost()` in
`src/lib/link-utils.ts` — `getSiteUrl()`'s host plus the local/e2e hosts. That
helper is the ONE definition of "this site"; the site chrome's
`isExternalHref` reads the same one, so the two cannot drift.

Everything else is external, including every non-`http(s)` scheme. That is a
deliberate divergence from `isExternalHref`, which counts `mailto:`/`tel:` as
internal because its question is only "does this need `target=_blank`?" — the
guard's question is "may this skip a safety prompt?", and the answer for a
scheme that hands off to another application is no.

**The #158 defect, for the record.** Under #144 an approved internal link was
still opened by streamdown with `window.open(href, '_blank', 'noreferrer')`
and still rendered as a `<button>` — measured in jsdom against the streamdown
dist (2026-09-02) and reproduced on production by Brandon during the wave-5
release smoke (2026-09-04, master `31be240`): the "technology page" citation
and the "Read the full stack breakdown" article link both opened a new tab. It
was never a regression — streamdown's un-guarded branch is `<a
target="_blank">` too, so new-tab was its baseline in both branches — it was
simply as far as configuring `linkSafety` could get. This document said the
alternative "would have to reimplement the guard and modal wholesale"; #158
did exactly that, and the paragraphs above are the result.

No streamdown upgrade was needed or taken: the seam that fixed this
(`components.a` overriding the default map) is present in the installed
`2.5.0`, so `package.json` is untouched.

## The completion budget, and why a turn can come back empty (#138)

`getCorvusModel()` returns `openai(modelId)`, and in `@ai-sdk/openai` 3.0.87
the bare provider call is the **Responses** API (`OpenAIProvider`'s call
signature takes an `OpenAIResponsesModelId`). On that API a reasoning model's
hidden reasoning tokens are billed as output tokens and drawn from the _same_
`maxOutputTokens` allowance as the visible answer. The default model is
`gpt-5-mini`; the allowance is **1024**
(`resolveGuardrailLimits`, `AI_MAX_COMPLETION_TOKENS`, cap 8000), mirrored by
`EVAL_MAX_OUTPUT_TOKENS` in `evals/corvus-helpers.ts` and drift-guarded by
`scripts/eval-harness.test.ts`.

So a turn that needs to think can spend the entire budget reasoning and finish
`length` having emitted nothing. **One observation** of this, on the
safety-refusal case in a keyed `eval:ci` run (2026-08-30): `finishReason=length`
with no visible text, on both of that case's two attempts. That is a single
two-attempt data point, not a rate — it shows the failure is reproducible and
not a transient fault a retry can outrun, but **the frequency and the
underlying reasoning-token distribution are still unmeasured**, which is
exactly what the open decision below turns on.

**The fail-safe (shipped).** `src/lib/ai/emptyReplyFailsafe.ts` is a
`streamText` `experimental_transform` wired in `src/app/api/ai/chat/route.ts`.
When a step finishes `length` having streamed no non-whitespace text, it
injects one canned sentence in Corvus's voice
(`CORVUS_EMPTY_REPLY_FAILSAFE`) as its own text block, immediately before the
`finish-step` chunk. A visitor can never receive a blank turn, at any budget.

A **truncated** (non-empty) `length` finish is deliberately left alone: a
mid-sentence answer is still readable, and any marker would be noise on every
long reply and wrong once the budget decision lands. Instead every non-`stop`
finish logs `[corvus] finishReason=… textLength=… failsafe=…`, so the
production frequency of both symptoms — recorded on #138 as unknown — becomes
a number.

The evals do **not** run through this: `evals/corvus-helpers.ts` calls
`generateText` directly rather than the route, so no recorded score moves and
`evals/empty-output.ts`'s zero-for-empty floor keeps seeing raw model
behaviour.

**Still open (Brandon's call, #138).** The fail-safe stops the blank bubble;
it does not stop the truncation. Two candidates, neither implemented:

1. **Raise the budget.** OpenAI's reasoning guide recommends reserving _at
   least 25,000_ tokens for reasoning plus output on these models; 1024 is
   two orders of magnitude under that. Raising it means moving
   `AI_MAX_COMPLETION_TOKENS`, the `EVAL_MAX_OUTPUT_TOKENS` mirror, and the
   drift guard together, and it raises the per-turn cost ceiling.
2. **Cap reasoning effort.** `@ai-sdk/openai` accepts
   `providerOptions.openai.reasoningEffort` on the Responses path, typed
   loosely as `string`; the documented ladder is
   `none | minimal | low | medium | high | xhigh | max`, but support is
   model-dependent and whether `gpt-5-mini` accepts the low end is
   **unverified here**. Cheaper than (1) and it attacks the cause rather than
   the allowance, but an unsupported value is an API-level rejection on every
   turn.

Whichever lands, the acceptance test is a keyed run showing the safety-refusal
case returning visible text at the chosen budget.

## What Corvus is (#166)

**A grounded assistant for everything Brandon: work history, technologies,
projects, articles, and this site's own code — sourced from the pages here and
his public repos.** Brandon settled that wording on 2026-09-04 during the
wave-5 release smoke, and it is the `/corvus` subtitle verbatim (CMS content,
his own write — a content edit, no deploy).

Three things have to say the same thing, and before #166 they did not: the
page copy still described "a practical AI workspace for Q&A, prompt iteration,
and image generation experiments", the prompt described a persona, and the
citations pointed at site pages and repositories. `CORVUS_POSITIONING` in
`groundedSystem.ts` is the model-facing half, appended to every **grounded**
turn.

Two deliberate limits on it:

- It is **not** in `CORVUS_SYSTEM_PROMPT`. That constant is frozen by contract
  — `buildGroundedSystem([])` returns it by identity, the safety eval's
  injection-leak assertion is built on its value, and `corvus.test.ts` pins the
  routes it names. And the positioning is only meaningful when there are
  passages: an ungrounded turn has no pages and no repositories for "sourced
  from the pages here" to describe.
- It does **not** narrow the persona to Brandon-only questions, which would
  quietly repeal #77's broad scope, and it does not widen what may be claimed
  or cited — it says so in its own closing sentence, because a confident
  statement of purpose sitting above a list of citation restrictions is exactly
  the text a model reads as new permission.

Unlike the repo and proficiency rules it is **unconditional** within the
grounded block, so every grounded eval block's prompt moves with it. That is
the intended cost: what Corvus is is not a per-subject rule that can be gated
on a collection. The ungrounded blocks are untouched, byte for byte.

**Citation contract, post-sync.** `[measured, prod 2026-09-04, ops block C
live check]` after the first GitHub sync, "what does this site run on" cites
the `bp-portfolio` repository — the external-link confirmation is expected
there, because the link really does leave the site.

## Persona scope

Corvus's scope is **broad by design** (#77 follow-up): a genuinely useful
general assistant (software engineering, product/PM, technology,
entrepreneurship, general Q&A) with Brandon's work as its **home base**, not
its fence. It surfaces Brandon's articles/projects when relevant but does not
decline general questions. The only hard declines are what any responsible
assistant refuses — harmful/disallowed content, and using the site as free
bulk-content or homework-cheating infrastructure. The anon free-message gate
(#74) and rate limits bound the cost of that openness. Per-viewer persona
tiering and signed-in memory is a future extension (#81), not this prompt.

**The prompt names only real destinations (#82 wave 4).** It used to say
"point to the contact form", naming a destination with no address: there is no
`/contact` route under `src/app/(frontend)/` — the form is a page-builder block
(`src/blocks/ContactForm/`) an editor drops into a page — so a model told to
point at it and free to write a link guesses `/contact`, which
`never-fabricates-a-site-url` correctly scores 0. No stable anchor id exists to
link instead (`ContactFormComponent` renders a bare `<section>`), so the fix
removes the reason to guess rather than supplying a URL: a `Never invent a
link` rule that says where site URLs legitimately come from (the `Source:`
label on retrieved passages) and tells Corvus to name the contact form in
words. `src/lib/ai/corvus.test.ts` pins that the prompt names no path outside
`HEADER_NAV_LINKS` — the same source `evals/fixtures/site-routes.ts` derives
the scorer's real-route set from, so the prompt and the scorer cannot disagree
about which pages exist.

## Retrieval grounding (#82)

Site-specific answers are grounded in the site's own published content, pulled
out of a pgvector index at request time and appended to the system prompt as
clearly-labelled reference material. Everything below is server-side; nothing
new reaches the client bundle.

### The table

`corvus_embeddings`, created by `src/migrations/20260828_155359_corvus_embeddings.ts`.
Deliberately **not** a Payload collection — it is a derived, rebuildable index
written by hooks and a backfill script, so it never appears in a generated
schema snapshot and CI's migration-drift gate stays quiet.

| Column                                | Why it is there                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `embedding vector(1536)`              | `text-embedding-3-small`'s native width (decision D6(a))                                                                                                                                         |
| `content`, `content_hash`             | the chunk and the sha256 that makes refresh cheap                                                                                                                                                |
| `collection`, `doc_id`, `chunk_index` | `UNIQUE` together — the upsert key the hooks target                                                                                                                                              |
| `title`, `source_url`                 | what a citation is rendered from — `sourceUrlFor` resolves a post through `publicPathFor`, so a **placed** post (#153) is cited at its section path and every unplaced one at `/articles/<slug>` |
| `visibility`                          | a copy of Posts' `access.visibility`, so retrieval can filter without joining back into Payload                                                                                                  |
| `published_at`                        | so scheduled-future posts can be excluded                                                                                                                                                        |
| `model`                               | which embedding model wrote the row, so a model change is detectable instead of silently mixing vector spaces                                                                                    |

Index: **HNSW** with `vector_cosine_ops`, plus a btree on `(collection, doc_id)`
for the hooks' per-document path. HNSW rather than IVFFlat because the migration
runs against an empty table and IVFFlat's `lists` parameter is only meaningful
once rows exist.

**The 2,000-dimension ceiling is why the width is 1536.** pgvector's HNSW
indexes the `vector` type only up to 2,000 dimensions, so `text-embedding-3-large`'s
native 3072 would force `halfvec` and a more exotic schema. Instead the write
path always sends an explicit `dimensions` provider option, which lets
`-3-large` be swapped in later at 1536 with no migration at all.

Embedded collections: `posts`, `projects`, `uses`, `tech-stack`,
`work-history`, plus the non-CMS `github-repos` (#147, below). Pages are **not**
embedded (decision D8(b)) — mostly layout chrome, and retrieval noise for little
factual value. Adding them later needs no schema change.

### What an anonymous visitor can retrieve

Two predicates in `buildRetrievalQuery` (`src/lib/ai/retrieval.ts`) carry the
safety of this feature, and neither is optional:

```sql
WHERE ($isAuthenticated::boolean OR "visibility" = 'public')
  AND ("published_at" IS NULL OR "published_at" <= now())
```

The first is the gating filter. `src/access/canAccess.ts` is the single
authoritative gating check, and a grounded chat answer is a payload sent to the
client like any other — without this predicate, a vector query over post bodies
is a gated-content bypass. Anonymous turns pass `false`, collapsing the
disjunction to `visibility = 'public'`. The truth table is pinned by unit test
and by a route test asserting that an anonymous request never receives a
`visibility='gated'` chunk.

The second is the publication embargo: `NULL` means "not a scheduled thing"
(the four flat collections) and stays retrievable; a future `published_at`
does not, matching how the rest of the site treats scheduled posts.

Retrieval runs for **everyone**, not only signed-in visitors (decision D7(a)) —
the free taste is exactly where grounding helps most.

### Freshness: hooks, the hash skip, and metadata drift

`src/hooks/corvusEmbeddings.ts` mirrors the `revalidateCollection.ts` pattern:
an `afterChange` factory plus an `afterDelete` companion, per collection. It
honours `context.disableRevalidate`, skips drafts, unpublished documents and
autosave ticks, is bounded by `AbortSignal.timeout`, and **never throws** — a
provider outage must not fail a content save. Published-content edits therefore
reach retrieval with no redeploy.

Two skip paths, and the second one is a security fix, not an optimisation:

1. **`content_hash` skip.** Every chunk's sha256 is stored. If the freshly
   computed hashes all match, nothing is written and no provider call is made.
   This is what makes running the hook on every save affordable.
2. **Metadata-drift repair.** Flipping a published post from public to gated
   changes no body text, so every hash matches and a hash-only comparison
   reports "unchanged" — leaving stored rows saying `visibility = 'public'`
   while the article is gated on the site, indefinitely. `hasMetadataDrift`
   catches exactly that, and `updateDocumentMetadata` repairs it with one plain
   `UPDATE` per document and **zero provider calls**. Re-dating a post into the
   future has the same shape. A public → gated flip has to take effect
   immediately, and making it expensive would have been an argument for not
   doing it.

`scripts/backfill-corvus-embeddings.ts` (`pnpm corvus:backfill`, via
`payload run`) does the initial population after the migration lands, repairs
rows a failed hook left stale, and re-embeds everything after an
`AI_EMBEDDING_MODEL` change — `readStoredHashes` treats a row written by a
different `model` as absent. The hash skip makes a re-run over an already
current index nearly free, so running it is never the wrong call.

### Public GitHub repos as a collection (#147)

`collection: 'github-repos'` is the first non-CMS collection in the index: one
document per **public** `brandonperfetti` repository, holding its name,
description, topics, language breakdown, homepage and root README. It exists
because repo knowledge was the corpus's thinnest area and the repos are already
the source of truth — hand-feeding repo facts into the CMS would have recreated
the freshness liability wave 3 spent a wave burning down.

| Aspect         | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| `collection`   | `github-repos`                                                      |
| `doc_id`       | GitHub's numeric repository id — stable across a rename             |
| `source_url`   | `https://github.com/<owner>/<repo>` — the index's ONLY absolute URL |
| `visibility`   | always `public`; a private repo is refused, never stored as gated   |
| `published_at` | the repo's `pushed_at`, falling back to `created_at`, else `NULL`   |
| `title`        | `owner/name`                                                        |

`published_at` is `pushed_at` for two reasons: it is always in the past, so it
can never accidentally embargo a repo through retrieval's
`published_at <= now()` predicate the way a future-dated post is embargoed; and
"last pushed" is what a repository's recency actually means. `NULL` is the
honest fallback when both timestamps are unusable — it means "not a scheduled
thing" and stays retrievable — rather than fabricating `now()`.

**No migration.** `corvus_embeddings.collection` is a plain `text` column
(decision D3c anticipated non-CMS collections), so this needed none. Note the
one real constraint: `doc_id` is `integer`, and GitHub repository ids sit around
1.0e9 against an `int4` ceiling of 2,147,483,647. `assertIndexableRepo` refuses
an out-of-range id with a named error rather than letting Postgres reject it
mid-run; widening that column when GitHub crosses the ceiling is a migration.

#### Cadence and trigger

`.github/workflows/corvus-github-sync.yml` — `workflow_dispatch` plus a weekly
cron at **12:23 UTC on Sunday**, deliberately clear of `corvus-backfill.yml`'s
11:07 slot because both hold a long-lived session-mode connection to the same
production database. It runs `pnpm corvus:sync-github`, the same package-script
shape `corvus-backfill.yml` uses for `pnpm corvus:backfill` — the script is the
one place the entry point is spelled, so the workflow, these docs and an operator
at a terminal cannot drift apart on it.

**Never a live tool call from the chat route.** Reading a README at answer time
would add per-turn latency, rate-limit exposure and a live prompt-injection
surface — README text entering the prompt unreviewed, from a source the site
does not control. Indexing at sync time keeps every passage inspectable in
`corvus_embeddings` before a visitor can be answered from it. Staleness is
bounded by the cadence, which is the trade #147 chose explicitly.

Secrets the workflow needs (names only — this repo is public):
`SUPABASE_DB_URL_PROD` and `OPENAI_API_KEY`, both already used by
`corvus-backfill.yml`, plus the OPTIONAL `CORVUS_GITHUB_SYNC_TOKEN`. The step
reads `secrets.CORVUS_GITHUB_SYNC_TOKEN || secrets.GITHUB_TOKEN`, so the
workflow's own automatic token runs it by default; set the PAT (fine-grained,
Public Repositories read) only if a run reports 403/404 on repositories that are
public. Whether the automatic token suffices is **unmeasured** — the lane that
wrote this had no egress to api.github.com — and the first dispatch settles it.

#### Never-leak

A repository made private or deleted must stop being retrievable, and three
mechanisms carry that:

1. **The endpoint.** Listing is `/users/{owner}/repos`, which has no spelling
   that returns a private repository, rather than `/user/repos?visibility=public`
   — a superset filtered by a parameter a typo can turn off.
2. **The guard.** `assertIndexableRepo` refuses a `private: true` repo at
   NORMALIZATION time, so no path that can produce a chunk bypasses it.
3. **The sweep.** `sync-github-repos.ts` prunes by DEFAULT — the inverse of the
   backfill's opt-in `--drop-orphans`, because a stale CMS row is merely stale
   while a stale repo row is a private repository still being served to
   anonymous visitors. `canSweepGithubRepos` refuses an incomplete listing, an
   empty listing, and a run in which nothing was accounted for, so a bad read
   cannot empty the index. `--no-prune` exists for an operator at a terminal and
   the workflow test pins that the schedule never passes it.

`evals/github-repos-pgvector.test.ts` proves the bar as an outcome rather than
as a call: after the sweep, an anonymous AND an authenticated retrieval over
real pgvector both fail to return the removed repository.

Forks are **excluded** — a fork's README is somebody else's project text, and
indexing it under "Brandon's repositories" is a grounding defect rather than
coverage. Archived repos ARE indexed and marked archived in the document, so an
answer need not present a dormant experiment as current work. This is the one
deliberate narrowing of #147's "every public repo".

Re-syncing is a no-op: the `content_hash` skip applies unchanged, and the
rendered document deliberately excludes `pushed_at` from the hashed text — that
timestamp changes on every push, so folding it in would re-embed every active
repo every week for nothing. A moved `pushed_at` alone takes the metadata-repair
path: one `UPDATE`, zero provider calls.

#### Three subjects: you, this site, Brandon (#147, #167)

`/tech` lists the technologies Brandon **works with**. The `bp-portfolio`
repository document describes what **this site** is built on. Before #147 only
the first was indexed, so the corpus could not tell them apart:
`[measured, 2026-09-02, preview of feat/sections-grounding-correctness at
7f35583]` "What technologies does this site run on?" was answered with "Remix,
TanStack, Fly.io, Netlify, DigitalOcean" and cited `/tech` — a real citation and
the wrong list.

#167 then measured the two ways that two-subject rule was still too narrow, on
production 2026-09-04:

- **"What tech do you use?"** answered with Brandon's toolkit (Node.js, Vercel,
  Supabase, Vite, TanStack). The question was addressed to **Corvus** — and
  worse than a misread, there was no about-Corvus grounding anywhere in the
  corpus, so even a correct reading of "you" had nothing to cite.
- **"What tech was this site built on?"** answered Remix, TanStack, Netlify and
  Fly.io — #147's own failure, back, because the rule named the phrasing "run
  on" and the visitor said "built on".

`buildGroundedSystem` therefore appends `SUBJECT_DISAMBIGUATION_RULE`, one rule
covering all three subjects. Rewritten rather than joined by a second
paragraph: two paragraphs both explaining how to pick a subject is how a model
gets to pick whichever it read last.

| Asked about    | Answer from                                   | Never from                              |
| -------------- | --------------------------------------------- | --------------------------------------- |
| **you/Corvus** | the About Corvus passage, cite `/corvus`      | Brandon's technology list               |
| **this site**  | the `bp-portfolio` repo, then a stack article | a project entry, or the technology list |
| **Brandon**    | `/tech`                                       | a repository                            |

Every entry in the "never" column is a measured wrong answer, not a
precaution — including `projects`: `[measured, 2026-09-04]` "What powers this
site?" and "What is under the hood on this site?" retrieve the
`Brandon Perfetti's Portfolio` **project** entry tied with the repository
passage and listed ahead of it. Retrieval cannot separate them at this corpus
size; the rule is the only thing that can.

The site-subject phrasings are enumerated in the rule — run on / built on /
built with / made with / powered by / under the hood — because #167's second
failure was purely a phrasing miss, and a rule that says "questions like this
one" with a single example generalises at the model's discretion.

It also grants permission to cite a repository's github.com `Source:` line, the
sentence retained verbatim from #147 (the neighbouring "a third-party address is
never the source for a claim about this site" would otherwise read as a ban on
the one citation a repo passage has).

The rule is appended on **either** of two triggers: a `github-repos` or About
Corvus passage is in context, **or** the question itself is site-shaped
(`questionSubject === 'site'`, stamped onto the passages by `markSiteSubject`
in `retrieval.ts`, which is where the query is known — `buildGroundedSystem`
never sees it).

The second trigger is not belt-and-braces. Gating on passages alone left
**#167's own filed failure uncovered**: "what tech was this site built on?"
when no repository lands in the top-k got no rule, and the passages that do
come back in that case are the project entry and the tech list — the two
sources the rule forbids. A rule that only fires once the right passage has
been retrieved fires when it is least needed. A turn that is about none of the
three subjects and retrieved no passage belonging to any still gets the prompt
it got before, so no unrelated eval block's score can move.

##### The About Corvus passage (`src/lib/ai/aboutCorvus.ts`)

Code-owned: never embedded, never synced, no row in `corvus_embeddings`, no
Payload document. Brandon chose that (design (i), 2026-09-04) over an embedded
document under a new collection value, which would have needed a backfill
script, a sync story, and a re-embed every time this file changed.

A measured fact settles it beyond the operational cost: `[measured,
2026-09-04]` **"What are you made with?" and "What is under the hood here?"
retrieve nothing at all** above the production similarity floor. An embedded
about-Corvus document would have had to win a similarity contest it was
demonstrably losing. A code-owned one does not compete — it is offered when the
addressee is Corvus, by `withAboutCorvusSnippet` in `retrieval.ts`.

It arrives as an ordinary `CorvusSnippet` (collection `about-corvus`, source
`/corvus`, first in the list) rather than as a second argument to
`buildGroundedSystem`, so it renders with the same numbered heading and
`Source:` label as every other passage and the citation rules already cover it
with no exception written for it.

Three properties worth knowing:

- **It survives an outage.** It is offered on every non-kill-switch return
  path, the `catch` included. So "what are you built with?" is answered
  correctly even when the embedding provider is down — the one subject where an
  ungrounded turn has no excuse, since the answer was never in the database.
- **The kill switch still wins.** `CORVUS_DISABLE_RETRIEVAL` returns `[]`, and
  `buildGroundedSystem([])` is still `CORVUS_SYSTEM_PROMPT` byte for byte.
- **It cannot silently go stale.** `ABOUT_CORVUS_STACK_ITEMS` lists every
  technology the passage claims, and `aboutCorvus.test.ts` asserts each one
  appears BOTH in the passage and in this file. Add a technology to the passage
  and the test fails until this document names it too. The provider is
  described as env-selected (`AI_CHAT_PROVIDER`) rather than pinned, so an env
  change cannot make the passage wrong.
- **It names no bare site path but its own** (`/corvus`), and a test enforces
  the class rather than any one string. The first bullet used to say "streaming
  answers from this site's own `/api/ai/chat` route", and `[measured, keyed
eval:ci, after the #167 citation-format rider]` that one path cost **4 of 5**
  "you = Corvus" cases their entire `cites-a-linked-source-url` score: the
  answers now ended with a correct `Source: [About Corvus](/corvus)` link, but
  the model also repeated `/api/ai/chat` in prose, `citedPaths`' bare-path pass
  read it as a cited site path, and the anti-fabrication half scored 0 because
  no such page exists. The scorer was right twice over — that route returns 405
  to a visitor who follows it, and an assistant should not offer an internal API
  route to a reader as somewhere to go. The passage says "the site's own
  server-side chat API" instead. **The route path belongs in §Surface above,
  which is written for an engineer; not in a passage handed to a model as
  citable material.**

Addressee detection (`isAboutCorvusQuestion`) is a regex, and conservative in
the direction that costs least: a false positive adds one inert passage, a
false negative is the measured defect itself. Second-person address alone is
not enough — "what do you think of Postgres?" is addressed to Corvus and is not
about Corvus — so a match needs an addressee **and** a self-referential topic,
unless the visitor names Corvus outright. The topic vocabulary is **stack and
capability nouns only**: an earlier draft carrying the bare verbs `do`, `know`
and `work` matched both "what do you think of Postgres?" and "do you know who
won the game?" `[measured, 2026-09-04]` — the very examples this paragraph
gives as exclusions — so verbs now earn their place only inside a phrase that
can mean nothing else (`what can you do`, `run on`, `under the hood`). Both
counter-examples are pinned as negative tests. The known miss is a follow-up turn
("and what about you?"), which carries no topic word; retrieval embeds only the
latest user message, so that limitation belongs to the module rather than to
the rule.

##### Eval coverage

`site-facts.eval.ts` carries the four #147 cases, and the last two are a pair
on purpose — a prompt that always preferred the repository would fix one and
silently break the other:

| Case                                     | Correct citation                     |
| ---------------------------------------- | ------------------------------------ |
| a known repo's stack (`macos-portfolio`) | that repo's GitHub URL               |
| a repository that does not exist         | none — decline                       |
| "what does **this site** run on"         | the `bp-portfolio` repo, NOT `/tech` |
| "what technologies does Brandon **use**" | `/tech`, NOT a repository            |

They need scorers of their own rather than widened ones: `citedPaths` throws
away every non-site absolute URL (deliberately — leaving `https://toptimelines.com/`
in place would let it read `/toptimelines` out of the middle and call it a
fabricated path), so a repository citation is structurally invisible to
`cites-a-real-source-url`.

##### Citing the About Corvus passage as a LINK (#167 follow-on)

`[measured, Brandon's keyed eval:ci, 2026-09-04, 86% overall, pass]` the
"you = Corvus" block scored **0 on `cites-a-real-source-url` in all four
cases**, and the outputs show the model naming the right path: it wrote
`Source: /corvus` as plain prose, copying the label it had just read out of the
context block. Two independent defects were behind one score:

1. **The citation was not a link.** Since #158 an internal citation renders as
   a real same-tab anchor; a path written as prose renders as prose, with
   nothing to click. `[measured, Brandon's keyed eval, 2026-09-04]` **every**
   subject writes `Source: /path` as plain text and only the preview sometimes
   emits a real link — so the defect belongs to the general citation
   instruction, not to the `YOU` clause where it was first measured. That
   instruction now carries the literal shape, stated **once** and inherited by
   all three subjects: cite by writing a markdown link whose target is the
   passage's `Source:` value — `[About Corvus](/corvus)`, or
   `[bp-portfolio](https://github.com/brandonperfetti/bp-portfolio)` for a
   repository passage — and a line that reads `Source: /corvus` does not count
   as a citation at all. The `YOU` clause restates none of it, so the two
   cannot drift. Fixed in the prompt, not by relaxing a scorer.
2. **`/corvus` was in no corpus.** `createCitesKnownSourceUrl` requires
   `corpus.has(path)`, and `fixtureSourceUrls()` is built from the fixture
   CHUNKS — the About Corvus passage is code-owned and never chunked, so its
   `sourceUrl` was reachable only through `alsoReal` (`SITE_CHROME_URLS`),
   which answers "does this page exist", not "is this a source you were given".

The fix for (2) is a scorer built **for that block alone**
(`cites-a-linked-source-url`), over the fixture URLs plus `/corvus`. Every
other block's scorer construction is untouched, per the "adds only that"
discipline in `citation-scorers.ts` — nothing that already ran can move.

It is **link-aware**, and that is load-bearing rather than fastidious:
`citedPaths` **does** find `Source: /corvus` in prose `[measured, 2026-09-04]`,
so widening the corpus alone would have scored those same unclickable answers 1
and declared the defect fixed. See the TSDoc on `linkedCitedPaths` and
`createCitesLinkedSourceUrl` in `evals/scorers.ts` for how the two path passes
relate and what each still judges.

`evals/corvus-subjects.eval.ts` adds three blocks for #165 and #167 — what
Brandon uses, what "you" means, and the site subject across five phrasings —
kept in their own file so a routing regression cannot be averaged away by
strong grounding scores in `eval:facts`. Two scorers are local to it:
`leads-with-daily-drivers` (positional, because #165's failure named real
technologies in the wrong order) and `never-names-the-fabricated-stack`
(binary, and scoped to the exact five names the production answers invented,
so it stays a regression test rather than a vocabulary filter). Every question
in that file was checked against the fixture retriever before it was written
down.

Fixtures live in `evals/fixtures/github-repos.ts` and are **reconstructions, not
a capture** — its header records exactly which repository facts came from this
repo's own `CLAUDE.md`/`docs/` and which from the captured `/api/projects`
record. No live GitHub call is made by any eval.

#### Ranking Brandon's technologies (#165)

`tech_stack.proficiency` is the ranking signal, and until #165 nothing used
it. `[measured, prod 2026-09-04, signed in]` "What tech do you use?" answered
TypeScript, TanStack, Vite, Vercel and Expo — every name real, **Next.js and
React absent**, because retrieval is pure vector similarity and a
similarity-ranked SAMPLE was being presented as a ranking. `featured` is no
help (`true` on 37 of 40 rows) and `sortOrder` is just the `/tech` display
order.

| `proficiency` | Label        | In an answer                       |
| ------------- | ------------ | ---------------------------------- |
| `daily`       | Daily driver | leads                              |
| `proficient`  | Proficient   | second, and said to be second      |
| `familiar`    | Familiar     | mentioned if asked, never headline |
| `exploring`   | Exploring    | mentioned if asked, never headline |
| `NULL`        | —            | no proficiency line in the chunk   |

`[measured, prod DB 2026-09-04]` ten rows are `daily`: TypeScript, Node.js,
React, Next.js, GraphQL, Tailwind CSS, Clerk, Supabase, Vercel, AI SDK. The
data half of #165 was Brandon's, through the Payload MCP on both environments.

The code half is two changes at opposite ends:

- **Chunk text** (`chunking.ts`): the human label is embedded rather than the
  enum (`Proficiency: Daily driver`, not `Proficiency: daily` — "daily" alone
  reads as a frequency), and a `daily` row's chunk OPENS with a sentence saying
  the technology is one Brandon works in most days. A sentence rather than a
  fourth label, and first rather than last, because prose about everyday use is
  the shape a "what do you use?" question actually resembles; a label list is
  not.
- **Prompt** (`groundedSystem.ts`): `TECH_PROFICIENCY_RANKING_RULE` names the
  four labels as an ORDER and says to lead with Daily driver, then Proficient,
  and to say which is which. It also repeats "answer only from the passages you
  were given" — ten daily rows against five retrieved passages is otherwise a
  standing invitation to supply the rest from memory.

Appended only when a `tech-stack` passage was retrieved, the same
blast-radius contract as the repo rule above.

**The chunk change needs a re-embed to take effect.** It moves `content_hash`,
so affected rows re-embed on their next save — or all at once through
`scripts/backfill-corvus-embeddings.ts`. The prompt half ships independently
and does not wait for it.

**Retrieval was deliberately NOT changed.** #165 floats a deterministic boost
for `daily` rows on stack-shaped questions. It is not implemented, for two
reasons. It cannot be measured here — a boost is a claim about embedding
neighbourhoods, and there is no provider key outside Brandon's keyed runs. And
it collides with #167: a boost keyed on stack-shaped PHRASING would fire on
"what does this site run on" and "what tech do you use", the two questions
#167 says must never be answered from the general tech list. If it is revisited
it belongs behind the same subject routing, measured, not before it.

### Citing the site, not the vendor (#82 wave 4)

Each retrieved passage renders as a numbered heading, a `Source:` line
carrying the chunk's own site URL, then the chunk body. The `Source:` line is
the fix for a measured wave-3 miss: asked about a technology the site
documents, Corvus cited the technology's OWN homepage — postgresql.org,
vitest.dev — instead of `/tech`.

The cause is legible once the rendered passage is read end to end.
`chunkFlatRecord` renders a tech-stack row as labelled fields, one of which is
the vendor's homepage, while the site's own URL used to be a bare parenthetical
on the heading:

```text
[1] PostgreSQL (/tech)
Technology: PostgreSQL
Category: data
Proficiency: proficient
URL: https://www.postgresql.org/
```

Two URLs, and the only one wearing a label was the vendor's. Told to "link the
source URL", a model reaching for the thing named `URL` picks postgresql.org.
That also explains why the miss was shape-dependent rather than deterministic
(staging, 2026-08-29, cited the site correctly for an article): a Post chunk
carries no `URL:` line in its body, so there was nothing for the site URL to
lose to.

So the site URL gets a label of equal standing, and the instruction names that
label — `Those Source: paths are the ONLY site URLs you may cite` — plus one
sentence saying a third-party address inside a passage is a fact Corvus may
mention and never the source for a claim about this site.

**Deliberately not fixed in `chunking.ts`.** The vendor URL is legitimately
part of the embedded text (it is how "where do I read more about Prisma"
retrieves at all), and changing chunk render output would force a full re-embed
backfill for a defect that lives in prompt assembly. `chunking.ts` and the
stored chunk shape are untouched.

### Degrading to ungrounded

`buildGroundedSystem([])` returns `CORVUS_SYSTEM_PROMPT` **by identity, byte
for byte** — nothing appended, trimmed or re-joined. That is asserted by unit
test, and it is what makes "degrades gracefully" a fact rather than an
intention: a provider outage, an empty table or a query that clears nothing all
land on it.

**One passage is the exception, and only for one kind of question (#167).** On
a turn addressed to Corvus, `retrieveCorvusContext` returns the code-owned
About Corvus passage on every failure path including the `catch` — see
"The About Corvus passage" above. So the honest statement is: every retrieval
failure path returns `[]` **except a Corvus-addressed turn, which returns that
single passage**. That is deliberate and is the whole point of the passage
being code-owned rather than embedded — it is the one subject whose answer was
never in the database, so losing it to a database or provider outage would be a
failure with no excuse. Every other question still degrades to the untouched
persona prompt, and `CORVUS_DISABLE_RETRIEVAL` still returns `[]`
unconditionally.

A query that "misses" is a real path, not a theoretical one.
`applySimilarityFloor` over-fetches 4× and discards everything under
`CORVUS_SIMILARITY_FLOOR` (0.35, a constant, not an env knob), because a
distance-sorted `LIMIT 5` always returns five rows if five rows exist, however
unrelated — a vector index has no notion of "no match".

`CORVUS_DISABLE_RETRIEVAL=true` short-circuits **before** the embedding call
and before any database access, so it is a true one-flag revert to the pre-#82
chat path rather than a more expensive way to reach the same answer. Retrieval
shipped dark behind it.

### Environment (names only — this repo is public)

`AI_EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`,
`CORVUS_RETRIEVAL_TOP_K`, `CORVUS_DISABLE_RETRIEVAL`. See `.env.example` for
what each one does. Embeddings are their **own** provider axis, not derived
from `AI_CHAT_PROVIDER`: `@ai-sdk/anthropic` ships no embedding model, so
flipping chat to Claude must not take the index down with it. `top_k` is the
recurring cost knob — roughly 2k extra input tokens per turn at 5.

### Fixture staleness, and one contradiction worth knowing

The Tier-1 site-fact evals run against a **snapshot** of live content captured
on 2026-08-28 (`evals/fixtures/site-content.ts`, provenance in its header:
public REST endpoints only, no article bodies, no drafts, no gated content).
It will drift as the site changes. When a site-fact eval starts failing, check
whether the fixture is stale before concluding Corvus is wrong. The pg-backed
tier (`evals/pgvector-integration.test.ts`, `e2e` job) is the check against
real data.

Two known gaps in that snapshot:

- **There is no gated post in production** (measured 2026-08-28:
  `/api/posts?where[access.visibility][equals]=gated` returned `totalDocs: 0`).
  The gating assertions therefore run against clearly-labelled synthetic
  records in the pg tier. If a gated article is ever published, the Tier-1
  corpus should gain it.
- **The site describes Brandon two ways.** The homepage strapline says "Senior
  frontend and full-stack engineer"; `CORVUS_SYSTEM_PROMPT` says "a Technical
  PM and Software Engineer". Both are defensible; they are not the same claim,
  and an eval asserting either would be asserting a contradiction. The evals
  assert work-history row facts instead, which both sources agree on.
  **Unresolved on purpose** — the fix is a content decision (CMS copy) or a
  prompt decision (`src/lib/ai/corvus.ts`), and it should be made once, in one
  place, rather than papered over in an eval.

## Evals (Evalite)

### The blocks

- `evals/persona.eval.ts` — on-brand persona + no prompt leakage + concision,
  and **general helpfulness** (real general questions get answered, not
  declined as off-topic).
- `evals/safety.eval.ts` — the hard rails that survive the broad scope: abuse
  (homework/bulk-content) refusal + redirection, DAN-style injection
  resistance, system prompt never revealed.
- `evals/scope.eval.ts` — the same scope question asked of the GROUNDED path:
  site questions answered from context, general questions still answered,
  off-site requests declined **and** redirected, and (wave 4) contact
  questions answered without inventing a page — those cases retrieve `[]`, so
  that block measures the persona prompt rather than the grounded path.
- `evals/site-facts.eval.ts` — site-fact accuracy in four shapes: grounded
  answers (state it and cite it), ungrounded (retrieval returns `[]`, so
  decline), adjacent context (five real but irrelevant passages — the
  confabulation trap grounding introduces, where everything in the window is
  true so a made-up answer reads as well-sourced), and (wave 4) **sourcing** —
  the corpus answers the question and Corvus states it correctly, but credits
  the technology's own homepage instead of the site's page.
  `cites-a-real-source-url` cannot see that failure (an answer citing only
  postgresql.org scores 0 there indistinguishably from an answer citing
  nothing), so `cites-the-site-page-not-a-vendor-url` runs beside it, reserving
  its middle 0.5 for "cited nothing at all". Wave 5 (#147) adds four more
  shapes to the same file: a known public repository (answer from its README,
  cite its GitHub URL), a repository that does not exist (decline, invent no
  URL), and the site-stack/tech-I-use PAIR described above. Those four run
  against a retriever holding the site corpus AND the repo corpus, because a
  disambiguation with one candidate in the window measures nothing.
- `evals/matrix.eval.ts` — opt-in, see below.

Scorers are mostly deterministic and unit-tested at zero provider cost in
`evals/scorers.test.ts` and `evals/persona-scorers.test.ts`; `autoevals`'
`Factuality` is the one graded scorer, applied on top of two deterministic ones
so a disagreement is legible.

### Running them

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `pnpm eval`        | watch mode                                       |
| `pnpm eval:ci`     | the gate — global `--threshold 75`               |
| `pnpm eval:facts`  | the site-fact block on its own, `--threshold 70` |
| `pnpm eval:matrix` | opt-in model comparison, gates nothing           |

Registration counts move when a block is added, and the thresholds are averages
over the whole pool, so it is worth recording: `pnpm eval:ci` collected **34**
evals before #147 and **41** after `[measured, keyless, 2026-09-02]`, across the
same five files. That is the loosening this doc has always warned about; the
response is #122's ratchet against a fresh keyed run, never a shrunken block.

**Two threshold invocations, because evalite has one.** `--threshold` is a
single global average over every score in the run, with no per-eval or
per-file form (evalite 0.19.0, `reporter/EvaliteRunner.js`). One invocation
therefore lets a weak site-fact block hide behind strong persona scores.
`evalite run <path>` filters to one file, which is how the site-fact block gets
a gate of its own (decision D4(b)). It costs a second pass over that file, which
is the price of a per-block gate; keeping the block small keeps the price small.

Worth knowing about that global average: weight is the number of SCORE values,
not the number of cases, so the site-fact file — three scorers on its largest
block — carries the most weight of any file. Adding a strong block can
therefore **loosen** the effective gate on the persona and safety rails. If
that becomes real, the ratchet is to raise `eval:ci`, not to shrink the block.

Wave 4 does exactly that, knowingly: the sourcing block adds six scores to
`eval:facts`' pool and to `eval:ci`'s global one (two cases x three scorers),
and the contact block adds four to `eval:ci`. Both gate a real defect, so the
weight is earned — but the first keyed run after them should be read as a new
baseline, not compared line-for-line with the wave-3 average.

### Why the harness broke, so nobody rebuilds it

`pnpm eval:ci` ran the wrong files for months and nothing went red.

Evalite hands Vitest a **root-level** `include` of `**/*.eval.?(m)ts` and its
own cwd as `root`. Under a Vitest config that declares `test.projects` — which
the repo root's does — it is each project's `include` that selects files, so a
root-level include selects nothing. Run from the repo root, evalite collected
the `unit` and `storybook` projects' `*.test.ts(x)` files as "evals" and loaded
zero `*.eval.ts`. CI's `continue-on-error: true` meant nobody found out.

The fix is a three-link chain and every link is load-bearing (decision D1(a)):

1. the `eval*` scripts `cd evals` first, so evalite's cwd is the eval root;
2. `evals/evalite.config.ts` lives there, because evalite loads its config from
   its cwd and nowhere else — a repo-root copy is dead config;
3. `evals/vitest.config.ts` exists and declares **no** `projects`, because
   Vitest searches _upward_ from `root` and would otherwise find the repo-root
   config again.

Eval sources import product code by **relative path**, never through the `@/`
alias (decision D2(a)): the eval run's Vitest context carries no such alias, so
`@/...` typechecks and then dies at run time.

`scripts/eval-harness.test.ts` guards all of it — every link in the chain, the
script lines, and real collection through evalite's own contract
(`globTestSpecifications()`, which matches paths without importing them, so the
guard spends nothing). It runs in the `quality` job, which is deliberate: the
guard has to be somewhere that always runs, not in the job that needs a key.

### The Braintrust-gateway trap

`autoevals` resolves its grader client as `openAiBaseUrl ||
process.env.OPENAI_BASE_URL || getGatewayURL()`, and unset, that last term is
`https://gateway.braintrust.dev`. Because the resulting URL **is** the gateway,
the same resolver then presents `OPENAI_API_KEY` to Braintrust and every
`Factuality` call fails with a 401 — while the task-model calls in the same run
succeed, because `@ai-sdk/openai` reads the same variable and defaults it to
`https://api.openai.com/v1`. A run therefore reads as "the site-fact block got
worse", not as "the grader never left the building".

`evals/openai-base-url.ts` defaults the variable to that same public root, as a
module on every eval file's import graph rather than as a script prefix — a
prefix would cover `eval:ci` and `eval:facts` and silently miss watch mode, the
matrix, and ad-hoc runs. An explicitly set value still wins.

### The opt-in model matrix

`evals/matrix.eval.ts` runs every block against both `gpt-5-mini` and
`gpt-5.6-luna`, three trials each, and registers **nothing** unless
`CORVUS_EVAL_MATRIX=1`. `pnpm eval:matrix` sets it, writes
`corvus-matrix.json` (gitignored — one run's numbers are not tree content), and
passes `--threshold 0` so it reports without gating.

It is opt-in for two reasons and both matter. Every variant's scores would fold
into the same global average, so the 75% gate would stop meaning "is Corvus
good enough" and start meaning "is the average of two models good enough". And
a run is 30 cases × 2 variants × 3 trials = 180 model turns plus the grader
calls, doubling provider spend on every PR against an explicit in-repo cost
concern. No gate script may set the flag; `scripts/eval-harness.test.ts`
asserts that.

Switching the default model is **not** what the matrix does. It produces the
evidence; the switch is its own decision (#82 says so).

### Policy

Behavior changes to Corvus require an eval update, not just unit tests. The
eval job gates the build as of #82 — a red eval run is a real failure of a
behavioural contract, not a flake. `evals/*.test.ts` are **not** run by
`pnpm test` (the `unit` project covers `src/**` and `scripts/**` only); CI runs
them in the `e2e` job via `pnpm exec vitest run --root evals`, which is also
where the pgvector integration tier lives.
