# Maintenance

## Recurring

- **Payload upgrades**: bump `payload` + every `@payloadcms/*` to the same
  version in one commit; run `pnpm generate:types` + `pnpm generate:importmap`;
  run migrations locally; smoke the admin (editor renders a migrated post,
  SEO tab populated) before pushing.
- **Next/React upgrades**: majors are deliberate events; check Payload's
  supported Next range first (Payload pins minimums).
- **Node version policy (#69)**: `engines` stays broad (`>=22 <25`) so a
  current Node never trips the unsupported-engine warning; `.nvmrc` pins 24
  for local dev; CI runs Node 24 (part-2 Batch 0). Vercel's project-level
  Node setting is overridden by `engines` — keep it on 24.x anyway so the
  build cache stays warm. Bump all three together at the next Node major.
- **GitHub tech-signal token**: fine-grained PAT (Contents: read) expires on
  the schedule chosen at creation — rotate in Vercel env
  (`GITHUB_TOKEN`). Scan knobs: `GITHUB_TECH_*` in `.env.example`.
- **Corvus GitHub repo sync (weekly, #147)**:
  `.github/workflows/corvus-github-sync.yml` indexes every public
  `brandonperfetti` repo into `corvus_embeddings` under `collection:
'github-repos'` at 12:23 UTC on Sunday, and PRUNES repositories that have
  gone private or been deleted — not pruning is the failure mode on this
  collection, so a run that skips the sweep logs a warning worth reading.
  Secrets: `SUPABASE_DB_URL_PROD` + `OPENAI_API_KEY` (both already exist for
  `corvus-backfill.yml`), plus the OPTIONAL `CORVUS_GITHUB_SYNC_TOKEN` — a
  fine-grained PAT with Public Repositories read, set ONLY if a run reports
  403/404 on public repos; the workflow falls back to its own automatic
  `GITHUB_TOKEN` otherwise. Distinct from the tech-signal PAT above: different
  job, different lifecycle. Run by hand with
  `pnpm corvus:sync-github` (add `-- --dry-run` to see what a run would index
  without writing). Details in `docs/AI.md`.
- **Supabase/Blob**: staging DB is Supabase project `bp-portfolio`
  (`wgzvcjhaltevthnxnack`, us-east-1, Sans Faux org — co-located with the
  iad1 functions; migrated from Neon 2026-08-10); production gets its own
  project at promotion. App traffic uses the Supavisor TRANSACTION-mode
  pooler string (port 6543); pg_dump/restore uses SESSION mode (5432).
  Free-tier projects pause after ~1 week without traffic — if staging
  500s after a quiet stretch, unpause in the Supabase dashboard (Pro
  removes pausing; revisit at promotion). Supabase's auto-generated REST
  Data API is UNUSED by this stack (Payload speaks Postgres directly).
  Current arrangement (decided 2026-08-12, superseding the 2026-08-11
  keep-it-disabled note): the Data API is enabled but its ONLY exposed
  schema is `api` — a deliberately empty schema created for this purpose
  (see its COMMENT in the DB). This gives PostgREST a valid schema to
  load, which silences the former log noise (`schema
"pg_pgrst_no_exposed_schemas" does not exist` every ~30s + a bogus
  ~54% "database error rate" in Observability), while the `public` tables
  (Drizzle-managed) remain unexposed — and, as of #72, additionally locked
  with default-deny RLS plus revoked `anon`/`authenticated` grants (see the
  new-table RLS convention in `docs/PAYLOAD.md`), so even adding `public` to
  the exposed schemas could no longer leak rows on its own. Do NOT add
  `public` (or
  any schema containing real tables) to the exposed-schemas list, and do
  NOT create tables in `api`; re-check both on the production project at
  promotion.
  Blob store `bp-portfolio-media` is public-read.
- **Sentry (#73)**: env vars `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` /
  `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (+ optional
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`) live in Vercel's
  per-environment settings; the Sentry Vercel integration populates the
  auth-token/org/project automatically once connected, leaving only
  `NEXT_PUBLIC_SENTRY_DSN` to set by hand per environment. No DSN → Sentry is
  fully inert (no import, no init). `SENTRY_AUTH_TOKEN` is a build-only secret
  (source-map upload); rotate it like Resend/Blob if exposed.
- **Database backups (nightly, encrypted)**: Supabase free tier has NO
  automated backups, and the DB is the canonical copy of all content —
  `.github/workflows/db-backup.yml` runs a nightly `pg_dump` (session
  pooler, pg17 client) at 09:17 UTC, encrypts with AES-256, and uploads a
  14-day-retention Actions artifact. Repo is PUBLIC, so the plaintext dump
  must never be uploaded — encryption is load-bearing, not optional.
  TWO targets on one schedule (a `fail-fast: false` matrix, so one
  target's failure never cancels the other's backup): **staging**
  (`SUPABASE_DB_URL` + `BACKUP_PASSPHRASE`, artifact
  `db-staging-YYYY-MM-DD.dump.enc`) and **production**
  (`SUPABASE_DB_URL_PROD` + `BACKUP_PASSPHRASE_PROD`, artifact
  `db-prod-YYYY-MM-DD.dump.enc`). The two passphrases are deliberately
  different values; both are kept in the password manager — losing one
  makes that target's backups unreadable. The nightly connection doubles
  as the free-tier keep-alive for both projects. Restore commands are in
  the workflow header; for a local restore use `pnpm db:local:refresh`
  (see § Local database from backups). Watch for GitHub's
  60-days-of-repo-inactivity cron disable; re-enable from the Actions
  tab if it trips.
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

## Local database from backups (#85)

Local dev against an empty schema hides most content bugs. `pnpm db:local:refresh`
restores the newest nightly encrypted backup into a local Docker Postgres, so
`/articles`, the block-built pages, and the admin all run on real data.

**One-time setup**

1. Docker Desktop running, then `docker compose up -d --wait db`.
   `docker-compose.yml` (repo root) runs `pgvector/pgvector:pg16` — deliberately
   the same image as the CI e2e job's Postgres service — on 5432, database
   `bp_portfolio_dev`, user/password `postgres`/`postgres`, data in the named
   volume `bp_portfolio_pgdata`.
2. `gh auth login` — the backups are private Actions artifacts.
3. Postgres client tools **>= 17** on PATH (`brew install postgresql@17`). The
   backup workflow dumps with a pg17 client, and an older `pg_restore` cannot
   read the dump. The server being 16 while the client is 17 is fine and
   intended; the script refuses to run with an older client.
4. Put the passphrase in `.env.local` (git-ignored, never committed):
   `BACKUP_PASSPHRASE_PROD` for production backups (the default source) or
   `BACKUP_PASSPHRASE` for staging. Values live in the password manager; only
   the NAMES appear anywhere in this repo.
5. Point the app at the container:
   `DATABASE_URI=postgres://postgres:postgres@127.0.0.1:5432/bp_portfolio_dev`
   in `.env.local`. Swap back to the remote by editing that one string. Never
   set a container URL in any Vercel scope.

**Refreshing**

```bash
pnpm db:local:refresh                       # newest PRODUCTION backup (default)
pnpm db:local:refresh --source staging      # staging instead
pnpm db:local:refresh --dry-run             # every preflight, print the plan, touch nothing
pnpm db:local:refresh --port 5433           # alternate port (see below)
```

Pass the flags directly, with no `--` separator. pnpm forwards a `--` to the
script verbatim (npm strips it), so the separator is not needed here; the
script tolerates it either way.

The script (`scripts/dev-db-restore.sh`) finds the newest **successful**
`db-backup.yml` run, downloads that target's artifact
(`db-prod-*.dump.enc` / `db-staging-*.dump.enc`), decrypts it with the
workflow header's exact `openssl` invocation, drops and recreates
`bp_portfolio_dev`, restores with `--clean --if-exists --no-owner
--no-privileges`, and prints `pages` / `posts` / `payload_migrations` row
counts. Then: `pnpm migrate` (expect nothing to run) and `pnpm dev`.

**Things worth knowing**

- **`pg_restore` exiting non-zero is normal here.** The 2026-08-30 production
  restore reported **4 ignored errors** and was completely correct. What
  actually shows up, in order of likelihood:
  - `SET transaction_timeout` — a server setting on the Postgres 17 the dump
    came from that the Postgres 16 container does not know.
  - The `supabase_vault` extension and the `vault.secrets` COPY that follows
    it — Supabase-image-only, with no counterpart in the pgvector image.
  - Supabase roles (`anon`, `authenticated`, `supabase_admin`) that do not
    exist locally, for any statement that names one.

  The row counts printed afterwards are the real check — the script fails
  loudly if a core table is missing or empty.

- **The plaintext dump never lands in the repo.** It is written to a private
  temp directory outside the working tree and removed on every exit path,
  including Ctrl-C. This deviates from the original plan's `.tmp-backup/`
  location on purpose: the repo is public and the dump contains drafts, gated
  content, contact emails, and the users table.
- **Port conflicts.** If a system Postgres already owns 5432, change the
  published port in `docker-compose.yml` to `127.0.0.1:5433:5432` (keep the
  loopback prefix — the container holds real content behind the well-known
  `postgres` password, so it must never listen beyond the machine), pass
  `--port 5433`, and update `DATABASE_URI`. Do not assume the remap took — a system cluster
  listening on 5433 has silently shadowed the container before. Confirm with
  `docker compose ps` and `psql -h 127.0.0.1 -p <port> -U postgres -l`.
- **Artifacts expire after 14 days**, and because the workflow's matrix runs
  both targets with `fail-fast: false`, a run where _either_ target failed is
  reported as failed and skipped by the "newest successful run" lookup. If the
  restore says it found no successful run, dispatch `db-backup.yml` by hand.
- **Restored data is real.** It holds live content and the users table. Never
  commit it, never attach it to an issue, never upload it anywhere.
- Preflight failures are pinned by `scripts/dev-db-restore.test.ts` (stubbed
  PATH, no network, no Docker); the real download/decrypt/restore is not
  covered by any test and is verified by running the command above.

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
