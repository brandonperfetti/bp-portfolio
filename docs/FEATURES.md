# Features

## Articles (`/articles`, `/articles/[slug]`)

- Payload Posts → `articlesRepo` → `ArticleLayout` + `ArticleBody`.
- Explorer: debounced search (`q`), topic filter (`topic`), URL-synced, `/`
  focuses search. Cards animate via shared motion tokens.
- Bodies are Lexical JSON converted by `lexicalToBlocks`; code blocks render
  through `CodeSnippet` (Prism), images through `next/image`.
- Gated posts (`access.visibility = 'gated'`) serve teaser-only to anonymous
  visitors — enforcement in the RSC via `canAccess`, not the client.
- Per-article "Use with AI" menu + JSON-LD + canonical URLs.

## Hermes chat (`/hermes`)

- Streaming chat over `/api/ai/chat` (Vercel AI SDK). Server-enforced persona
  prompt, Zod-validated payloads, Upstash rate limits + daily quota.
- Empty submit refocuses the composer (retained v3 nicety, e2e-covered).
- Evalite suites (`evals/`) cover persona, refusal, injection resistance.

## Command palette (⌘K / Ctrl+K)

- `src/components/search/CommandPalette.tsx` (cmdk): BM25-ranked article
  search over `/api/search` (plugin-search index, short-TTL cached),
  navigation, theme switch, copy-link, Ask Hermes.

## Tech-stack visualization (`/tech`, shared with `/uses`)

- `TechExplorer` + `TechCard`: category chips, proficiency chips, live GitHub
  activity badges (owner-wide scan, 6h cache), expandable scan evidence,
  A–Z / Most-active sort — all URL-synced (`q`, `category`, `sort`).
- Signals: `src/lib/integrations/github/techSignals.ts` (scan, ported from
  v3) + `src/lib/tech/githubSignals.ts` (cached index + name matching).
  Config: `GITHUB_OWNER`, `GITHUB_TOKEN`, `GITHUB_TECH_*` knobs. Unconfigured
  → badge-less render, never an error.

## Shader hero (home)

- shaders.com preset behind server-rendered hero text. Presets registry
  (`src/components/heros/presets.ts`): Northern Lights 2 (default dark),
  Drifting Lights 8, Static Noise 4 (light mode). Reduced-motion/no-WebGPU →
  static gradient; offscreen → canvas unmounts.

## Contact & newsletter

- `/api/contact` POST delivers contact-form email via Resend (migrated from
  SendGrid + renamed from `/api/sendgrid` 2026-08-10). Clerk webhook
  (`/api/clerk/webhook`, svix verified) captures sign-up emails as Resend
  contacts.

## SEO surfaces

`sitemap.ts`, `robots.ts`, `feed.xml`, `llms.txt`, `llms-full.txt`, JSON-LD.
See `docs/SEO.md`.
