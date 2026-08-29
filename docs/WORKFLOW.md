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

## Generated files

After schema/plugin changes run `pnpm generate:types` and
`pnpm generate:importmap`, commit the results (CI gates staleness). These
files are prettier-ignored — never hand-format them.

## Review

- CodeRabbit reviews PRs; triage suggestions against product intent — apply,
  or note why skipped (inline comment only when non-obvious).
- GitGuardian: the CI `PAYLOAD_SECRET: "ci-not-a-real-secret"` literal is an
  intentional dummy — dismiss as false positive.

## Secrets

`.env*` never enters git; `.env.example` documents every variable. Brandon
populates Vercel/GitHub secrets as features land.
