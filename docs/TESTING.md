# Testing

## Layers

- **Unit/component** — Vitest + Testing Library (jsdom). Co-located
  `*.test.ts(x)`. Pattern reference: `ArticlesExplorer.test.tsx` (next/*
  mocks), `TechCard.test.tsx` (aria-expanded toggle), `canAccess.test.ts`.
- **E2E** — Playwright (`e2e/`), production server in CI
  (`pnpm test:e2e`). Sandboxed runners can pin the browser via
  `PLAYWRIGHT_EXECUTABLE_PATH`. Conditional skips guard content-dependent
  specs (e.g. empty article DB).
- **Storybook** — `pnpm build-storybook` is a CI gate (story breakage);
  a11y addon fails stories on serious violations. Interaction tests via
  `@storybook/addon-vitest` are planned (vitest projects split pending).
- **Evals** — Evalite for Hermes (see `docs/AI.md`).

## CI (`.github/workflows/ci.yml`)

Quality job: lint (ESLint + tsdoc) → prettier check → typecheck → generated
payload-types staleness gate → generated importMap staleness gate → unit
tests + coverage → Storybook build. E2E job: pgvector/pg16 service,
migrations, production build, Playwright. Evalite job runs when a provider
key secret is present.

## Policy

- Behavior change ⇒ test change in the same commit (component or e2e for UI,
  unit for logic, eval for Hermes).
- Bug fixes ship a regression test that failed before the fix.
- Motion/a11y changes validate the keyboard path and reduced-motion
  rendering.
- If no test accompanies a change, say why in the PR notes.
