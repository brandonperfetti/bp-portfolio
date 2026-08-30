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

- `master` — v3 production. Frozen until v4 launch sign-off.
- `rebuild/v4` — active v4 branch; auto-deploys the Vercel `staging`
  environment. Work lands here in small conventional commits
  (`feat(scope): …`, `fix(scope): …`) with a draft PR and phase status
  comments.
- After merge, `develop` becomes the integration branch and staging retargets
  to it (planned).

## Local hooks

- Husky pre-commit: lint-staged (prettier + eslint on staged files).
- Pre-push: format check + lint + typecheck + unit tests. `pnpm lint` is
  `eslint . --max-warnings=0`, so a single ESLint or tsdoc warning fails the
  push and CI alike — one gate, defined in one place (`package.json`). Stale
  `.next` types can false-fail the push — remove `.next` and retry before
  suspecting real breakage.

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

## Review

- CodeRabbit reviews PRs; triage suggestions against product intent — apply,
  or note why skipped (inline comment only when non-obvious).
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
