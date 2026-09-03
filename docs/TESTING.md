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
  sandboxes pin the browser via `PLAYWRIGHT_EXECUTABLE_PATH`
  (`PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium pnpm test:storybook`, plus an
  optional story path to narrow the run — never run `playwright install` in a
  sandbox).
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

### Asserting CSS state (`:hover`, `:focus-visible`) in a play function

`userEvent` from `storybook/test` dispatches **synthetic** pointer events. They
drive React handlers correctly, but they never move the browser's own pointer,
so the element does not enter CSS `:hover` and a `…:hover { }` rule never
matches — a story that reads `getComputedStyle()` after `userEvent.hover()`
silently measures the resting style. Only `vitest/browser`'s `userEvent` has a
real (Playwright) pointer, and it exists **only under `pnpm test:storybook`**:
`vitest/browser` resolves to a module that throws at import outside the runner,
so it must be loaded lazily and never imported statically — a static import
kills the whole story module in `pnpm storybook` and, because rolldown
tree-shakes the throw and folds the export to `null`, ships `null.hover(…)`
into the built canvas while `pnpm build-storybook` stays green. **That gate
cannot see this class of breakage**; grep the built chunk, or import the story
module in a running canvas, to check. Gate the lazy import on
`typeof import.meta.env.VITEST_STORYBOOK !== 'undefined'` — a build-time flag
simple enough for rolldown to fold, so the canvas drops the import entirely.
**Do not gate on `import.meta.env.VITEST`: it is undefined in browser mode**
(Vitest sets `process.env.VITEST` in Node only), and it silently skipped every
CSS-state assertion while the suite still reported 7/7. Separately, decide
"are we in the runner _now_?" with `globalThis.__vitest_browser_runner__`.
Then **fail closed**: if the runner marker is present but no real pointer was
obtained, throw — a story must never report green under the runner without
having engaged `:hover`. The `console.warn`-and-skip path is for the canvas
only, and assertions that need no pointer (focus outline, resting fill) stay on
both paths. `CorvusChat.stories.tsx` is the reference — see the `@remarks` on
its `getRealUserEvent()`. **When you rely on a skip path, grep the run output
for the skip string and expect zero hits**; a green run alone does not prove
the assertions ran. Two
corollaries: assert transitioned properties through `waitFor` rather than a
single sample (a `transition: box-shadow 150ms` reads its start value on the
frame the pointer lands), and never let a negative assertion be the only one in
a hover story — prove the state engaged first. Note also that `tab()` from
`storybook/test` is synthetic: whether it lands as `:focus-visible` rides on
Chromium's last-interaction heuristic (a real pointer _press_ resets it; a
hover does not), so assert `matches(':focus-visible')` rather than assuming it.

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
