# AI (Corvus)

## Surface

`/corvus` renders `CorvusChat` (Vercel AI SDK `useChat`) streaming from
`POST /api/ai/chat`. Markdown rendering via streamdown/react-markdown.

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

| Column                                | Why it is there                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `embedding vector(1536)`              | `text-embedding-3-small`'s native width (decision D6(a))                                                      |
| `content`, `content_hash`             | the chunk and the sha256 that makes refresh cheap                                                             |
| `collection`, `doc_id`, `chunk_index` | `UNIQUE` together — the upsert key the hooks target                                                           |
| `title`, `source_url`                 | what a citation is rendered from                                                                              |
| `visibility`                          | a copy of Posts' `access.visibility`, so retrieval can filter without joining back into Payload               |
| `published_at`                        | so scheduled-future posts can be excluded                                                                     |
| `model`                               | which embedding model wrote the row, so a model change is detectable instead of silently mixing vector spaces |

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
`work-history`. Pages are **not** embedded (decision D8(b)) — mostly layout
chrome, and retrieval noise for little factual value. Adding them later needs
no schema change.

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

### Degrading to ungrounded

`buildGroundedSystem([])` returns `CORVUS_SYSTEM_PROMPT` **by identity, byte
for byte** — nothing appended, trimmed or re-joined. That is asserted by unit
test, and it is what makes "degrades gracefully" a fact rather than an
intention, because every retrieval failure path returns `[]`: a provider
outage, an empty table, a query that clears nothing.

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
  off-site requests declined **and** redirected.
- `evals/site-facts.eval.ts` — site-fact accuracy in three shapes: grounded
  answers (state it and cite it), ungrounded (retrieval returns `[]`, so
  decline), and adjacent context (five real but irrelevant passages — the
  confabulation trap grounding introduces, where everything in the window is
  true so a made-up answer reads as well-sourced).
- `evals/matrix.eval.ts` — opt-in, see below.

Scorers are mostly deterministic and unit-tested at zero provider cost in
`evals/scorers.test.ts` and `evals/persona-scorers.test.ts`; `autoevals`'
`Factuality` is the one graded scorer, applied on top of two deterministic ones
so a disagreement is legible.

### Running them

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `pnpm eval`        | watch mode                                       |
| `pnpm eval:ci`     | the gate — global `--threshold 80`               |
| `pnpm eval:facts`  | the site-fact block on its own, `--threshold 75` |
| `pnpm eval:matrix` | opt-in model comparison, gates nothing           |

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
into the same global average, so the 80% gate would stop meaning "is Corvus
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
