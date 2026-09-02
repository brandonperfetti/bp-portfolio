# Testing

## Layers

- **Unit/component** — Vitest + Testing Library (jsdom), the `unit`
  project (`pnpm test` = `vitest run --project=unit`). Co-located
  `*.test.ts(x)`. Pattern reference: `ArticlesExplorer.test.tsx` (next/*
  mocks), `TechCard.test.tsx` (aria-expanded toggle), `canAccess.test.ts`.
- **E2E** — Playwright (`e2e/`), production server in CI
  (`pnpm test:e2e`). Sandboxed runners can pin the browser via
  `PLAYWRIGHT_EXECUTABLE_PATH`. Conditional skips guard content-dependent
  specs (e.g. empty article DB).
- **Storybook** — `pnpm build-storybook` is a CI gate (story breakage);
  a11y addon fails stories on serious violations. **Interaction tests**:
  `@storybook/addon-vitest` runs every story as a Vitest browser-mode test
  (Playwright Chromium) — the `storybook` project, `pnpm test:storybook`.
  `play` functions are the interactions (composer typing/refocus, FAQ
  accordion, link resolution). Notes: preview sets
  `nextjs.appDirectory: true` (next/navigation mocks need it or
  `useRouter` throws), the project's alias array stubs the server blocks
  before `@/` resolves (mirrors `.storybook/main.ts` viteFinal), and
  sandboxes pin the browser via `PLAYWRIGHT_EXECUTABLE_PATH`.
- **Payload pipeline integration** — `evals/*.test.ts` also hosts tests that
  need a REAL Payload on a REAL Postgres (the `e2e` job's `pgvector/pgvector:pg16`
  service plus `pnpm migrate`); run by `pnpm exec vitest run --root evals`.
  `slug-redirect-integration.test.ts` is the reference: it drives the actual
  update/versions/drafts pipeline. **Mock `payload.find` at your peril** — #120
  shipped a broken hook twice because the mocked unit tier could not reproduce
  Payload's `req.context` swap on nested Local API calls. Anything that depends
  on hook plumbing rather than its own branching belongs here.
- **Evals** — Evalite for Corvus, run from the `evals/` root and **gating** as
  of #82; `evals/*.test.ts` run in `e2e` via `vitest run --root evals`, not in
  `pnpm test` (see `docs/AI.md` §Evals).

## CI (`.github/workflows/ci.yml`)

Quality job: lint (ESLint + tsdoc) → prettier check → typecheck → generated
payload-types staleness gate → generated importMap staleness **and
plausibility** gate (`scripts/check-importmap.mjs`, #131 — staleness alone
cannot see an empty map, because empty regenerated as empty is not stale; it
runs between the regenerate and the diff so it judges freshly generated
content) → committed-migration gate (#116) → new-table RLS gate
(`scripts/check-migrations-rls.mjs`, #117) → unit tests + coverage → Storybook
build. E2E job: pgvector/pg16 service,
migrations, production build, Playwright e2e, then Storybook interaction
tests (reuses the job's installed Chromium). Evalite job runs when a
provider key secret is present.

## Running e2e locally (the only trustworthy local signal)

`playwright.config.ts` branches on `CI`. Reproduce what CI actually runs:

```bash
pnpm seed:e2e                 # deterministic content the specs assert on
pnpm build                    # the `isCi` branch serves `pnpm start`, not `pnpm dev`
CI=1 pnpm test:e2e            # forbidOnly, retries: 2, workers: 1, production server
```

Under `CI=1` the config's `webServer.command` is `pnpm start` and
`reuseExistingServer` is false, so the suite gets a freshly booted production
build — the same shape as the `Build · E2E` job. **Run it this way before
believing a local result.**

Without `CI`, `webServer.command` is `pnpm dev`, and dev-mode e2e keeps the
seed/hydration flakiness the wave-1 work ran into: specs race the dev server's
on-demand compilation and hydration, and an unseeded or half-seeded database
turns content assertions into coin flips. A green dev-mode run is not evidence
that the suite passes; a red one is not evidence that it fails.

Two related notes:

- The suite drives the app at `http://127.0.0.1:3000` (`use.baseURL`). Next
  blocks cross-origin requests to its dev-only `/_next` and `/__nextjs`
  endpoints, and its built-in allowlist covers only `localhost`, so
  `next.config.mjs` carries `allowedDevOrigins: ['127.0.0.1']` (#119). The key
  is dev-only — it has no effect on `next build` / `next start`, which is what
  `CI=1` uses.
- **Home sticky rail** — if the home rail does not stick, check the DATA
  before the code. Sticky is a per-column CHECKBOX on the Column block
  (`src/blocks/Column/config.ts`, `sticky`, label "Stick to the top while
  scrolling", `defaultValue: false`), and it only applies from the `lg`
  breakpoint up. The one-line check: open Pages → `home` in the admin and
  confirm that checkbox is ticked on the rail column. Unticked is a content
  edit, not a bug — no code change will fix it.

## Policy

- Behavior change ⇒ test change in the same commit (component or e2e for UI,
  unit for logic, eval for Corvus).
- Bug fixes ship a regression test that failed before the fix.
- Motion/a11y changes validate the keyboard path and reduced-motion
  rendering.
- If no test accompanies a change, say why in the PR notes.
