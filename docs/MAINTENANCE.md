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
- **Neon/Blob**: staging DB is the Neon store; production gets its own at
  promotion. Blob store `bp-portfolio-media` is public-read.
- **Email deliverability (SendGrid domain auth)**: rides on three CNAMEs
  in Hover DNS — `em3842`, `s1._domainkey`, `s2._domainkey` →
  `*.u32673427.wl178.sendgrid.net`. These went missing in a past DNS
  migration and every contact email junked (unaligned DKIM/DMARC) while
  SendGrid's dashboard showed STALE "Verified" badges — the badges only
  update when Verify is clicked. Restored + re-verified 2026-08-10. Any
  future DNS/registrar move must carry these three records, then
  re-click Verify in SendGrid Sender Authentication.
- **Upstash Redis (rate limiting)**: `bp-portfolio-limiter` in AWS
  us-east-1 — deliberately co-located with the Vercel functions (iad1,
  measured via x-vercel-id) and the Neon DB, NOT near the maintainer.
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
- Stale generated artifacts are the classic admin breakage (empty SEO tab /
  dead editor) — CI gates both, but check first when admin misbehaves.
- Lexical error #17 on articles ⇒ an editor feature for a migrated node type
  was removed (docs/PAYLOAD.md).
- Husky pre-push failing on `.next` types ⇒ remove `.next`, retry.
- pnpm "ignored builds" errors ⇒ `allowBuilds` in `pnpm-workspace.yaml`.

## Promotion checklist (v4 → production, when signed off)

1. Merge `rebuild/v4` per branch plan; retarget staging env to `develop`.
2. Create production Neon DB + Blob token; set all `.env.example` production
   vars in Vercel (Payload, Clerk, AI, Upstash, SendGrid, GitHub signals).
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
