# Maintenance

## Recurring

- **Payload upgrades**: bump `payload` + every `@payloadcms/*` to the same
  version in one commit; run `pnpm generate:types` + `pnpm generate:importmap`;
  run migrations locally; smoke the admin (editor renders a migrated post,
  SEO tab populated) before pushing.
- **Next/React upgrades**: majors are deliberate events; check Payload's
  supported Next range first (Payload pins minimums).
- **GitHub tech-signal token**: fine-grained PAT (Contents: read) expires on
  the schedule chosen at creation — rotate in Vercel env
  (`GITHUB_TOKEN`). Scan knobs: `GITHUB_TECH_*` in `.env.example`.
- **Supabase/Blob**: staging DB is Supabase project `bp-portfolio`
  (`wgzvcjhaltevthnxnack`, us-east-1, Sans Faux org — co-located with the
  iad1 functions; migrated from Neon 2026-08-10); production gets its own
  project at promotion. App traffic uses the Supavisor TRANSACTION-mode
  pooler string (port 6543); pg_dump/restore uses SESSION mode (5432).
  Free-tier projects pause after ~1 week without traffic — if staging
  500s after a quiet stretch, unpause in the Supabase dashboard (Pro
  removes pausing; revisit at promotion). Supabase's auto-generated REST
  Data API is UNUSED by this stack (Payload speaks Postgres directly) —
  keep it DISABLED in project Settings → Data API so the 136 RLS-less
  Drizzle tables are never network-exposed; re-check this on the
  production project at promotion. Blob store `bp-portfolio-media`
  is public-read.
- **Email deliverability (Resend domain auth)**: brandonperfetti.com is
  verified in Resend (us-east-1 — co-located with the iad1 functions,
  same logic as Upstash) via DNS records at Hover: an MX + SPF TXT on the
  `send` return-path subdomain and a DKIM TXT (`resend._domainkey`).
  Exact values live in Resend → Domains. Lesson carried over from the
  SendGrid era (fixed 2026-08-10 after a DNS migration silently dropped
  the auth CNAMEs and every email junked): any future DNS/registrar move
  must carry these records, then re-verify in the Resend dashboard —
  and never trust a dashboard's cached "verified" badge over `dig`.
- **Upstash Redis (rate limiting)**: `bp-portfolio-limiter` in AWS
  us-east-1 — deliberately co-located with the Vercel functions (iad1,
  measured via x-vercel-id) and the Supabase DB, NOT near the maintainer.
  Eviction stays OFF (eviction would silently reset limit counters);
  no read regions (eventually-consistent reads are wrong for limits).
  Holds transient counters only. Env: `UPSTASH_REDIS_REST_URL/TOKEN`,
  Preview + staging scoped; production values at promotion.
- **Storybook**: keep stories in sync with component changes (CI builds
  storybook, so breakage fails fast).
- **TypeScript 7**: blocked (attempted 2026-08 on Next 16.3). The 10x
  native `tsc` works (`pnpm add -D typescript@^7`; tsconfig is already
  `baseUrl`-free for it), but typescript-eslint's latest stable (8.66,
  peer `typescript <6.1`) hard-errors "does not support TS 7.0" and
  `next build` requires TS7 to be the workspace `typescript` dep — no
  clean dual-version path. Revisit when typescript-eslint ships TS7
  support, then it's a one-line bump.

## Watchpoints

- **List-surface cache staleness (open, measured 2026-08-10)**: on Vercel,
  `revalidateTag('posts', 'max')` and page-scope `revalidatePath('/articles')`
  / `revalidatePath('/api/search')` from the Posts hooks fire (runtime logs
  confirm) but measurably do **not** refresh the `unstable_cache`-backed list
  surfaces — `/articles` (via `getPublishedPosts`) and `/api/search` served
  identical stale payloads minutes after a publish and a delete, and search
  staleness even survived a fresh deploy (Vercel Data Cache persists across
  deployments). Empirical matrix: **detail pages** (`getPostBySlug`,
  uncached) are fresh instantly; **`/articles`** converges within its
  `x-nextjs-stale-time` of 300s; **`/api/search`** converges within its TTL
  (now 300s — lowered from 1800 in `src/lib/cms/cache.ts` as the bounded
  mitigation). The only purge rigorously proven live at runtime is
  `revalidatePath('/', 'layout')` (globals hooks — Identity/CV flip).
  Security impact: none — stale search entries carry teaser/excerpt text
  only (gated bodies never enter the index, review finding B1). Full
  diagnosis deferred to a dedicated session with fresh context; candidate
  suspects are the two-arg `revalidateTag(tag, 'max')` soft/SWR semantics
  vs. `unstable_cache` and TTL'd Data Cache entries outliving purges. The
  planned `cacheComponents` migration (post-merge branch) retires this
  caching model entirely and supersedes this watchpoint.
- **Live Preview pane blank on iOS Safari (open, observed 2026-08-10)**:
  the admin Live Preview iframe renders white on iPhone Safari while the
  SAME deployment's pane works in desktop Chrome, and the external
  Preview button (new tab) renders drafts correctly on the phone. Server
  side is proven healthy: `/next/preview` 307s (secret + auth pass) and
  the runtime logs show the iframe's follow-up request never arrives —
  the failure is client-side redirect/iframe handling in iOS Safari.
  Not the DB (draft version-table queries verified on Supabase), not
  frame headers (none shipped). Editorial impact low: desktop pane +
  mobile external preview both work. To diagnose properly: enable
  iPhone Safari Web Inspector and watch the pane's network from desktop
  Safari's Develop menu. May be mooted by the cacheComponents branch's
  preview rework.
- Stale generated artifacts are the classic admin breakage (empty SEO tab /
  dead editor) — CI gates both, but check first when admin misbehaves.
- Lexical error #17 on articles ⇒ an editor feature for a migrated node type
  was removed (docs/PAYLOAD.md).
- Husky pre-push failing on `.next` types ⇒ remove `.next`, retry.
- pnpm "ignored builds" errors ⇒ `allowBuilds` in `pnpm-workspace.yaml`.

## Promotion checklist (v4 → production, when signed off)

1. Merge `rebuild/v4` per branch plan; retarget staging env to `develop`.
2. Create production Supabase project (Sans Faux org, us-east-1; decide
   free vs Pro — free pauses after ~1 week idle) + Blob token; set all
   `.env.example` production
   vars in Vercel (Payload, Clerk, AI, Upstash, Resend, GitHub signals).
   Generate FRESH production values (`openssl rand -hex 32`) for
   `CMS_REVALIDATE_SECRET` and `PREVIEW_SECRET` — never reuse the
   staging values, and remember both are scoped per-environment (a var
   unscoped from an environment silently 401s/403s its route — the
   staging preview incident of 2026-08-10).
3. Delete legacy v3 vars: all `NOTION_*`, Cloudinary vars, `CRON_SECRET`,
   Notion webhook secrets — only at promotion, not before.
4. Run migration against production DB; verify `/articles/[slug]` URLs and
   redirects; publish pass in admin.
5. Point brandonperfetti.com at the v4 production deployment; keep the v3
   rollback path documented until stable.
