# Workflow

## Package management

- **pnpm only** — enforced by `preinstall: npx only-allow pnpm` and the
  `packageManager` pin (Corepack). Vercel needs
  `ENABLE_EXPERIMENTAL_COREPACK=1`.
- pnpm 11 settings live in `pnpm-workspace.yaml` (overrides + `allowBuilds`
  with real boolean values). Native-build approvals go there, not
  package.json.
- Dependency majors are pinned. All `payload` + `@payloadcms/*` packages move
  in lockstep — never upgrade one alone.

## Branching & releases

- GitFlow since the v4 cutover: `master` → production
  ([brandonperfetti.com](https://brandonperfetti.com)); `develop` →
  integration; the active QA branch serves
  [staging.brandonperfetti.com](https://staging.brandonperfetti.com).
- One branch per wave off `develop`, small conventional commits
  (`feat(scope): …`, `fix(scope): …`) with `Refs #n`, one PR into `develop`
  (CodeRabbit + full CI), staging QA, then a develop→master release PR
  worked to review-clean before merge.

## Local hooks

- Husky pre-commit: lint-staged (prettier + eslint on staged files).
- Pre-push: format check + lint + typecheck + unit tests. `pnpm lint` is
  `eslint . --max-warnings=0`, so a single ESLint or tsdoc warning fails the
  push and CI alike — one gate, defined in one place (`package.json`). Stale
  `.next` types can false-fail the push — remove `.next` and retry before
  suspecting real breakage.

## Pre-push: the pg integration tier

The Husky pre-push hook above does **not** cover the Postgres integration
tier. Run it by hand before pushing anything that touches Payload hooks,
page hierarchy, redirects or the Corvus embeddings store:

```bash
# export DATABASE_URI and PAYLOAD_SECRET first (values in .env.local)
pnpm exec vitest run --root evals
```

Two properties of this tier decide how its fixtures must be written:

- **Its files run in parallel workers against ONE database.** A "sweep
  everything that isn't mine" assertion is therefore a race, not a baseline —
  on CI the database is freshly migrated and empty, so a sibling file's
  fixture is the only thing such a sweep can ever see. Snapshot the baseline
  **by id** in `beforeAll`, assert exactly those ids, and unwind fixtures in
  the test's own `try/finally`.
  `[measured: PR #179 build-e2e failure + deterministic single-file repro]`
- **A green local run does not clear an order-dependent flake.** Both lanes
  and three reruns were 324/324 before CI failed on exactly this. Run the tier
  anyway — it catches most things — but **CI arbitrates.**

## AI eval gate

- Branches touching the Corvus eval harness or eval-adjacent config
  (`evals/**`, guardrails, eval scripts/workflow) get **one keyed local
  `pnpm eval:ci` run before push** (Brandon runs it) — CI's first keyed run
  must not be the first observation of eval behavior. The floors themselves
  are invariants (see `CLAUDE.md`): fix the behavior or the harness, never
  lower a floor to get green.

## Generated files

After schema/plugin changes run `pnpm generate:types` and
`pnpm generate:importmap`, commit the results (CI gates staleness). These
files are prettier-ignored — never hand-format them.

## Local database

Local verification runs against a **restore of production**, not a
hand-seeded database: `pnpm db:local:refresh` (`scripts/dev-db-restore.sh`,
#85) pulls the latest encrypted dump, decrypts it with the passphrase from
`.env.local` (`BACKUP_PASSPHRASE_PROD` for prod, `BACKUP_PASSPHRASE` for
staging — both documented in `.env.example`, values in 1Password) and restores
it locally. Anything that touches content shape, metadata or media is tried
there first; staging is for verifying the deploy, not for discovering the bug.

One consequence worth stating: a restored database references blob-hosted
media, so `BLOB_READ_WRITE_TOKEN` must be set locally or every image 404s.

## Review

- CodeRabbit reviews PRs; triage suggestions against product intent — apply,
  or note why skipped (inline comment only when non-obvious).
- **Two configuration facts worth knowing before you wait on a review:** the
  Essentials plan **skips draft PRs** by default (set
  `reviews.auto_review.drafts: true` to change it), and the path filters
  exclude `src/migrations/**` and `payload-types.ts` — so a finding about a
  migration arrives attached to the _collection_ file that generated it, not
  to the migration. `[source: review 5126093754 header]`
- **Declining a finding is a per-thread argument with receipts**, not a
  dismissal: name the file, the test, or the documented ops order that makes
  the finding wrong. CodeRabbit's learnings system reads those replies and
  suppresses the pattern on later PRs, so a well-argued decline pays forward.
  `"Fixed in <sha>"` on an accepted finding produces a learning the same way.
  `[measured: #179 F2 decline, runbook order quoted]`
- **Oversized release PRs:** when CodeRabbit declines a PR for size (>150
  files), first force a review with `@coderabbitai review`; if it still
  declines, the review gate is satisfied only by every constituent commit
  having already passed a worked-to-clean CodeRabbit round on its own PR —
  cumulative coverage, not a waiver (ratified at the waves-2+3 release,
  PR #127).
- **Re-running a failed PR check replays the original merge snapshot** — it
  does not pick up new base-branch state. To test against the updated base,
  update the branch (merge the base in) and let checks run fresh.
- GitGuardian: the CI `PAYLOAD_SECRET: "ci-not-a-real-secret"` literal is an
  intentional dummy — dismiss as false positive.

## Secrets

`.env*` never enters git; `.env.example` documents every variable. Brandon
populates Vercel/GitHub secrets as features land.
