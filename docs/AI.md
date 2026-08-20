# AI (Hermes)

## Surface

`/hermes` renders `HermesChat` (Vercel AI SDK `useChat`) streaming from
`POST /api/ai/chat`. Markdown rendering via streamdown/react-markdown.

## Server enforcement (`src/lib/ai/hermes.ts` + route)

- `HERMES_SYSTEM_PROMPT` is applied **server-side on every request**; client
  system messages are ignored. Never trust or forward client roles other
  than user/assistant history.
- Request bodies are Zod-validated; oversize/malformed input is rejected.
- Provider/model are env-selected: `AI_CHAT_PROVIDER` (`openai|anthropic`) +
  `AI_CHAT_MODEL`; `AI_MAX_COMPLETION_TOKENS` caps output.

## Guardrails (`src/lib/security/`)

- `limiter.ts`: Upstash Redis rate limits — per-minute and daily quota keyed
  by IP. Without Upstash env, dev fails open (never ship that state to
  production).
- `guardrails.ts`: shared quota/limit application; kill switches
  `HERMES_DISABLE_CHAT` / `HERMES_DISABLE_IMAGE`.
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

## Evals (Evalite)

- `evals/persona.eval.ts` — on-brand persona, no prompt leakage, concision.
- `evals/safety.eval.ts` — out-of-scope refusal + redirection, DAN-style
  injection resistance, system prompt never revealed.
- `pnpm eval` (watch) / `pnpm eval:ci` (threshold 80). CI job runs only when
  a provider key secret exists. Behavior changes to Hermes require an eval
  update, not just unit tests.
