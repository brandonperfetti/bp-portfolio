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
- **Evals** — Evalite for Hermes (see `docs/AI.md`).

## CI (`.github/workflows/ci.yml`)

Quality job: lint (ESLint + tsdoc) → prettier check → typecheck → generated
payload-types staleness gate → generated importMap staleness gate → unit
tests + coverage → Storybook build. E2E job: pgvector/pg16 service,
migrations, production build, Playwright e2e, then Storybook interaction
tests (reuses the job's installed Chromium). Evalite job runs when a
provider key secret is present.

## Policy

- Behavior change ⇒ test change in the same commit (component or e2e for UI,
  unit for logic, eval for Hermes).
- Bug fixes ship a regression test that failed before the fix.
- Motion/a11y changes validate the keyboard path and reduced-motion
  rendering.
- If no test accompanies a change, say why in the PR notes.
