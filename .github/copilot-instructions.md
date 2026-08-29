# BP Portfolio v4 — AI Agent Instructions

Next.js 16 App Router portfolio with **Payload CMS** (Postgres/Drizzle) as the
single content source, Clerk auth + server-side gating, Corvus AI chat
(Vercel AI SDK), and a shaders.com animated hero. Notion is a **planning
surface only** — it is not a CMS and has no runtime integration.

## Essentials

- Package manager: **pnpm only** (`packageManager` pin + `only-allow`;
  lockfile is `pnpm-lock.yaml`). Never use npm/yarn.
- Primary commands: `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm test` ·
  `pnpm test:e2e` · `pnpm storybook` · `pnpm payload` · `pnpm migrate`
- Runtime baseline: Next.js 16 (Turbopack), React 19, TypeScript 5,
  Payload 3.x (all `@payloadcms/*` packages version-locked together),
  Tailwind v4 (CSS-first), Node 22+.

## Invariants (do not regress)

- **URLs:** `/articles/[slug]` shape and existing slugs are preserved from v3.
- **Payload is the only CMS.** Content flows Payload → repo modules
  (`src/lib/cms/*Repo.ts`) → RSC pages. Never reintroduce Notion runtime code.
- **Corvus system prompt is server-enforced** (`src/lib/ai/corvus.ts`); client
  system messages are never trusted. Rate limiting via Upstash Redis.
- **Gating is server-side** (`src/access/canAccess.ts` + `getViewer()`); UI
  components like `<Protect>` are conveniences, never the enforcement point.
- **Reduced motion is honored by every animated surface** — static, functional
  DOM when `prefers-reduced-motion` is set.
- **Light/dark parity** is an acceptance criterion; audit both themes.
- Generated artifacts (`src/payload-types.ts`,
  `src/app/(payload)/admin/importMap.js`) are committed and CI-gated — run
  `pnpm generate:types` / `pnpm generate:importmap` after schema/plugin
  changes.
- **A Payload schema change requires a committed migration in the same
  change.** Any change to a collection, global, or field must include a
  migration created with `pnpm migrate:create` (CI regenerates it and fails the
  PR if one is missing). For a new table, add the RLS follow-up
  (`ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;` for the table and any
  paired `_v` / `_rels` table) in that **same** migration — `docs/PAYLOAD.md`.
  Call the migration out explicitly in the change summary.
- **Cache revalidation is read-your-writes:** the revalidation hooks call
  `revalidateTag(tag, { expire: 0 })` — never `'max'`, which under
  cacheComponents is stale-while-revalidate with a one-year stale window and
  silently breaks the admin-edits-live-in-seconds invariant (#118).
- **The Corvus eval gates are live in CI** (`pnpm eval:ci` and
  `pnpm eval:facts`, thresholds that fail the build). Fix the behavior or the
  harness — never lower a floor to get green. Empty/whitespace model outputs
  score 0 by design (`evals/empty-output.ts`); eval turns run at production's
  completion-token budget (drift-guarded by test).
- **Embeddings are their own provider axis** (`AI_EMBEDDING_PROVIDER`,
  OpenAI-only): switching the chat provider must never touch the pgvector
  index, and the vector width (1536) is baked into DDL — a model with a
  different width needs a migration, not an env change.
- Dependency majors are pinned; `@payloadcms/*` + `payload` upgrade as one set.
- The rich-text editor for Posts must keep every node type the migration
  emits registered (lists, blockquote, upload) — removing a feature breaks
  every migrated article (Lexical error #17).

## Conventions

- Conventional commits; small, focused commits; draft PR per phase.
- TSDoc on every exported function/component/collection (enforced by
  `eslint-plugin-tsdoc`); document _why_, not _what_.
- New UI starts from shadcn/ui primitives (`src/components/ui`) and gets a
  Storybook story; serious a11y violations fail the story.
- Tests accompany behavior changes: Vitest unit/component, Playwright e2e,
  Evalite for Corvus behavior.

## Progressive disclosure (read the doc that matches the task)

- Architecture and app map: `docs/ARCHITECTURE.md`
- Payload CMS (collections, blocks, plugins, migrations, MCP): `docs/PAYLOAD.md`
- Feature inventory and behavior: `docs/FEATURES.md`
- Navigation and route responsibilities: `docs/NAVIGATION.md`
- State and data flow: `docs/STATE.md`
- Styling and component conventions: `docs/STYLING.md`
- Design system (shadcn, shader hero, motion, Storybook): `docs/DESIGN.md`
- AI (Corvus, guardrails, retrieval grounding, evals, providers): `docs/AI.md`
- Analytics and consent (c15t, GA4 Consent Mode v2, geo-gating): `docs/ANALYTICS.md`
- Auth, gating, and email capture (Clerk): `docs/AUTH.md`
- Content workflow (Notion planning → Payload publishing): `docs/CONTENT_WORKFLOW.md`
- Content voice, article types, and revision gates: `docs/CONTENT_STYLE.md`
- SEO and indexing routes: `docs/SEO.md`
- Dependencies and why they exist: `docs/DEPENDENCIES.md`
- Workflow and contribution rules: `docs/WORKFLOW.md`
- Accessibility expectations: `docs/ACCESSIBILITY.md`
- Testing strategy: `docs/TESTING.md`
- Ongoing upkeep tasks: `docs/MAINTENANCE.md`
- Documentation standards: `docs/DOCUMENTATION.md`
