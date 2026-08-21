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

## Evals (Evalite)

- `evals/persona.eval.ts` — on-brand persona + no prompt leakage + concision,
  and **general helpfulness** (real general questions get answered, not
  declined as off-topic).
- `evals/safety.eval.ts` — the hard rails that survive the broad scope: abuse
  (homework/bulk-content) refusal + redirection, DAN-style injection
  resistance, system prompt never revealed.
- `pnpm eval` (watch) / `pnpm eval:ci` (threshold 80). CI job runs only when
  a provider key secret exists. Behavior changes to Corvus require an eval
  update, not just unit tests.
